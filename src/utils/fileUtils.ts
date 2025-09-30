export type Lead = {
	name: string;
	phone: string;
	businessName: string;
	promptVariant?: string;
	// New Google Maps fields
	title?: string;
	rating?: string;
	reviews?: string;
	industry?: string;
	address?: string;
	website?: string;
	googleMapsLink?: string;
	email?: string;
	additionalPhones?: string;
	city?: string;
};

export type ContactStatus = {
	name: string;
	phone: string;
	status: 'processed' | 'not_on_whatsapp' | 'failed' | 'invalid_phone';
	timestamp: string;
	error?: string;
};

export type CountryInfo = {
	name: string;
	code: string;
	prefix: string;
};

import fs from 'fs';
import path from 'path';

export function readLeadsCsv(csvPath: string): Lead[] {
	const abs = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
	if (!fs.existsSync(abs)) return [];
	const raw = fs.readFileSync(abs, 'utf8');
	return parseLeadsFromCsvContent(raw);
}

export function parseLeadsFromCsvContent(csvContent: string): Lead[] {
	const lines = csvContent.split(/\r?\n/).filter(Boolean);
	const [headerLine, ...rows] = lines;
	if (!headerLine) return [];

	// Parse CSV with proper comma handling (including commas within quoted fields)
	const headers = parseCSVLine(headerLine);

	// Check for Google Maps format: Title,Rating,Reviews,Phone,Industry,Address,Website,Google Maps Link
	const isGoogleMapsFormat = headers.includes('Title') && headers.includes('Phone') && headers.includes('Industry');

	if (isGoogleMapsFormat) {
		return parseGoogleMapsFormat(headers, rows);
	} else {
		return parseLegacyFormat(headers, rows);
	}
}

function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				// Escaped quote
				current += '"';
				i += 2;
			} else {
				// Toggle quote state
				inQuotes = !inQuotes;
				i++;
			}
		} else if (char === ',' && !inQuotes) {
			// End of field
			result.push(current.trim());
			current = '';
			i++;
		} else {
			current += char;
			i++;
		}
	}

	// Add the last field
	result.push(current.trim());
	return result;
}

function parseGoogleMapsFormat(headers: string[], rows: string[]): Lead[] {
	const leads: Lead[] = [];

	for (const row of rows) {
		const values = parseCSVLine(row);
		if (values.length < headers.length) continue;

		const lead: Lead = {
			name: values[0] || 'Unknown', // Title
			phone: values[3] || '', // Phone
			businessName: values[0] || 'Unknown Business', // Title as business name
			title: values[0],
			rating: values[1],
			reviews: values[2],
			industry: values[4],
			address: values[5],
			website: values[6],
			googleMapsLink: values[7],
			email: values[8],
			additionalPhones: values[9],
			city: values[10]
		};

		// Only add if we have a phone number
		if (lead.phone && lead.phone.trim()) {
			leads.push(lead);
		}
	}

	return leads;
}

function parseLegacyFormat(headers: string[], rows: string[]): Lead[] {
	const leads: Lead[] = [];

	for (const row of rows) {
		const values = parseCSVLine(row);
		if (values.length < headers.length) continue;

		const lead: Lead = {
			name: values[0] || 'Unknown',
			phone: values[1] || '',
			businessName: values[2] || 'Unknown Business'
		};

		// Only add if we have a phone number
		if (lead.phone && lead.phone.trim()) {
			leads.push(lead);
		}
	}

	return leads;
}

// Advanced phone number processing functions
export function normalizePhoneNumber(phone: string): string {
	return phone.replace(/\D/g, '');
}

