/**
 * Contacts Database Module
 *
 * Provides persistent storage and management for all contacts.
 * Stores full contact data including business information, status, and timestamps.
 * Handles deduplication based on normalized phone numbers.
 */

import fs from 'fs';
import path from 'path';
import { Lead, normalizePhoneNumber } from './fileUtils.js';

// Extended contact type that includes full Lead data plus tracking info
export type StoredContact = {
  id: string; // Unique identifier (timestamp + random)
  lead: Lead; // Full lead data (name, phone, businessName, etc.)
  status: 'pending' | 'messaged' | 'failed' | 'not_on_whatsapp' | 'invalid_phone' | 'skipped';
  dateAdded: string; // ISO timestamp when contact was added
  dateMessaged?: string; // ISO timestamp when message was sent
  lastUpdated: string; // ISO timestamp of last status update
  error?: string; // Error message if failed
  normalizedPhone: string; // Normalized phone for quick lookup
};

const CONTACTS_DB_FILE = path.join(process.cwd(), 'state', 'contacts.json');

/**
 * Load all contacts from the database
 */
export function loadContacts(): StoredContact[] {
  try {
    if (!fs.existsSync(CONTACTS_DB_FILE)) {
      return [];
    }

    const data = fs.readFileSync(CONTACTS_DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Failed to load contacts database:', error);
    return [];
  }
}

/**
 * Save contacts to the database
 */
function saveContacts(contacts: StoredContact[]): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(CONTACTS_DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(CONTACTS_DB_FILE, JSON.stringify(contacts, null, 2));
  } catch (error) {
    console.error('❌ Failed to save contacts database:', error);
  }
}

/**
 * Check if a contact already exists (by normalized phone number)
 */
export function isDuplicate(phone: string): boolean {
  try {
    const contacts = loadContacts();
    const normalizedPhone = normalizePhoneNumber(phone);

    return contacts.some(contact => contact.normalizedPhone === normalizedPhone);
  } catch (error) {
    console.error('❌ Failed to check duplicate:', error);
    return false;
  }
}

/**
 * Add a new contact to the database
 * Returns false if contact already exists (duplicate)
 */
export function addContact(lead: Lead, status: StoredContact['status'] = 'pending'): boolean {
  try {
    const normalizedPhone = normalizePhoneNumber(lead.phone);

    // Check if already exists
    if (isDuplicate(lead.phone)) {
      console.log(`⏭️ Skipping duplicate contact: ${lead.name} (${normalizedPhone})`);
      return false;
    }

    const contacts = loadContacts();

    const newContact: StoredContact = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      lead,
      status,
      dateAdded: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      normalizedPhone
    };

    contacts.push(newContact);
    saveContacts(contacts);

    console.log(`✅ Contact added: ${lead.name} (${normalizedPhone})`);
    return true;
  } catch (error) {
    console.error('❌ Failed to add contact:', error);
    return false;
  }
}

/**
 * Get a specific contact by phone number
 */
export function getContact(phone: string): StoredContact | null {
  try {
    const contacts = loadContacts();
    const normalizedPhone = normalizePhoneNumber(phone);

    return contacts.find(contact => contact.normalizedPhone === normalizedPhone) || null;
  } catch (error) {
    console.error('❌ Failed to get contact:', error);
    return null;
  }
}

/**
 * Get all contacts from the database
 */
export function getAllContacts(): StoredContact[] {
  return loadContacts();
}

/**
 * Update contact status after messaging attempt
 */
export function updateContactStatus(
  phone: string,
  status: StoredContact['status'],
  error?: string
): boolean {
  try {
    const contacts = loadContacts();
    const normalizedPhone = normalizePhoneNumber(phone);

    const contactIndex = contacts.findIndex(c => c.normalizedPhone === normalizedPhone);

    if (contactIndex === -1) {
      console.warn(`⚠️ Contact not found for status update: ${normalizedPhone}`);
      return false;
    }

    contacts[contactIndex].status = status;
    contacts[contactIndex].lastUpdated = new Date().toISOString();

    if (status === 'messaged') {
      contacts[contactIndex].dateMessaged = new Date().toISOString();
    }

    if (error) {
      contacts[contactIndex].error = error;
    }

    saveContacts(contacts);

    console.log(`✅ Contact status updated: ${contacts[contactIndex].lead.name} (${normalizedPhone}) -> ${status}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to update contact status:', error);
    return false;
  }
}

/**
 * Delete a contact by phone number
 */
export function deleteContact(phone: string): boolean {
  try {
    const contacts = loadContacts();
    const normalizedPhone = normalizePhoneNumber(phone);

    const initialLength = contacts.length;
    const filteredContacts = contacts.filter(c => c.normalizedPhone !== normalizedPhone);

    if (filteredContacts.length === initialLength) {
      console.warn(`⚠️ Contact not found for deletion: ${normalizedPhone}`);
      return false;
    }

    saveContacts(filteredContacts);

    console.log(`✅ Contact deleted: ${normalizedPhone}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to delete contact:', error);
    return false;
  }
}

/**
 * Get contacts by status
 */
export function getContactsByStatus(status: StoredContact['status']): StoredContact[] {
  try {
    const contacts = loadContacts();
    return contacts.filter(c => c.status === status);
  } catch (error) {
    console.error('❌ Failed to get contacts by status:', error);
    return [];
  }
}

/**
 * Get database statistics
 */
export function getContactStats() {
  try {
    const contacts = loadContacts();

    return {
      total: contacts.length,
      pending: contacts.filter(c => c.status === 'pending').length,
      messaged: contacts.filter(c => c.status === 'messaged').length,
      failed: contacts.filter(c => c.status === 'failed').length,
      notOnWhatsApp: contacts.filter(c => c.status === 'not_on_whatsapp').length,
      invalidPhone: contacts.filter(c => c.status === 'invalid_phone').length,
      skipped: contacts.filter(c => c.status === 'skipped').length
    };
  } catch (error) {
    console.error('❌ Failed to get contact stats:', error);
    return {
      total: 0,
      pending: 0,
      messaged: 0,
      failed: 0,
      notOnWhatsApp: 0,
      invalidPhone: 0,
      skipped: 0
    };
  }
}
