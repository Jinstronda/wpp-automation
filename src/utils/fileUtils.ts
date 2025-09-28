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
};

export type ContactStatus = {
	name: string;
	phone: string;
	status: 'processed' | 'not_on_whatsapp' | 'failed';
	timestamp: string;
	error?: string;
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

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === ',' && !inQuotes) {
			result.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}

	result.push(current.trim());
	return result;
}

function parseGoogleMapsFormat(headers: string[], rows: string[]): Lead[] {
	const titleIdx = headers.indexOf('Title');
	const ratingIdx = headers.indexOf('Rating');
	const reviewsIdx = headers.indexOf('Reviews');
	const phoneIdx = headers.indexOf('Phone');
	const industryIdx = headers.indexOf('Industry');
	const addressIdx = headers.indexOf('Address');
	const websiteIdx = headers.indexOf('Website');
	const googleMapsLinkIdx = headers.indexOf('Google Maps Link');

	const out: Lead[] = [];
	for (const row of rows) {
		const cols = parseCSVLine(row);
		if (cols.length < 4) continue; // Need at least Title, Phone

		const title = cols[titleIdx] || '';
		const phone = cols[phoneIdx] || '';
		const industry = cols[industryIdx] || '';
		const address = cols[addressIdx] || '';

		// Skip rows with empty required fields
		if (!title || !phone) continue;

		// Clean phone number - remove formatting characters
		const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
		if (!cleanPhone) continue;

		out.push({
			name: title, // Use business title as name
			phone: cleanPhone,
			businessName: title, // Use title as business name
			title: title,
			rating: cols[ratingIdx] || '',
			reviews: cols[reviewsIdx] || '',
			industry: industry,
			address: address,
			website: cols[websiteIdx] || '',
			googleMapsLink: cols[googleMapsLinkIdx] || ''
		});
	}
	return out;
}

function parseLegacyFormat(headers: string[], rows: string[]): Lead[] {
	const nameIdx = headers.indexOf('name');
	const phoneIdx = headers.indexOf('phone');
	const businessIdx = headers.indexOf('businessName');
	const promptIdx = headers.indexOf('promptVariant');

	// Validation: Check if required headers exist
	if (nameIdx === -1 || phoneIdx === -1 || businessIdx === -1) {
		throw new Error('CSV must contain headers: name, phone, businessName (or use Google Maps format: Title,Rating,Reviews,Phone,Industry,Address,Website,Google Maps Link)');
	}

	const out: Lead[] = [];
	for (const row of rows) {
		const cols = parseCSVLine(row);
		if (cols.length < 3) continue;

		const name = cols[nameIdx] || '';
		const phone = cols[phoneIdx] || '';
		const businessName = cols[businessIdx] || '';

		// Skip rows with empty required fields
		if (!name || !phone) continue;

		out.push({
			name,
			phone,
			businessName,
			promptVariant: promptIdx >= 0 ? (cols[promptIdx] || undefined) : undefined
		});
	}
	return out;
}

export function ensureJsonFile(filePath: string, fallback: unknown): void {
	const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
	if (!fs.existsSync(abs)) {
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, JSON.stringify(fallback, null, 2));
	}
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
	const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
	try {
		if (!fs.existsSync(abs)) return fallback;
		return JSON.parse(fs.readFileSync(abs, 'utf8')) as T;
	} catch {
		return fallback;
	}
}

export function writeJsonFile(filePath: string, data: unknown): void {
	const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, JSON.stringify(data, null, 2));
}

// Contact tracking functions
const CONTACT_TRACKING_FILE = 'state/contact-tracking.json';

export function getProcessedContacts(): ContactStatus[] {
	return readJsonFile<ContactStatus[]>(CONTACT_TRACKING_FILE, []);
}

export function markContactProcessed(name: string, phone: string, status: ContactStatus['status'], error?: string): void {
	const processedContacts = getProcessedContacts();

	// Remove any existing entry for this contact
	const filtered = processedContacts.filter(c => c.phone !== phone);

	// Add new entry
	filtered.push({
		name,
		phone,
		status,
		timestamp: new Date().toISOString(),
		error
	});

	writeJsonFile(CONTACT_TRACKING_FILE, filtered);
}

export function isContactProcessed(phone: string): ContactStatus | null {
	const processedContacts = getProcessedContacts();
	return processedContacts.find(c => c.phone === phone) || null;
}

export function normalizePhoneNumber(phone: string): string {
	// Remove all non-digit characters
	return phone.replace(/\D/g, '');
}

export function processMessageTemplate(template: string, lead: Lead): string {
	let message = template;

	// Replace template variables with lead data
	message = message.replace(/\{\{business\}\}/g, lead.businessName || lead.name || '');
	message = message.replace(/\{\{name\}\}/g, lead.name || '');
	message = message.replace(/\{\{address\}\}/g, lead.address || '');
	message = message.replace(/\{\{industry\}\}/g, lead.industry || '');
	message = message.replace(/\{\{title\}\}/g, lead.title || '');
	message = message.replace(/\{\{rating\}\}/g, lead.rating || '');
	message = message.replace(/\{\{reviews\}\}/g, lead.reviews || '');
	message = message.replace(/\{\{website\}\}/g, lead.website || '');

	return message;
}
