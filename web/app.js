// WhatsApp Automation UI JavaScript

// Global state
let automationRunning = false;
let currentProcessing = false;
let bulkSessionId = null;
let progressInterval = null;

// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const serverStatus = document.getElementById('server-status');
const lastAction = document.getElementById('last-action');
const logOutput = document.getElementById('log-output');
const currentTime = document.getElementById('current-time');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    log('System', 'UI loaded successfully', 'info');
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    checkServerStatus();

    // Set up form listeners
    setupFormListeners();
});

// Update current time
function updateCurrentTime() {
    currentTime.textContent = new Date().toLocaleString();
}

// Check server status
async function checkServerStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        if (response.ok) {
            serverStatus.innerHTML = '<span class="success">✅ Running</span>';
            log('System', `Server status: ${data.status}`, 'success');
        } else {
            throw new Error('Server not responding');
        }
    } catch (error) {
        serverStatus.innerHTML = '<span class="error">❌ Error</span>';
        log('System', `Server check failed: ${error.message}`, 'error');
    }
}

// Tab switching functionality
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Add active class to clicked button
    event.target.classList.add('active');

    log('UI', `Switched to ${tabName} tab`, 'info');
}

// Setup form event listeners
function setupFormListeners() {
    // Single contact form
    document.getElementById('single-contact-form').addEventListener('submit', handleSingleContact);

    // CSV upload form
    document.getElementById('csv-upload-form').addEventListener('submit', handleCSVUpload);

    // Settings form
    document.getElementById('settings-form').addEventListener('submit', handleSettings);

    // Control buttons
    document.getElementById('start-automation-btn').addEventListener('click', startAutomation);
    document.getElementById('stop-automation-btn').addEventListener('click', stopAutomation);
    document.getElementById('launch-whatsapp-btn').addEventListener('click', launchWhatsApp);
}

