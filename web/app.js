// WhatsApp Automation - Ultra-Minimalist Black & White UI
// Single-tab design with elegant simplicity

class WhatsAppAutomation {
    constructor() {
        this.isProcessing = false;
        this.progressInterval = null;
        this.bulkSessionId = null;
        this.elements = this.initializeElements();
        this.init();
    }

    initializeElements() {
        return {
            // Status elements
            statusText: document.getElementById('status-text'),

            // Forms
            bulkForm: document.getElementById('csv-upload-form'),

            // Buttons
            uploadCsvBtn: document.getElementById('upload-csv-btn'),
            stopBulkBtn: document.getElementById('stop-bulk-btn'),
            modeTemplateBtn: document.getElementById('mode-template-btn'),
            modeAiPromptBtn: document.getElementById('mode-ai-prompt-btn'),

            // Mode sections
            templateModeSection: document.getElementById('template-mode-section'),
            aiPromptModeSection: document.getElementById('ai-prompt-mode-section'),

            // Input fields
            defaultMessage: document.getElementById('default-message'),
            aiPrompt: document.getElementById('ai-prompt'),

            // Progress elements
            progressSection: document.getElementById('progress-section'),
            progressFill: document.getElementById('progress-fill'),
            progressText: document.getElementById('progress-text'),

            // Status messages
            bulkStatus: document.getElementById('bulk-status'),

            // Logs
            logOutput: document.getElementById('log-output'),

            // Time
            currentTime: document.getElementById('current-time'),

            // Tabs
            tabBtns: document.querySelectorAll('.tab-btn'),
            tabContents: document.querySelectorAll('.tab-content'),

            // Contacts
            contactsSearch: document.getElementById('contacts-search'),
            contactsTbody: document.getElementById('contacts-tbody'),
            contactsEmptyState: document.getElementById('contacts-empty-state'),
            statTotal: document.getElementById('stat-total'),
            statPending: document.getElementById('stat-pending'),
            statMessaged: document.getElementById('stat-messaged'),
            statFailed: document.getElementById('stat-failed')
        };
    }

    init() {
        this.currentMode = 'template'; // Default mode
        this.setupEventListeners();
        this.updateTime();
        this.checkServerStatus();
        this.log('System initialized successfully', 'info');
    }

    setupEventListeners() {
        // Form submissions
        this.elements.bulkForm?.addEventListener('submit', (e) => this.handleBulkUpload(e));

        // Control buttons
        this.elements.stopBulkBtn?.addEventListener('click', () => this.stopBulkProcessing());

        // Mode switching buttons
        this.elements.modeTemplateBtn?.addEventListener('click', () => this.switchMode('template'));
        this.elements.modeAiPromptBtn?.addEventListener('click', () => this.switchMode('ai-prompt'));

        // Tab switching
        this.elements.tabBtns?.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Contacts search
        this.elements.contactsSearch?.addEventListener('input', (e) => this.searchContacts(e.target.value));

        // Update time every minute
        setInterval(() => this.updateTime(), 60000);
    }

