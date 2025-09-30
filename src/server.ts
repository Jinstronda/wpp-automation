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
// Increase payload size limits to handle large CSV files (50MB limit)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (for the frontend)
app.use(express.static(path.join(process.cwd(), 'web')));

// Multer for file uploads with increased size limit
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
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
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const csvContent = fs.readFileSync(req.file.path, 'utf8');
    const contacts = parseLeadsFromCsvContent(csvContent);

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No valid contacts found in CSV' });
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `CSV processed successfully. Found ${contacts.length} contacts.`,
      data: { contacts }
    });
  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to process CSV file' 
    });
  }
});

app.post('/api/start-bulk', async (req, res) => {
  try {
    const { contacts, defaultMessage, messageMode = 'template' } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts provided for bulk processing' });
    }

    if (!defaultMessage) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const sessionId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

    // Start bulk processing asynchronously with mode
    processBulkContacts(sessionId, contacts, defaultMessage, messageMode);

    res.json({
      success: true,
      message: `Bulk processing started for ${contacts.length} contacts (${messageMode} mode)`,
      sessionId
    });
  } catch (error) {
    console.error('Bulk start error:', error);
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

// Bulk processing function
async function processBulkContacts(sessionId: string, contacts: Lead[], messageContent: string, messageMode: string = 'template') {
  const progress = bulkProgressStore.get(sessionId);
  if (!progress) return;

  try {
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      // Check if processing was stopped
      if (progress.status === 'stopped') {
        progress.logs.push(`⏸️ Processing stopped by user`);
        break;
      }

      progress.currentContact = `${contact.name} (${contact.phone})`;
      progress.processedContacts = i;
      bulkProgressStore.set(sessionId, progress);

      try {
        console.log(`Processing contact ${i + 1}/${contacts.length}: ${contact.name}`);
        progress.logs.push(`🔄 Processing: ${contact.name} (${contact.phone})`);

        // Pass message content, mode, and contact data to createContactAndMessage
        // Message will be generated AFTER contact is successfully created and we're in their chat
        await createContactAndMessage(
          contact.name,
          contact.phone,
          messageContent,
          messageMode,
          contact
        );

        progress.successfulContacts++;
        progress.logs.push(`✅ Success: ${contact.name}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to process ${contact.name}:`, errorMessage);

        // Categorize the error
        if (errorMessage.includes('not on WhatsApp')) {
          progress.notOnWhatsAppContacts++;
          progress.logs.push(`📵 Not on WhatsApp: ${contact.name}`);
        } else if (errorMessage.includes('invalid phone')) {
          progress.skippedContacts++;
          progress.logs.push(`⏭️ Invalid phone: ${contact.name}`);
        } else {
          progress.failedContacts++;
          progress.logs.push(`❌ Failed: ${contact.name} - ${errorMessage}`);
        }
      }

      // Add delay between contacts
      const delay = Math.random() * (5000 - 2000) + 2000; // 2-5 seconds
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Mark as completed
    progress.status = 'completed';
    progress.processedContacts = contacts.length;
    progress.currentContact = undefined;
    bulkProgressStore.set(sessionId, progress);

    console.log(`Bulk processing completed for session ${sessionId}`);
    progress.logs.push(`🎉 Bulk processing completed: ${progress.successfulContacts} successful, ${progress.failedContacts} failed, ${progress.notOnWhatsAppContacts} not on WhatsApp, ${progress.skippedContacts} skipped`);

  } catch (error) {
    console.error('Bulk processing error:', error);
    progress.status = 'failed';
    progress.logs.push(`💥 Bulk processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    bulkProgressStore.set(sessionId, progress);
  }
}

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