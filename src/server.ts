import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createContactAndMessage } from './automation/createContactAndMessage.js';
import { parseLeadsFromCsvContent, Lead, ContactStatus, processMessageTemplate } from './utils/fileUtils.js';
import { aiMessageGenerator } from './utils/aiMessageGenerator.js';
import { getWhatsAppPage, isBrowserInitialized, closeBrowser } from './automation/browserManager.js';
import { addContact, getAllContacts, getContactStats, deleteContact, isAlreadyMessaged, updateContactStatus } from './utils/contactsDb.js';

const app = express();
const PORT = 4000;

// In-memory store for tracking bulk automation progress
interface BulkProgress {
  id: string;
  totalContacts: number;
  processedContacts: number;
  successfulContacts: number;
  failedContacts: number;
  notOnWhatsAppContacts: number;
  skippedContacts: number;
  currentContact?: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  logs: string[];
}

const bulkProgressStore = new Map<string, BulkProgress>();

// Middleware
app.use(cors());
// Increase payload size limits to handle large CSV files (100MB limit)
// This accommodates large Google Maps exports with thousands of contacts
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Serve static files (for the frontend)
app.use(express.static(path.join(process.cwd(), 'web')));

// Multer for file uploads with increased size limit
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 1 // Only accept 1 file at a time
  }
});

// API Routes
app.get('/api/status', (req, res) => {
  res.json({ status: 'WhatsApp Automation Server Running', timestamp: new Date().toISOString() });
});

app.post('/api/single-contact', async (req, res) => {
  try {
    const { name, phone, message } = req.body;

    if (!name || !phone || !message) {
      return res.status(400).json({ error: 'Missing required fields: name, phone, message' });
    }

    console.log(`Processing single contact: ${name} (${phone})`);
    
    await createContactAndMessage(name, phone, message);
    
    res.json({ 
      success: true, 
      message: `Contact ${name} processed successfully` 
    });
  } catch (error) {
    console.error('Single contact error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
});

app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
  try {
    console.log('🔍 [DEBUG] /api/upload-csv - Request received');

    if (!req.file) {
      console.log('❌ [DEBUG] No file in request');
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    console.log(`🔍 [DEBUG] File received: ${req.file.originalname}, Size: ${req.file.size} bytes`);

    const csvContent = fs.readFileSync(req.file.path, 'utf8');
    console.log(`🔍 [DEBUG] CSV content read, length: ${csvContent.length} characters`);

    console.log('🔍 [DEBUG] Calling parseLeadsFromCsvContent...');
    const allContacts = parseLeadsFromCsvContent(csvContent);
    console.log(`🔍 [DEBUG] parseLeadsFromCsvContent returned ${allContacts.length} contacts`);

    if (allContacts.length === 0) {
      console.log('❌ [DEBUG] No valid contacts found');
      return res.status(400).json({ error: 'No valid contacts found in CSV' });
    }

    console.log(`📊 CSV Import: Processing ${allContacts.length} contacts...`);

    // Filter out contacts that have already been messaged (don't save contacts yet)
    // Contacts will only be saved AFTER successful messaging
    const newContacts: Lead[] = [];
    const alreadyMessaged: Lead[] = [];

    console.log('🔍 [DEBUG] Starting to filter already messaged contacts...');
    for (const contact of allContacts) {
      // Check if this contact was already messaged (not just imported)
      if (isAlreadyMessaged(contact.phone)) {
        alreadyMessaged.push(contact);
        console.log(`⏭️ Skipping already messaged: ${contact.name} (${contact.phone})`);
      } else {
        newContacts.push(contact);
      }
    }
    console.log(`🔍 [DEBUG] Filtering complete: ${newContacts.length} new, ${alreadyMessaged.length} already messaged`);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    console.log('🔍 [DEBUG] Uploaded file cleaned up');

    console.log(`✅ CSV Import Complete: ${newContacts.length} new, ${alreadyMessaged.length} already messaged (skipped)`);

    const response = {
      success: true,
      message: `CSV processed successfully. ${newContacts.length} contacts ready to message, ${alreadyMessaged.length} already messaged (skipped).`,
      data: {
        contacts: newContacts, // Only return unmessaged contacts for processing
        stats: {
          total: allContacts.length,
          new: newContacts.length,
          alreadyMessaged: alreadyMessaged.length
        }
      }
    };

    console.log('🔍 [DEBUG] Sending success response');
    res.json(response);
  } catch (error) {
    console.error('❌ [ERROR] CSV upload error:', error);
    console.error('❌ [ERROR] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process CSV file'
    });
  }
});

