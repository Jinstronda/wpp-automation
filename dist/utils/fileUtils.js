import fs from 'fs';
import path from 'path';
export function readLeadsCsv(csvPath) {
    const abs = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
    if (!fs.existsSync(abs))
        return [];
    const raw = fs.readFileSync(abs, 'utf8');
    return parseLeadsFromCsvContent(raw);
}
export function parseLeadsFromCsvContent(csvContent) {
    const lines = csvContent.split(/\r?\n/).filter(Boolean);
    const [headerLine, ...rows] = lines;
    if (!headerLine)
        return [];
    // Parse CSV with proper comma handling (including commas within quoted fields)
    const headers = parseCSVLine(headerLine);
    // Check for Google Maps format: Title,Rating,Reviews,Phone,Industry,Address,Website,Google Maps Link
    const isGoogleMapsFormat = headers.includes('Title') && headers.includes('Phone') && headers.includes('Industry');
    let leads;
    if (isGoogleMapsFormat) {
        leads = parseGoogleMapsFormat(headers, rows);
    }
    else {
        leads = parseLegacyFormat(headers, rows);
    }
    // STEP 1: Deduplicate within CSV (same business/phone appears multiple times)
    leads = deduplicateLeads(leads);
    // STEP 2: Clean and validate all phone numbers (especially Portuguese)
    leads = cleanAndValidatePhones(leads);
    console.log(`✅ CSV Parsed: ${leads.length} valid contacts after cleaning and deduplication`);
    return leads;
}
function parseCSVLine(line) {
    const result = [];
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
            }
            else {
                // Toggle quote state
                inQuotes = !inQuotes;
                i++;
            }
        }
        else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim());
            current = '';
            i++;
        }
        else {
            current += char;
            i++;
        }
    }
    // Add the last field
    result.push(current.trim());
    return result;
}
function parseGoogleMapsFormat(headers, rows) {
    const leads = [];
    // Detect column indices dynamically based on headers
    const phoneIndex = headers.findIndex(h => h.toLowerCase().includes('phone') && !h.toLowerCase().includes('additional'));
    const additionalPhonesIndex = headers.findIndex(h => h.toLowerCase().includes('additional') && h.toLowerCase().includes('phone'));
    const cityIndex = headers.findIndex(h => h.toLowerCase().includes('city'));
    const industryIndex = headers.findIndex(h => h.toLowerCase().includes('industry'));
    const emailIndex = headers.findIndex(h => h.toLowerCase().includes('email'));
    console.log(`📋 CSV Column Mapping: Phone=${phoneIndex}, Additional_phones=${additionalPhonesIndex}, City=${cityIndex}`);
    for (const row of rows) {
        const values = parseCSVLine(row);
        if (values.length < headers.length)
            continue;
        // If there's no primary "Phone" column, use first phone from Additional_phones
        let primaryPhone = phoneIndex >= 0 ? values[phoneIndex] : '';
        let additionalPhones = additionalPhonesIndex >= 0 ? values[additionalPhonesIndex] : '';
        // If no primary phone column, extract first valid phone from Additional_phones
        if (!primaryPhone && additionalPhones) {
            const phones = additionalPhones.split(',').map(p => p.trim()).filter(Boolean);
            if (phones.length > 0) {
                primaryPhone = phones[0];
                additionalPhones = phones.slice(1).join(', '); // Rest become additional
            }
        }
        const lead = {
            name: values[0] || 'Unknown', // Title
            phone: primaryPhone || '', // Primary phone or first from Additional_phones
            businessName: values[0] || 'Unknown Business', // Title as business name
            title: values[0],
            rating: values[1],
            reviews: values[2],
            industry: industryIndex >= 0 ? values[industryIndex] : values[3], // Fallback to index 3
            address: values[4],
            website: values[5],
            googleMapsLink: values[6],
            email: emailIndex >= 0 ? values[emailIndex] : values[7],
            additionalPhones: additionalPhones,
            city: cityIndex >= 0 ? values[cityIndex] : values[9] // Detect or fallback
        };
        // Only add if we have a phone number
        if (lead.phone && lead.phone.trim()) {
            leads.push(lead);
        }
        else {
            console.log(`⏭️ Skipping row with no phone: ${lead.name}`);
        }
    }
    return leads;
}
function parseLegacyFormat(headers, rows) {
    const leads = [];
    for (const row of rows) {
        const values = parseCSVLine(row);
        if (values.length < headers.length)
            continue;
        const lead = {
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
// CSV Cleaning and Validation Functions
/**
 * Deduplicate leads within CSV by normalized phone number
 * If same phone appears multiple times, keep first occurrence
 */
function deduplicateLeads(leads) {
    const seen = new Set();
    const deduplicated = [];
    for (const lead of leads) {
        const normalized = normalizePhoneNumber(lead.phone);
        if (!seen.has(normalized)) {
            seen.add(normalized);
            deduplicated.push(lead);
        }
        else {
            console.log(`🔄 CSV Dedup: Skipping duplicate ${lead.name} (${normalized})`);
        }
    }
    console.log(`📊 CSV Deduplication: ${leads.length} → ${deduplicated.length} (removed ${leads.length - deduplicated.length} duplicates)`);
    return deduplicated;
}
// Phone number utility functions (must be defined before use)
export function normalizePhoneNumber(phone) {
    return phone.replace(/\D/g, '');
}
export function extractPhoneWithCountry(phone) {
    try {
        console.log(`🔍 [DEBUG] extractPhoneWithCountry input: "${phone}"`);
        const normalized = normalizePhoneNumber(phone);
        console.log(`🔍 [DEBUG] Normalized: "${normalized}"`);
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
                const result = { country, localNumber: match[1] };
                console.log(`🔍 [DEBUG] Match found - Country: ${country.name}, Local: ${match[1]}`);
                return result;
            }
        }
        // Default to Portugal if no country code detected
        const defaultResult = { country: { name: 'Portugal', code: 'PT', prefix: '+351' }, localNumber: normalized };
        console.log(`🔍 [DEBUG] No country match - defaulting to Portugal, Local: ${normalized}`);
        return defaultResult;
    }
    catch (error) {
        console.error(`❌ [ERROR] extractPhoneWithCountry failed for phone: "${phone}"`, error);
        throw error;
    }
}
/**
 * Portuguese phone validation
 * Mobile (WhatsApp): +351 9XXXXXXXX
 * Landline (NO WhatsApp): +351 21, +351 28, +351 24, etc.
 */
function isPortugueseMobile(phone) {
    const normalized = normalizePhoneNumber(phone);
    // Portuguese format: 351 9XXXXXXXX (9 total digits after country code)
    if (normalized.startsWith('351')) {
        const afterCountryCode = normalized.substring(3);
        // Mobile starts with 9 and has 9 digits total
        if (afterCountryCode.startsWith('9') && afterCountryCode.length === 9) {
            return true;
        }
        // Landline patterns (21, 28, 24, etc.) - NO WhatsApp
        if (afterCountryCode.match(/^(21|22|23|24|25|26|27|28|29)/)) {
            console.log(`📞 Skipping Portuguese landline: +351 ${afterCountryCode}`);
            return false;
        }
    }
    return true; // Not Portuguese or valid mobile
}
/**
 * Extract and validate all phones from Phone + Additional_phones fields
 * Returns array of valid WhatsApp-capable phone numbers WITHOUT country code
 * (Country code 351 is already selected in WhatsApp dropdown)
 */
function extractValidPhones(primaryPhone, additionalPhones) {
    try {
        console.log(`🔍 [DEBUG] extractValidPhones - Primary: "${primaryPhone}", Additional: "${additionalPhones}"`);
        const validPhones = [];
        const allPhones = [];
        // Add primary phone
        if (primaryPhone && primaryPhone.trim()) {
            allPhones.push(primaryPhone.trim());
        }
        // Add additional phones (comma-separated)
        if (additionalPhones && additionalPhones.trim()) {
            const extras = additionalPhones.split(',').map(p => p.trim()).filter(Boolean);
            allPhones.push(...extras);
        }
        console.log(`🔍 [DEBUG] Total phones to process: ${allPhones.length}`);
        // Validate each phone
        const seen = new Set();
        for (const phone of allPhones) {
            try {
                console.log(`🔍 [DEBUG] Processing phone: "${phone}"`);
                const normalized = normalizePhoneNumber(phone);
                // Skip duplicates within same contact
                if (seen.has(normalized)) {
                    console.log(`🔄 Skipping duplicate phone within contact: ${normalized}`);
                    continue;
                }
                // Validate Portuguese phones
                if (!isPortugueseMobile(phone)) {
                    console.log(`🔍 [DEBUG] Phone "${phone}" is not Portuguese mobile - skipping`);
                    continue; // Skip landlines
                }
                // Extract local number without country code (351)
                // WhatsApp country dropdown already has +351 selected
                const { localNumber } = extractPhoneWithCountry(phone);
                console.log(`🔍 [DEBUG] Extracted local number: "${localNumber}"`);
                // Valid phone
                seen.add(normalized);
                validPhones.push(localNumber); // Store WITHOUT country code
            }
            catch (error) {
                console.error(`❌ [ERROR] Failed processing phone "${phone}":`, error);
                throw error;
            }
        }
        console.log(`🔍 [DEBUG] extractValidPhones result: ${validPhones.length} valid phones:`, validPhones);
        return validPhones;
    }
    catch (error) {
        console.error(`❌ [ERROR] extractValidPhones failed:`, error);
        throw error;
    }
}
/**
 * Clean and validate all phone numbers in leads
 * - Merges Phone + Additional_phones
 * - Validates Portuguese numbers (skips landlines)
 * - Creates separate lead entries for each valid phone
 */
function cleanAndValidatePhones(leads) {
    const cleanedLeads = [];
    for (const lead of leads) {
        // Extract all valid phones for this business
        const validPhones = extractValidPhones(lead.phone, lead.additionalPhones);
        if (validPhones.length === 0) {
            console.log(`⏭️ Skipping ${lead.name}: No valid WhatsApp phones`);
            continue;
        }
        // Use first valid phone as primary
        const cleanedLead = {
            ...lead,
            phone: validPhones[0],
            additionalPhones: validPhones.length > 1 ? validPhones.slice(1).join(', ') : undefined
        };
        cleanedLeads.push(cleanedLead);
        if (validPhones.length > 1) {
            console.log(`✅ ${lead.name}: Using phone ${validPhones[0]} (${validPhones.length - 1} additional valid)`);
        }
    }
    console.log(`📱 Phone Validation: ${leads.length} → ${cleanedLeads.length} (removed ${leads.length - cleanedLeads.length} invalid)`);
    return cleanedLeads;
}
// Advanced phone number processing functions
// (normalizePhoneNumber and extractPhoneWithCountry are defined above to avoid circular dependencies)
export function validatePhonePreFlight(phone, name) {
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
export function markContactProcessed(name, phone, status, error) {
    try {
        const trackingData = loadContactTracking();
        const normalizedPhone = normalizePhoneNumber(phone);
        const contact = {
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
        }
        else {
            trackingData.push(contact);
        }
        saveContactTracking(trackingData);
        console.log(`📝 Contact tracked: ${name} (${normalizedPhone}) - ${status}`);
    }
    catch (error) {
        console.error('Failed to track contact:', error);
    }
}
export function isContactProcessed(name, phone) {
    try {
        const trackingData = loadContactTracking();
        const normalizedPhone = normalizePhoneNumber(phone);
        return trackingData.some(contact => contact.name === name && contact.phone === normalizedPhone);
    }
    catch (error) {
        console.error('Failed to check contact status:', error);
        return false;
    }
}
function loadContactTracking() {
    try {
        if (!fs.existsSync(CONTACT_TRACKING_FILE)) {
            return [];
        }
        const data = fs.readFileSync(CONTACT_TRACKING_FILE, 'utf8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Failed to load contact tracking:', error);
        return [];
    }
}
function saveContactTracking(data) {
    try {
        // Ensure directory exists
        const dir = path.dirname(CONTACT_TRACKING_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CONTACT_TRACKING_FILE, JSON.stringify(data, null, 2));
    }
    catch (error) {
        console.error('Failed to save contact tracking:', error);
    }
}
// Utility functions for CSV processing
export function writeLeadsCsv(leads, csvPath) {
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
export function getContactStats() {
    try {
        const trackingData = loadContactTracking();
        return {
            total: trackingData.length,
            processed: trackingData.filter(c => c.status === 'processed').length,
            notOnWhatsApp: trackingData.filter(c => c.status === 'not_on_whatsapp').length,
            failed: trackingData.filter(c => c.status === 'failed').length,
            invalidPhone: trackingData.filter(c => c.status === 'invalid_phone').length
        };
    }
    catch (error) {
        console.error('Failed to get contact stats:', error);
        return { total: 0, processed: 0, notOnWhatsApp: 0, failed: 0, invalidPhone: 0 };
    }
}
export function processMessageTemplate(template, contact) {
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