export function extractPhoneWithCountry(phone: string): { country: CountryInfo | null; localNumber: string } {
	const normalized = normalizePhoneNumber(phone);
	
	// Country detection logic
	const countryPatterns = [
		{ pattern: /^1(\d{10})$/, country: { name: 'United States', code: 'US', prefix: '+1' } },
		{ pattern: /^44(\d{10})$/, country: { name: 'United Kingdom', code: 'GB', prefix: '+44' } },
		{ pattern: /^49(\d{10,11})$/, country: { name: 'Germany', code: 'DE', prefix: '+49' } },
		{ pattern: /^33(\d{9})$/, country: { name: 'France', code: 'FR', prefix: '+33' } },
		{ pattern: /^34(\d{9})$/, country: { name: 'Spain', code: 'ES', prefix: '+34' } },
		{ pattern: /^39(\d{9,10})$/, country: { name: 'Italy', code: 'IT', prefix: '+39' } },
		{ pattern: /^351(\d{9})$/, country: { name: 'Portugal', code: 'PT', prefix: '+351' } },
		{ pattern: /^55(\d{10,11})$/, country: { name: 'Brazil', code: 'BR', prefix: '+55' } },
		{ pattern: /^86(\d{11})$/, country: { name: 'China', code: 'CN', prefix: '+86' } },
		{ pattern: /^81(\d{10,11})$/, country: { name: 'Japan', code: 'JP', prefix: '+81' } },
		{ pattern: /^91(\d{10})$/, country: { name: 'India', code: 'IN', prefix: '+91' } },
		{ pattern: /^61(\d{9})$/, country: { name: 'Australia', code: 'AU', prefix: '+61' } },
		{ pattern: /^1(\d{10})$/, country: { name: 'Canada', code: 'CA', prefix: '+1' } }
	];

	for (const { pattern, country } of countryPatterns) {
		const match = normalized.match(pattern);
		if (match) {
			return { country, localNumber: match[1] };
		}
	}

	// Default to Portugal if no country code detected
	return { country: { name: 'Portugal', code: 'PT', prefix: '+351' }, localNumber: normalized };
}

export function validatePhonePreFlight(phone: string, name: string): { isValid: boolean; reason: string; skipReason?: string } {
	const normalized = normalizePhoneNumber(phone);
	
	// Check if already processed (blacklist check)
	if (isContactProcessed(name, normalized)) {
		return {
			isValid: false,
			reason: 'Contact already processed (blacklisted)',
			skipReason: 'blacklist'
		};
	}
	
	// Check for test numbers
	const testNumbers = ['123456789', '987654321', '111111111', '000000000'];
	if (testNumbers.includes(normalized)) {
		return {
			isValid: false,
			reason: 'Test number detected',
			skipReason: 'test_number'
		};
	}
	
	// Basic format validation
	if (normalized.length < 7 || normalized.length > 15) {
		return {
			isValid: false,
			reason: 'Invalid phone number format (too short or too long)',
			skipReason: 'invalid_format'
		};
	}
	
	// Check for obviously invalid patterns
	if (/^(\d)\1{6,}$/.test(normalized)) {
		return {
			isValid: false,
			reason: 'Invalid phone number pattern (repeating digits)',
			skipReason: 'invalid_format'
		};
	}
	
	return { isValid: true, reason: 'Valid phone number' };
}

// Contact tracking functions
const CONTACT_TRACKING_FILE = path.join(process.cwd(), 'state', 'contact-tracking.json');

export function markContactProcessed(name: string, phone: string, status: 'processed' | 'not_on_whatsapp' | 'failed' | 'invalid_phone', error?: string): void {
	try {
		const trackingData = loadContactTracking();
		const normalizedPhone = normalizePhoneNumber(phone);
		
		const contact: ContactStatus = {
			name,
			phone: normalizedPhone,
			status,
			timestamp: new Date().toISOString(),
			error
		};
		
		// Add or update contact
		const existingIndex = trackingData.findIndex(c => c.name === name && c.phone === normalizedPhone);
		if (existingIndex >= 0) {
			trackingData[existingIndex] = contact;
		} else {
			trackingData.push(contact);
		}
		
		saveContactTracking(trackingData);
		console.log(`📝 Contact tracked: ${name} (${normalizedPhone}) - ${status}`);
	} catch (error) {
		console.error('Failed to track contact:', error);
	}
}

export function isContactProcessed(name: string, phone: string): boolean {
	try {
		const trackingData = loadContactTracking();
		const normalizedPhone = normalizePhoneNumber(phone);
		
		return trackingData.some(contact => 
			contact.name === name && contact.phone === normalizedPhone
		);
	} catch (error) {
		console.error('Failed to check contact status:', error);
		return false;
	}
}