    // Tab Management
    switchTab(tabName) {
        // Update tab buttons
        this.elements.tabBtns?.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update tab content
        this.elements.tabContents?.forEach(content => {
            if (content.id === `${tabName}-tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // Load contacts if switching to contacts tab
        if (tabName === 'contacts') {
            this.loadContacts();
            this.loadContactStats();
        }

        this.log(`Switched to ${tabName} tab`, 'info');
    }

    // Contacts Management
    async loadContacts() {
        try {
            const response = await fetch('/api/contacts');
            const result = await this.handleJsonResponse(response, 'Load contacts');

            if (response.ok && result.data) {
                this.allContacts = result.data;
                this.displayContacts(result.data);
            }
        } catch (error) {
            this.log(`Failed to load contacts: ${error.message}`, 'error');
        }
    }

    async loadContactStats() {
        try {
            const response = await fetch('/api/contacts/stats');
            const result = await this.handleJsonResponse(response, 'Load stats');

            if (response.ok && result.data) {
                const stats = result.data;
                if (this.elements.statTotal) this.elements.statTotal.textContent = stats.total || 0;
                if (this.elements.statPending) this.elements.statPending.textContent = stats.pending || 0;
                if (this.elements.statMessaged) this.elements.statMessaged.textContent = stats.messaged || 0;
                if (this.elements.statFailed) this.elements.statFailed.textContent = (stats.failed + stats.notOnWhatsApp + stats.invalidPhone) || 0;
            }
        } catch (error) {
            this.log(`Failed to load stats: ${error.message}`, 'error');
        }
    }

    displayContacts(contacts) {
        const tbody = this.elements.contactsTbody;
        const emptyState = this.elements.contactsEmptyState;

        if (!tbody) return;

        if (!contacts || contacts.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        tbody.innerHTML = contacts.map(contact => `
            <tr>
                <td>${this.escapeHtml(contact.lead.name || 'N/A')}</td>
                <td>${this.escapeHtml(contact.lead.businessName || 'N/A')}</td>
                <td>${this.escapeHtml(contact.normalizedPhone || 'N/A')}</td>
                <td>${this.escapeHtml(contact.lead.city || 'N/A')}</td>
                <td><span class="status-badge status-${contact.status}">${contact.status.replace('_', ' ')}</span></td>
                <td>${new Date(contact.dateAdded).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-small btn-danger" onclick="app.deleteContact('${this.escapeHtml(contact.normalizedPhone)}')">
                        Delete
                    </button>
                </td>
            </tr>
        `).join('');
    }

    searchContacts(query) {
        if (!this.allContacts) return;

        const lowercaseQuery = query.toLowerCase();
        const filtered = this.allContacts.filter(contact => {
            const searchFields = [
                contact.lead.name,
                contact.lead.businessName,
                contact.normalizedPhone,
                contact.lead.city
            ].map(field => (field || '').toLowerCase());

            return searchFields.some(field => field.includes(lowercaseQuery));
        });

        this.displayContacts(filtered);
    }

    async deleteContact(phone) {
        if (!confirm('Are you sure you want to delete this contact?')) {
            return;
        }

        try {
            const response = await fetch(`/api/contacts/${encodeURIComponent(phone)}`, {
                method: 'DELETE'
            });

            const result = await this.handleJsonResponse(response, 'Delete contact');

            if (response.ok) {
                this.log(`Contact deleted: ${phone}`, 'success');
                this.loadContacts();
                this.loadContactStats();
            } else {
                throw new Error(result.error || 'Failed to delete contact');
            }
        } catch (error) {
            this.log(`Failed to delete contact: ${error.message}`, 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Switch between template and AI prompt modes
    switchMode(mode) {
        this.currentMode = mode;

        // Update button states
        if (mode === 'template') {
            this.elements.modeTemplateBtn?.classList.add('active');
            this.elements.modeAiPromptBtn?.classList.remove('active');
            this.elements.templateModeSection?.classList.remove('hidden');
            this.elements.aiPromptModeSection?.classList.add('hidden');
        } else {
            this.elements.modeTemplateBtn?.classList.remove('active');
            this.elements.modeAiPromptBtn?.classList.add('active');
            this.elements.templateModeSection?.classList.add('hidden');
            this.elements.aiPromptModeSection?.classList.remove('hidden');
        }

        this.log(`Switched to ${mode === 'template' ? 'Template' : 'AI Prompt'} mode`, 'info');
    }

    // Server Status
    async checkServerStatus() {
        try {
            const response = await fetch('/api/status');
            const result = await this.handleJsonResponse(response, 'Server status check');
            
            if (response.ok) {
                this.updateStatus('System Active');
            } else {
                throw new Error('Server not responding');
            }
        } catch (error) {
            this.updateStatus('Connection Error');
            this.log(`Server check failed: ${error.message}`, 'error');
        }
    }

    // Bulk Upload Handler
    async handleBulkUpload(event) {
        event.preventDefault();

        if (this.isProcessing) {
            this.showStatus('bulk', 'Already processing a request', 'info');
            return;
        }

        this.isProcessing = true;
        const originalText = this.elements.uploadCsvBtn.textContent;

        try {
            this.elements.uploadCsvBtn.textContent = 'Uploading...';
            this.elements.uploadCsvBtn.disabled = true;
            this.elements.uploadCsvBtn.classList.add('loading');

            const formData = new FormData(event.target);

            // Validate file size before upload
            const fileInput = document.getElementById('csv-file');
            const file = fileInput?.files[0];
            if (file) {
                this.validateFileSize(file);
                this.log(`CSV file size: ${(file.size / 1024).toFixed(2)}KB`, 'info');
            }

            // Get the message based on current mode
            let messageContent;
            if (this.currentMode === 'template') {
                messageContent = formData.get('defaultMessage') || '';
                if (!messageContent.trim()) {
                    throw new Error('Please enter a message template');
                }
            } else {
                messageContent = this.elements.aiPrompt?.value || '';
                if (!messageContent.trim()) {
                    throw new Error('Please enter an AI prompt');
                }
            }

            // Get contact limit (optional)
            const contactLimit = formData.get('contactLimit');
            const parsedLimit = contactLimit ? parseInt(contactLimit, 10) : null;

            this.log('Uploading CSV file...', 'info');
            this.updateStatus('Uploading...');

            const response = await fetch('/api/upload-csv', {
                method: 'POST',
                body: formData
            });

            const result = await this.handleJsonResponse(response, 'CSV upload');

            if (response.ok) {
                this.showStatus('bulk', `CSV uploaded: ${result.data.contacts.length} contacts found`, 'success');
                this.log(`✅ CSV uploaded: ${result.data.contacts.length} contacts`, 'success');

                // Start bulk processing with mode, message, and contact limit
                await this.startBulkProcessing(result.data.contacts, messageContent, this.currentMode, parsedLimit);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            this.showStatus('bulk', `Error: ${error.message}`, 'error');
            this.log(`❌ Upload failed: ${error.message}`, 'error');
            this.updateStatus('Error');
        } finally {
            this.elements.uploadCsvBtn.textContent = originalText;
            this.elements.uploadCsvBtn.disabled = false;
            this.elements.uploadCsvBtn.classList.remove('loading');
            this.isProcessing = false;
        }
    }

    // Start Bulk Processing
    async startBulkProcessing(contacts, messageContent, mode, contactLimit = null) {
        try {
            const limitMsg = contactLimit ? ` (limit: ${contactLimit} successful messages)` : '';
            this.log(`Starting bulk processing for ${contacts.length} contacts in ${mode} mode${limitMsg}...`, 'info');
            this.updateStatus('Processing...');

            const response = await fetch('/api/start-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contacts: contacts,
                    defaultMessage: messageContent,
                    messageMode: mode, // 'template' or 'ai-prompt'
                    contactLimit: contactLimit // Optional limit on successful messages
                })
            });

            const result = await this.handleJsonResponse(response, 'Bulk processing start');

            if (response.ok) {
                this.bulkSessionId = result.sessionId;
                this.showProgressSection(contacts.length);
                this.startProgressMonitoring();
                this.log(`✅ Bulk processing started (${mode === 'template' ? 'Template' : 'AI Prompt'} mode)`, 'success');
            } else {
                throw new Error(result.error || 'Failed to start bulk processing');
            }
        } catch (error) {
            this.showStatus('bulk', `Error starting bulk processing: ${error.message}`, 'error');
            this.log(`❌ Bulk processing failed: ${error.message}`, 'error');
        }
    }

    // Progress Monitoring
    startProgressMonitoring() {
        if (this.progressInterval) clearInterval(this.progressInterval);

        this.progressInterval = setInterval(async () => {
            if (!this.bulkSessionId) return;

            try {
                const response = await fetch(`/api/bulk-progress/${this.bulkSessionId}`);
                const progress = await this.handleJsonResponse(response, 'Progress monitoring');

                if (response.ok) {
                    this.updateProgress(progress.processedContacts, progress.totalContacts);

                    // Update progress text with stats
                    let statsText = `${progress.processedContacts} / ${progress.totalContacts} processed`;

                    if (progress.successfulContacts > 0 || progress.failedContacts > 0) {
                        statsText += ` (✅ ${progress.successfulContacts} success`;
                        if (progress.failedContacts > 0) {
                            statsText += `, ❌ ${progress.failedContacts} failed`;
                        }
                        if (progress.notOnWhatsAppContacts > 0) {
                            statsText += `, 📵 ${progress.notOnWhatsAppContacts} not on WhatsApp`;
                        }
                        statsText += ')';
                    }

                    this.elements.progressText.textContent = statsText;

                    // Update status
                    if (progress.currentContact) {
                        this.updateStatus(`Processing: ${progress.currentContact}`);
                    }

                    // Log recent messages
                    if (progress.logs && progress.logs.length > 0) {
                        const lastLog = progress.logs[progress.logs.length - 1];
                        if (lastLog.includes('✅')) {
                            this.log(lastLog, 'success');
                        } else if (lastLog.includes('❌')) {
                            this.log(lastLog, 'error');
                        } else if (lastLog.includes('📵')) {
                            this.log(lastLog, 'warning');
                        } else {
                            this.log(lastLog, 'info');
                        }
                    }

                    // Check if completed
                    if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'stopped') {
                        this.stopProgressMonitoring();
                        this.hideProgressSection();

                        if (progress.status === 'completed') {
                            const completionMsg = `✅ Bulk processing completed: ${progress.successfulContacts} successful`;
                            this.showStatus('bulk', completionMsg, 'success');
                            this.log(completionMsg, 'success');
                            this.updateStatus('Completed');
                        } else {
                            this.showStatus('bulk', `Processing ${progress.status}`, 'info');
                            this.updateStatus('Stopped');
                        }
                    }
                }
            } catch (error) {
                console.error('Progress monitoring error:', error);
            }
        }, 2000);
    }

    stopProgressMonitoring() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    // Stop Bulk Processing
    async stopBulkProcessing() {
        if (!this.bulkSessionId) return;

        try {
            const response = await fetch(`/api/stop-bulk/${this.bulkSessionId}`, {
                method: 'POST'
            });

            if (response.ok) {
                this.log('⏸️ Bulk processing stopped by user', 'warning');
                this.updateStatus('Stopped');
                this.stopProgressMonitoring();
                this.hideProgressSection();
            }
        } catch (error) {
            this.log(`❌ Failed to stop bulk processing: ${error.message}`, 'error');
        }
    }

    // UI Helper Functions
    updateStatus(text) {
        if (this.elements.statusText) {
            this.elements.statusText.textContent = text;
        }
    }

    showStatus(target, message, type) {
        const statusEl = this.elements[`${target}Status`];
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status-message ${type}`;
            statusEl.style.display = 'block';

            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(() => {
                    statusEl.style.opacity = '0';
                    setTimeout(() => {
                        statusEl.style.display = 'none';
                        statusEl.style.opacity = '1';
                    }, 300);
                }, 3000);
            }
        }
    }

    showProgressSection(totalContacts) {
        this.elements.progressSection?.classList.add('active');
        this.updateProgress(0, totalContacts);
    }

    hideProgressSection() {
        this.elements.progressSection?.classList.remove('active');
    }

    updateProgress(current, total) {
        const percentage = total > 0 ? (current / total) * 100 : 0;
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percentage}%`;
        }
    }

    // Enhanced logging
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;

        this.elements.logOutput?.appendChild(logEntry);
        this.elements.logOutput?.scrollTo(0, this.elements.logOutput.scrollHeight);
    }

    // Validate file size before upload
    validateFileSize(file) {
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            throw new Error(`File too large (${sizeMB}MB). Maximum size is 100MB. Please reduce the number of contacts in your CSV.`);
        }
    }

    clearLogs() {
        if (this.elements.logOutput) {
            this.elements.logOutput.innerHTML = '<div class="log-entry log-info">[System] Logs cleared</div>';
        }
    }

    updateTime() {
        if (this.elements.currentTime) {
            this.elements.currentTime.textContent = new Date().toLocaleString();
        }
    }

    // JSON Response Handler
    async handleJsonResponse(response, context = 'API call') {
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            let errorMessage = `Server returned non-JSON response`;
            
            if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                if (text.includes('404')) {
                    errorMessage = 'Server endpoint not found (404). Please check if the server is running.';
                } else if (text.includes('500')) {
                    errorMessage = 'Server internal error (500). Please check server logs.';
                } else {
                    errorMessage = `Server returned HTML instead of JSON. This usually means the server is not running or there's a routing issue.`;
                }
            } else {
                errorMessage = `Server returned non-JSON response: ${text.substring(0, 200)}...`;
            }
            
            throw new Error(`${context} failed: ${errorMessage}`);
        }
        
        return await response.json();
    }
}

// Global function for clearing logs
function clearLogs() {
    if (app) {
        app.clearLogs();
    }
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new WhatsAppAutomation();
});