import { chromium } from 'playwright';
import path from 'path';
async function searchAndSend(contactName, messageText) {
    const userDataDir = path.join(process.cwd(), 'state', 'chromium-profile');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 800 }
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://web.whatsapp.com', { waitUntil: 'load' });
    // Ensure chats loaded
    await page.waitForSelector('div[aria-label="Chat list"]', { timeout: 30000 }).catch(() => undefined);
    // Focus the search box reliably
    let searchFocused = false;
    const searchCandidates = [
        '[data-testid="chat-list-search"]',
        'div[contenteditable="true"][data-tab="3"]',
        'div[role="textbox"][contenteditable="true"]'
    ];
    for (const selector of searchCandidates) {
        const el = page.locator(selector);
        if (await el.count()) {
            try {
                await el.first().click({ delay: 50 });
                await el.first().fill('');
                await el.first().type(contactName, { delay: 50 });
                searchFocused = true;
                break;
            }
            catch { }
        }
    }
    if (!searchFocused) {
        // As a last resort, try Ctrl+K
        await page.keyboard.press('Control+KeyK').catch(() => undefined);
        await page.keyboard.type(contactName, { delay: 50 });
    }
    // Click chat result by title
    const chatTitle = page.locator(`span[title="${contactName}"]`);
    await chatTitle.first().waitFor({ timeout: 15000 });
    await chatTitle.first().click();
    // Wait for message composer (try several selectors)
    const composerSelectors = [
        'div[contenteditable="true"][data-tab="10"]',
        'div[contenteditable="true"][data-tab="6"]',
        '[data-testid="conversation-compose-box-input"]',
        'div[role="textbox"][contenteditable="true"]'
    ];
    let composerFound = false;
    for (const selector of composerSelectors) {
        const c = page.locator(selector);
        if (await c.count()) {
            try {
                await c.first().waitFor({ timeout: 10000 });
                await c.first().click();
                await c.first().type(messageText, { delay: 30 });
                await page.keyboard.press('Enter');
                composerFound = true;
                break;
            }
            catch { }
        }
    }
    if (!composerFound) {
        throw new Error('Could not locate message composer. Selectors may be outdated.');
    }
    console.log(`Message sent to ${contactName}: ${messageText}`);
}
async function main() {
    const contactName = process.env.CONTACT_NAME || '';
    const messageText = process.env.MESSAGE_TEXT || 'Hello from automation';
    if (!contactName) {
        console.error('Missing CONTACT_NAME env var.');
        process.exit(1);
    }
    await searchAndSend(contactName, messageText);
}
main();