// Initialize browser before bulk processing
app.post('/api/init-browser', async (req, res) => {
  try {
    console.log('🔄 Explicit browser initialization requested...');

    // Check if already initialized
    if (isBrowserInitialized()) {
      console.log('✅ Browser already initialized');
      return res.json({
        success: true,
        message: 'Browser already initialized',
        alreadyInitialized: true
      });
    }

    // Initialize browser by getting a page (this triggers initialization)
    console.log('🚀 Initializing browser...');
    await getWhatsAppPage();

    console.log('✅ Browser initialized successfully');
    res.json({
      success: true,
      message: 'Browser initialized successfully',
      alreadyInitialized: false
    });
  } catch (error) {
    console.error('❌ Browser initialization failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to initialize browser',
      details: error instanceof Error ? error.stack : String(error)
    });
  }
});

app.post('/api/start-bulk', async (req, res) => {
  try {
    console.log('🔍 [DEBUG] /api/start-bulk - Request received');

    const { contacts, defaultMessage, messageMode = 'template', contactLimit } = req.body;
    console.log(`🔍 [DEBUG] Extracted params - contacts count: ${contacts?.length}, messageMode: ${messageMode}, contactLimit: ${contactLimit}`);

    // Log payload size for debugging
    const payloadSize = JSON.stringify(req.body).length;
    const limitMsg = contactLimit ? ` (limit: ${contactLimit})` : '';
    console.log(`📊 Received bulk request: ${contacts?.length || 0} contacts${limitMsg}, payload size: ${(payloadSize / 1024 / 1024).toFixed(2)}MB`);

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      console.log('❌ [DEBUG] Invalid contacts array');
      return res.status(400).json({ error: 'No contacts provided for bulk processing' });
    }

    console.log(`🔍 [DEBUG] First contact sample:`, JSON.stringify(contacts[0], null, 2));

    if (!defaultMessage) {
      console.log('❌ [DEBUG] No message provided');
      return res.status(400).json({ error: 'Message content is required' });
    }

    console.log(`🔍 [DEBUG] Message template length: ${defaultMessage.length} characters`);

    // Validate contact limit if provided
    const parsedLimit = contactLimit ? parseInt(contactLimit, 10) : null;
    if (parsedLimit !== null && (isNaN(parsedLimit) || parsedLimit < 1)) {
      console.log('❌ [DEBUG] Invalid contact limit');
      return res.status(400).json({ error: 'Contact limit must be a positive number' });
    }

    console.log(`🔍 [DEBUG] Parsed limit: ${parsedLimit}`);

    // PRE-INITIALIZE BROWSER before starting bulk processing
    console.log('🔄 Pre-initializing browser for bulk processing...');
    try {
      console.log('🔍 [DEBUG] Calling getWhatsAppPage()...');
      await getWhatsAppPage();
      console.log('✅ Browser pre-initialized successfully');
    } catch (browserError) {
      console.error('❌ Failed to initialize browser:', browserError);
      console.error('❌ [ERROR] Browser error stack:', browserError instanceof Error ? browserError.stack : 'No stack');
      return res.status(500).json({
        error: 'Failed to initialize browser. Please make sure WhatsApp Web can open.',
        details: browserError instanceof Error ? browserError.message : String(browserError)
      });
    }

    const sessionId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🔍 [DEBUG] Created session ID: ${sessionId}`);

    // Initialize progress tracking
    const progress: BulkProgress = {
      id: sessionId,
      totalContacts: contacts.length,
      processedContacts: 0,
      successfulContacts: 0,
      failedContacts: 0,
      notOnWhatsAppContacts: 0,
      skippedContacts: 0,
      status: 'running',
      logs: []
    };

    bulkProgressStore.set(sessionId, progress);
    console.log('🔍 [DEBUG] Progress tracking initialized');

    // Start bulk processing asynchronously with mode and contact limit
    console.log('🔍 [DEBUG] Starting processBulkContacts...');
    processBulkContacts(sessionId, contacts, defaultMessage, messageMode, parsedLimit);

    const limitDisplay = parsedLimit ? ` (limit: ${parsedLimit} successful messages)` : '';
    const response = {
      success: true,
      message: `Bulk processing started for ${contacts.length} contacts (${messageMode} mode)${limitDisplay}`,
      sessionId
    };

    console.log('🔍 [DEBUG] Sending success response');
    res.json(response);
  } catch (error) {
    console.error('❌ [ERROR] Bulk start error:', error);
    console.error('❌ [ERROR] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start bulk processing'
    });
  }
});

app.get('/api/bulk-progress/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const progress = bulkProgressStore.get(sessionId);

    if (!progress) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(progress);
  } catch (error) {
    console.error('Progress check error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get progress' 
    });
  }
});

app.post('/api/stop-bulk/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const progress = bulkProgressStore.get(sessionId);

    if (!progress) {
      return res.status(404).json({ error: 'Session not found' });
    }

    progress.status = 'stopped';
    bulkProgressStore.set(sessionId, progress);

    res.json({ success: true, message: 'Bulk processing stopped' });
  } catch (error) {
    console.error('Stop bulk error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to stop bulk processing' 
    });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { minDelay, maxDelay, retries, timeout } = req.body;

    // Validate settings
    if (minDelay && (minDelay < 1000 || minDelay > 30000)) {
      return res.status(400).json({ error: 'minDelay must be between 1000 and 30000 ms' });
    }

    if (maxDelay && (maxDelay < 1000 || maxDelay > 30000)) {
      return res.status(400).json({ error: 'maxDelay must be between 1000 and 30000 ms' });
    }

    if (retries && (retries < 0 || retries > 5)) {
      return res.status(400).json({ error: 'retries must be between 0 and 5' });
    }

    if (timeout && (timeout < 5000 || timeout > 60000)) {
      return res.status(400).json({ error: 'timeout must be between 5000 and 60000 ms' });
    }

    // Store settings (in a real app, you'd save to a database)
    const settings = {
      minDelay: minDelay || 2000,
      maxDelay: maxDelay || 5000,
      retries: retries || 2,
      timeout: timeout || 30000
    };

    res.json({ success: true, message: 'Settings updated successfully', settings });
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update settings'
    });
  }
});

// Contact Management API Endpoints

// Get all contacts
app.get('/api/contacts', (req, res) => {
  try {
    const contacts = getAllContacts();
    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get contacts'
    });
  }
});

// Get contact statistics
app.get('/api/contacts/stats', (req, res) => {
  try {
    const stats = getContactStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get statistics'
    });
  }
});

// Delete a contact by phone number
app.delete('/api/contacts/:phone', (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const deleted = deleteContact(phone);

    if (!deleted) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete contact'
    });
  }
});

// Bulk processing function
async function processBulkContacts(sessionId: string, contacts: Lead[], messageContent: string, messageMode: string = 'template', contactLimit: number | null = null) {
  console.log(`🔍 [DEBUG] processBulkContacts started - sessionId: ${sessionId}, contacts: ${contacts.length}, mode: ${messageMode}, limit: ${contactLimit}`);

  const progress = bulkProgressStore.get(sessionId);
  if (!progress) {
    console.error('❌ [ERROR] Progress not found for session:', sessionId);
    return;
  }

  try {
    console.log(`🔍 [DEBUG] Starting to process ${contacts.length} contacts...`);

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      console.log(`🔍 [DEBUG] Loop iteration ${i + 1}/${contacts.length} - Contact: ${contact.name}`);

      // Check if processing was stopped
      if (progress.status === 'stopped') {
        progress.logs.push(`⏸️ Processing stopped by user`);
        console.log('🔍 [DEBUG] Processing stopped by user');
        break;
      }

      // Check if contact limit reached (only count successful messages)
      if (contactLimit !== null && progress.successfulContacts >= contactLimit) {
        progress.logs.push(`🎯 Contact limit reached: ${contactLimit} successful messages sent`);
        console.log(`✅ Contact limit reached: ${contactLimit} successful messages`);
        break;
      }

      progress.currentContact = `${contact.name} (${contact.phone})`;
      progress.processedContacts = i;
      bulkProgressStore.set(sessionId, progress);

      try {
        console.log(`🔍 [DEBUG] Processing contact ${i + 1}/${contacts.length}: ${contact.name} (${contact.phone})`);
        progress.logs.push(`🔄 Processing: ${contact.name} (${contact.phone})`);

        console.log(`🔍 [DEBUG] Calling createContactAndMessage with:`);
        console.log(`  - name: ${contact.name}`);
        console.log(`  - phone: ${contact.phone}`);
        console.log(`  - messageMode: ${messageMode}`);
        console.log(`  - messageContent length: ${messageContent.length}`);

        // Pass message content, mode, and contact data to createContactAndMessage
        // Message will be generated AFTER contact is successfully created and we're in their chat
        await createContactAndMessage(
          contact.name,
          contact.phone,
          messageContent,
          messageMode,
          contact
        );

        console.log(`🔍 [DEBUG] createContactAndMessage completed successfully for ${contact.name}`);

        // Save contact to database AFTER successful messaging
        // This ensures we only track contacts that were actually messaged
        console.log(`🔍 [DEBUG] Adding contact to database: ${contact.name}`);
        addContact(contact, 'messaged');

        progress.successfulContacts++;
        progress.logs.push(`✅ Success: ${contact.name}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [ERROR] Failed to process ${contact.name}:`, errorMessage);
        console.error(`❌ [ERROR] Error stack:`, error instanceof Error ? error.stack : 'No stack');

        // Save contact to database with appropriate error status
        if (errorMessage.includes('not on WhatsApp')) {
          console.log(`🔍 [DEBUG] Contact not on WhatsApp: ${contact.name}`);
          addContact(contact, 'not_on_whatsapp');
          progress.notOnWhatsAppContacts++;
          progress.logs.push(`📵 Not on WhatsApp: ${contact.name}`);
        } else if (errorMessage.includes('invalid phone')) {
          console.log(`🔍 [DEBUG] Invalid phone: ${contact.name}`);
          addContact(contact, 'invalid_phone');
          progress.skippedContacts++;
          progress.logs.push(`⏭️ Invalid phone: ${contact.name}`);
        } else {
          console.log(`🔍 [DEBUG] General failure for: ${contact.name}`);
          addContact(contact, 'failed');
          progress.failedContacts++;
          progress.logs.push(`❌ Failed: ${contact.name} - ${errorMessage}`);
        }
      }

      // Add delay between contacts
      const delay = Math.random() * (5000 - 2000) + 2000; // 2-5 seconds
      console.log(`🔍 [DEBUG] Adding delay of ${Math.round(delay)}ms before next contact`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Mark as completed
    console.log(`🔍 [DEBUG] All contacts processed, marking as completed`);
    progress.status = 'completed';
    progress.processedContacts = contacts.length;
    progress.currentContact = undefined;
    bulkProgressStore.set(sessionId, progress);

    console.log(`Bulk processing completed for session ${sessionId}`);
    progress.logs.push(`🎉 Bulk processing completed: ${progress.successfulContacts} successful, ${progress.failedContacts} failed, ${progress.notOnWhatsAppContacts} not on WhatsApp, ${progress.skippedContacts} skipped`);

  } catch (error) {
    console.error('❌ [ERROR] Bulk processing error:', error);
    console.error('❌ [ERROR] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    progress.status = 'failed';
    progress.logs.push(`💥 Bulk processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    bulkProgressStore.set(sessionId, progress);
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ [FATAL] Uncaught Exception:', error);
  console.error('❌ [FATAL] Stack:', error.stack);
  // Don't exit - let the server try to recover
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [FATAL] Unhandled Promise Rejection at:', promise);
  console.error('❌ [FATAL] Reason:', reason);
  // Don't exit - let the server try to recover
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Automation Server running on port ${PORT}`);
  console.log(`📱 Frontend available at: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});