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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (for the frontend)
app.use('/static', express.static(path.join(process.cwd(), 'web')));

// Multer for file uploads
const upload = multer({ dest: 'uploads/' });

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

    console.log(`API: Processing single contact - ${name}, ${phone}`);

    // Call the automation function
    await createContactAndMessage(name, phone, message);

    res.json({
      success: true,
      message: `Contact ${name} processed successfully`,
      data: { name, phone, message }
    });
  } catch (error) {
    console.error('Automation error:', error);
    res.status(500).json({
      error: `Failed to process contact: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    console.log(`API: Processing CSV file - ${req.file.filename}`);

    // Read and parse the CSV file
    const csvContent = fs.readFileSync(req.file.path, 'utf8');
    const leads = parseLeadsFromCsvContent(csvContent);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (leads.length === 0) {
      return res.status(400).json({
        error: 'No valid contacts found in CSV. Ensure file has headers: name, phone, businessName (legacy format) or Title, Phone, Industry (Google Maps format)'
      });
    }

    // Validate each lead
    const validLeads = leads.filter(lead => lead.name && lead.phone);
    const skippedCount = leads.length - validLeads.length;

    console.log(`CSV parsed: ${validLeads.length} valid contacts, ${skippedCount} skipped`);

    res.json({
      success: true,
      message: `CSV processed successfully: ${validLeads.length} contacts ready for automation`,
      data: {
        totalContacts: validLeads.length,
        skippedContacts: skippedCount,
        contacts: validLeads
      }
    });
  } catch (error) {
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error('CSV processing error:', error);
    res.status(500).json({
      error: `Failed to process CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Bulk automation endpoint
app.post('/api/start-bulk', async (req, res) => {
  try {
    const { contacts, defaultMessage } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts provided for bulk automation' });
    }

    // Generate unique session ID
    const sessionId = 'bulk_' + Date.now();

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
      logs: [`Starting bulk automation for ${contacts.length} contacts`]
    };

    bulkProgressStore.set(sessionId, progress);

    console.log(`API: Starting bulk automation session ${sessionId} with ${contacts.length} contacts`);

    // Start processing in background
    processBulkContacts(sessionId, contacts, defaultMessage);

    res.json({
      success: true,
      sessionId,
      message: `Bulk automation started for ${contacts.length} contacts`,
      totalContacts: contacts.length
    });
  } catch (error) {
    console.error('Bulk automation start error:', error);
    res.status(500).json({
      error: `Failed to start bulk automation: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// Progress tracking endpoint
app.get('/api/bulk-progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const progress = bulkProgressStore.get(sessionId);

  if (!progress) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(progress);
});

// Stop bulk automation endpoint
app.post('/api/stop-bulk/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const progress = bulkProgressStore.get(sessionId);

  if (!progress) {
    return res.status(404).json({ error: 'Session not found' });
  }

  progress.status = 'stopped';
  progress.logs.push('Bulk automation stopped by user');

  res.json({
    success: true,
    message: 'Bulk automation stopped',
    sessionId
  });
});

// Background function to process bulk contacts
async function processBulkContacts(sessionId: string, contacts: Lead[], defaultMessage?: string) {
  const progress = bulkProgressStore.get(sessionId);
  if (!progress) return;

  try {
    for (let i = 0; i < contacts.length; i++) {
      // Check if stopped
      if (progress.status === 'stopped') {
        progress.logs.push('Processing stopped');
        break;
      }

      const contact = contacts[i];
      progress.currentContact = contact.name;
      progress.logs.push(`Processing ${i + 1}/${contacts.length}: ${contact.name}`);

      try {
        let message: string;

        // Check if we should use AI-generated message (when no custom message is provided)
        if (!contact.promptVariant && !defaultMessage && aiMessageGenerator.isAvailable()) {
          // Generate AI message using business data
          message = await aiMessageGenerator.generateOpenerMessage(contact);
          progress.logs.push(`🤖 Generated AI opener for ${contact.name}: "${message}"`);
        } else {
          // Use contact-specific message or default, with template processing
          const messageTemplate = contact.promptVariant || defaultMessage || `Hello {{business}}, this is an automated message.`;
          message = processMessageTemplate(messageTemplate, contact);
          progress.logs.push(`📝 Using template message for ${contact.name}`);
        }

        await createContactAndMessage(contact.name, contact.phone, message);

        progress.successfulContacts++;
        progress.logs.push(`✅ Success: ${contact.name}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('not on WhatsApp') || errorMessage.includes('already processed')) {
          if (errorMessage.includes('not on WhatsApp')) {
            progress.notOnWhatsAppContacts++;
            progress.logs.push(`📵 Not on WhatsApp: ${contact.name}`);
          } else {
            progress.skippedContacts++;
            progress.logs.push(`⏭️ Skipped: ${contact.name} - ${errorMessage}`);
          }
        } else {
          progress.failedContacts++;
          progress.logs.push(`❌ Failed: ${contact.name} - ${errorMessage}`);
        }
      }

      progress.processedContacts++;

      // Add delay between contacts (1-3 seconds)
      if (i < contacts.length - 1 && progress.status === 'running') {
        const delay = Math.random() * 2000 + 1000; // 1-3 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (progress.status !== 'stopped') {
      progress.status = 'completed';
      progress.logs.push(`Bulk automation completed: ${progress.successfulContacts} successful, ${progress.failedContacts} failed, ${progress.notOnWhatsAppContacts} not on WhatsApp, ${progress.skippedContacts} skipped`);
    }
  } catch (error) {
    progress.status = 'failed';
    progress.logs.push(`Bulk automation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

app.post('/api/settings', (req, res) => {
  try {
    const settings = req.body;

    // TODO: Save settings
    console.log('API: Settings updated', settings);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// AI configuration endpoint
app.get('/api/ai-status', (req, res) => {
  try {
    res.json({
      available: aiMessageGenerator.isAvailable(),
      model: 'gpt-4o-mini',
      status: aiMessageGenerator.isAvailable() ? 'configured' : 'missing_api_key'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get AI status' });
  }
});

app.post('/api/ai-config', (req, res) => {
  try {
    const { agentName, companyName, estimatedSavings, timeSaved } = req.body;

    aiMessageGenerator.updateConfig({
      agentName,
      companyName,
      estimatedSavings,
      timeSaved
    });

    res.json({
      success: true,
      message: 'AI configuration updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update AI configuration' });
  }
});

// Serve the main UI
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'web', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Automation UI Server running on http://localhost:${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api/status`);
});

export default app;