function loadContactTracking(): ContactStatus[] {
	try {
		if (!fs.existsSync(CONTACT_TRACKING_FILE)) {
			return [];
		}
		
		const data = fs.readFileSync(CONTACT_TRACKING_FILE, 'utf8');
		return JSON.parse(data);
	} catch (error) {
		console.error('Failed to load contact tracking:', error);
		return [];
	}
}

function saveContactTracking(data: ContactStatus[]): void {
	try {
		// Ensure directory exists
		const dir = path.dirname(CONTACT_TRACKING_FILE);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		
		fs.writeFileSync(CONTACT_TRACKING_FILE, JSON.stringify(data, null, 2));
	} catch (error) {
		console.error('Failed to save contact tracking:', error);
	}
}

// Utility functions for CSV processing
export function writeLeadsCsv(leads: Lead[], csvPath: string): void {
	const abs = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
	const dir = path.dirname(abs);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const headers = ['name', 'phone', 'businessName', 'title', 'rating', 'reviews', 'industry', 'address', 'website', 'googleMapsLink'];
	const csvContent = [
		headers.join(','),
		...leads.map(lead => [
			`"${lead.name || ''}"`,
			`"${lead.phone || ''}"`,
			`"${lead.businessName || ''}"`,
			`"${lead.title || ''}"`,
			`"${lead.rating || ''}"`,
			`"${lead.reviews || ''}"`,
			`"${lead.industry || ''}"`,
			`"${lead.address || ''}"`,
			`"${lead.website || ''}"`,
			`"${lead.googleMapsLink || ''}"`
		].join(','))
	].join('\n');

	fs.writeFileSync(abs, csvContent, 'utf8');
}

export function getContactStats(): { total: number; processed: number; notOnWhatsApp: number; failed: number; invalidPhone: number } {
	try {
		const trackingData = loadContactTracking();
		
		return {
			total: trackingData.length,
			processed: trackingData.filter(c => c.status === 'processed').length,
			notOnWhatsApp: trackingData.filter(c => c.status === 'not_on_whatsapp').length,
			failed: trackingData.filter(c => c.status === 'failed').length,
			invalidPhone: trackingData.filter(c => c.status === 'invalid_phone').length
		};
	} catch (error) {
		console.error('Failed to get contact stats:', error);
		return { total: 0, processed: 0, notOnWhatsApp: 0, failed: 0, invalidPhone: 0 };
	}
}

export function processMessageTemplate(template: string, contact: Lead): string {
	let message = template;
	
	// Replace placeholders with contact data
	message = message.replace(/\{name\}/g, contact.name || '');
	message = message.replace(/\{businessName\}/g, contact.businessName || '');
	message = message.replace(/\{phone\}/g, contact.phone || '');
	message = message.replace(/\{title\}/g, contact.title || '');
	message = message.replace(/\{industry\}/g, contact.industry || '');
	message = message.replace(/\{address\}/g, contact.address || '');
	message = message.replace(/\{website\}/g, contact.website || '');
	message = message.replace(/\{rating\}/g, contact.rating || '');
	message = message.replace(/\{reviews\}/g, contact.reviews || '');
	message = message.replace(/\{email\}/g, contact.email || '');
	message = message.replace(/\{additionalPhones\}/g, contact.additionalPhones || '');
	message = message.replace(/\{city\}/g, contact.city || '');
	
	// Support for {{double-brace}} syntax as well
	message = message.replace(/\{\{business\}\}/g, contact.businessName || '');
	message = message.replace(/\{\{name\}\}/g, contact.name || '');
	message = message.replace(/\{\{address\}\}/g, contact.address || '');
	message = message.replace(/\{\{industry\}\}/g, contact.industry || '');
	message = message.replace(/\{\{city\}\}/g, contact.city || '');
	message = message.replace(/\{\{email\}\}/g, contact.email || '');
	message = message.replace(/\{\{website\}\}/g, contact.website || '');
	message = message.replace(/\{\{rating\}\}/g, contact.rating || '');
	message = message.replace(/\{\{reviews\}\}/g, contact.reviews || '');
	
	return message;
}