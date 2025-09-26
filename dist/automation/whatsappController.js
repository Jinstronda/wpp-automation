import { chromium } from 'playwright';
import path from 'path';
async function launchWhatsApp() {
    const userDataDir = path.join(process.cwd(), 'state', 'chromium-profile');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-dev-shm-usage'
        ]
    });
    const page = await context.newPage();
    await page.goto('https://web.whatsapp.com', { waitUntil: 'load' });
    // Wait for either QR (first run) or chat list (already logged in)
    const qrSelector = 'canvas[aria-label="Scan me!"]';
    const chatListSelector = 'div[aria-label="Chat list"]';
    const result = await Promise.race([
        page.waitForSelector(qrSelector, { timeout: 15000 }).then(() => 'qr'),
        page.waitForSelector(chatListSelector, { timeout: 15000 }).then(() => 'chats')
    ]).catch(() => 'timeout');
    if (result === 'qr') {
        console.log('WhatsApp Web loaded: QR visible. Scan to continue.');
    }
    else if (result === 'chats') {
        console.log('WhatsApp Web loaded: Chat list visible, session restored.');
    }
    else {
        console.log('WhatsApp Web load timed out. Check the window for status.');
    }
    // Keep the context open until user closes the window
}
launchWhatsApp();