// Handle single contact form submission
async function handleSingleContact(event) {
    event.preventDefault();

    if (currentProcessing) {
        log('System', 'Already processing a request. Please wait.', 'warning');
        return;
    }

    currentProcessing = true;
    const submitBtn = document.getElementById('send-single-btn');
    const originalText = submitBtn.textContent;

    try {
        submitBtn.textContent = '⏳ Processing...';
        submitBtn.disabled = true;

        const formData = new FormData(event.target);
        const data = {
            name: formData.get('name'),
            phone: formData.get('phone'),
            message: formData.get('message')
        };

        log('Action', `Creating contact: ${data.name} (${data.phone})`, 'info');
        updateLastAction(`Creating contact: ${data.name}`);

        const response = await fetch('/api/single-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            log('Success', `Contact processed: ${result.message}`, 'success');
            updateLastAction(`Sent to ${data.name}`);
            event.target.reset(); // Clear form
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        log('Error', `Failed to process contact: ${error.message}`, 'error');
        updateLastAction('Error occurred');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        currentProcessing = false;
    }
}

// Handle CSV upload form submission
async function handleCSVUpload(event) {
    event.preventDefault();

    if (currentProcessing) {
        log('System', 'Already processing a request. Please wait.', 'warning');
        return;
    }

    currentProcessing = true;
    const submitBtn = document.getElementById('upload-csv-btn');
    const originalText = submitBtn.textContent;

    try {
        submitBtn.textContent = '⏳ Uploading...';
        submitBtn.disabled = true;

        const formData = new FormData(event.target);

        log('Action', 'Uploading CSV file...', 'info');
        updateLastAction('Uploading CSV');

        const response = await fetch('/api/upload-csv', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            log('Success', `CSV uploaded: ${result.message}`, 'success');
            updateLastAction('CSV uploaded');
            showProgressSection();

            // Store contacts for bulk processing
            window.csvContacts = result.data.contacts;

            // Show start automation button
            showStartBulkButton(result.data.contacts.length);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        log('Error', `Failed to upload CSV: ${error.message}`, 'error');
        updateLastAction('CSV upload failed');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        currentProcessing = false;
    }
}

// Handle settings form submission
async function handleSettings(event) {
    event.preventDefault();

    try {
        const formData = new FormData(event.target);
        const settings = {
            minDelay: parseInt(formData.get('minDelay')),
            maxDelay: parseInt(formData.get('maxDelay')),
            retries: parseInt(formData.get('retries')),
            timeout: parseInt(formData.get('timeout'))
        };

        log('Action', 'Updating settings...', 'info');

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        const result = await response.json();

        if (response.ok) {
            log('Success', 'Settings updated successfully', 'success');
            updateLastAction('Settings updated');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        log('Error', `Failed to update settings: ${error.message}`, 'error');
    }
}

// Control functions
function startAutomation() {
    if (!automationRunning) {
        automationRunning = true;
        document.getElementById('start-automation-btn').disabled = true;
        document.getElementById('stop-automation-btn').disabled = false;
        statusIndicator.innerHTML = '<span class="success">🟢 Running</span>';
        log('System', 'Automation started', 'success');
        updateLastAction('Automation started');
    }
}

function stopAutomation() {
    if (automationRunning) {
        automationRunning = false;
        document.getElementById('start-automation-btn').disabled = false;
        document.getElementById('stop-automation-btn').disabled = true;
        statusIndicator.innerHTML = '<span class="info">🔄 Ready</span>';
        log('System', 'Automation stopped', 'warning');
        updateLastAction('Automation stopped');
    }
}

function launchWhatsApp() {
    log('Action', 'Launching WhatsApp Web...', 'info');
    updateLastAction('Launching WhatsApp Web');
    // TODO: Call API to launch WhatsApp
}

// Utility functions
function showProgressSection() {
    document.getElementById('progress-section').style.display = 'block';
}

function updateProgress(current, total) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    progressBar.value = (current / total) * 100;
    progressText.textContent = `${current} / ${total} contacts processed`;
}

function updateLastAction(action) {
    lastAction.textContent = action;
}

function log(category, message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] [${category}] ${message}\\n`;

    const span = document.createElement('span');
    span.className = type;
    span.textContent = logEntry;

    logOutput.appendChild(span);
    logOutput.scrollTop = logOutput.scrollHeight;
}

function clearLogs() {
    logOutput.innerHTML = '<span class="info">[System] Logs cleared</span>';
}

// Bulk automation functions
function showStartBulkButton(contactCount) {
    const progressSection = document.getElementById('progress-section');
    let startButton = document.getElementById('start-bulk-btn');

    if (!startButton) {
        startButton = document.createElement('button');
        startButton.id = 'start-bulk-btn';
        startButton.innerHTML = `🚀 Start Bulk Automation (${contactCount} contacts)`;
        startButton.onclick = startBulkAutomation;
        startButton.style.marginTop = '1rem';
        progressSection.appendChild(startButton);
    } else {
        startButton.innerHTML = `🚀 Start Bulk Automation (${contactCount} contacts)`;
    }
}

async function startBulkAutomation() {
    if (!window.csvContacts || window.csvContacts.length === 0) {
        log('Error', 'No contacts available for bulk automation', 'error');
        return;
    }

    try {
        const defaultMessage = document.querySelector('textarea[name="defaultMessage"]').value;

        log('Action', `Starting bulk automation for ${window.csvContacts.length} contacts...`, 'info');
        updateLastAction('Starting bulk automation');

        const response = await fetch('/api/start-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contacts: window.csvContacts,
                defaultMessage: defaultMessage
            })
        });

        const result = await response.json();

        if (response.ok) {
            bulkSessionId = result.sessionId;
            log('Success', result.message, 'success');
            updateLastAction('Bulk automation running');

            // Hide start button and show stop button
            document.getElementById('start-bulk-btn').style.display = 'none';
            showStopBulkButton();

            // Start progress monitoring
            startProgressMonitoring();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        log('Error', `Failed to start bulk automation: ${error.message}`, 'error');
        updateLastAction('Bulk automation failed');
    }
}

function showStopBulkButton() {
    const progressSection = document.getElementById('progress-section');
    let stopButton = document.getElementById('stop-bulk-btn');

    if (!stopButton) {
        stopButton = document.createElement('button');
        stopButton.id = 'stop-bulk-btn';
        stopButton.innerHTML = '⏸️ Stop Bulk Automation';
        stopButton.className = 'contrast';
        stopButton.onclick = stopBulkAutomation;
        stopButton.style.marginTop = '1rem';
        progressSection.appendChild(stopButton);
    }

    stopButton.style.display = 'block';
}

async function stopBulkAutomation() {
    if (!bulkSessionId) return;

    try {
        const response = await fetch(`/api/stop-bulk/${bulkSessionId}`, {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            log('Warning', 'Bulk automation stopped by user', 'warning');
            updateLastAction('Bulk automation stopped');
            stopProgressMonitoring();
        }
    } catch (error) {
        log('Error', `Failed to stop bulk automation: ${error.message}`, 'error');
    }
}

function startProgressMonitoring() {
    if (progressInterval) clearInterval(progressInterval);

    progressInterval = setInterval(async () => {
        if (!bulkSessionId) return;

        try {
            const response = await fetch(`/api/bulk-progress/${bulkSessionId}`);
            const progress = await response.json();

            if (response.ok) {
                updateProgress(progress.processedContacts, progress.totalContacts);

                // Update progress text with detailed stats
                const progressText = document.getElementById('progress-text');
                let statsText = `${progress.processedContacts} / ${progress.totalContacts} contacts processed`;

                if (progress.successfulContacts > 0 || progress.failedContacts > 0 || progress.notOnWhatsAppContacts > 0 || progress.skippedContacts > 0) {
                    statsText += ` (✅ ${progress.successfulContacts} success`;

                    if (progress.failedContacts > 0) {
                        statsText += `, ❌ ${progress.failedContacts} failed`;
                    }

                    if (progress.notOnWhatsAppContacts > 0) {
                        statsText += `, 📵 ${progress.notOnWhatsAppContacts} not on WhatsApp`;
                    }

                    if (progress.skippedContacts > 0) {
                        statsText += `, ⏭️ ${progress.skippedContacts} skipped`;
                    }

                    statsText += ')';
                }

                progressText.textContent = statsText;

                // Update current contact being processed
                if (progress.currentContact) {
                    updateLastAction(`Processing: ${progress.currentContact}`);
                }

                // Log recent messages
                if (progress.logs && progress.logs.length > 0) {
                    const lastLog = progress.logs[progress.logs.length - 1];
                    if (lastLog.includes('✅')) {
                        log('Success', lastLog, 'success');
                    } else if (lastLog.includes('❌')) {
                        log('Error', lastLog, 'error');
                    } else if (lastLog.includes('📵')) {
                        log('Warning', lastLog, 'warning');
                    } else if (lastLog.includes('⏭️')) {
                        log('Info', lastLog, 'info');
                    } else {
                        log('Info', lastLog, 'info');
                    }
                }

                // Check if completed
                if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'stopped') {
                    stopProgressMonitoring();
                    document.getElementById('stop-bulk-btn').style.display = 'none';
                    updateLastAction(`Bulk automation ${progress.status}`);

                    if (progress.status === 'completed') {
                        let completionMsg = `Bulk automation completed: ${progress.successfulContacts} successful`;
                        if (progress.failedContacts > 0) completionMsg += `, ${progress.failedContacts} failed`;
                        if (progress.notOnWhatsAppContacts > 0) completionMsg += `, ${progress.notOnWhatsAppContacts} not on WhatsApp`;
                        if (progress.skippedContacts > 0) completionMsg += `, ${progress.skippedContacts} skipped`;

                        log('Success', completionMsg, 'success');
                    }
                }
            }
        } catch (error) {
            console.error('Progress monitoring error:', error);
        }
    }, 2000); // Check every 2 seconds
}

function stopProgressMonitoring() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

// Export functions for global access
window.showTab = showTab;
window.clearLogs = clearLogs;