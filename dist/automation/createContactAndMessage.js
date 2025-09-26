import { chromium } from 'playwright';
import path from 'path';
function normalizePhoneToDigits(phone) {
    return phone.replace(/\D/g, '');
}
async function clickAny(page, selectors) {
    for (const selector of selectors) {
        const el = page.locator(selector);
        if (await el.count()) {
            try {
                await el.first().click({ timeout: 5000 });
                return true;
            }
            catch { }
        }
    }
    return false;
}
async function clickAnyWithinRoot(root, selectors) {
    for (const selector of selectors) {
        const el = root.locator(selector);
        if (await el.count()) {
            try {
                await el.first().click({ timeout: 5000 });
                return true;
            }
            catch { }
        }
    }
    return false;
}
async function typeInto(page, selectors, value) {
    for (const selector of selectors) {
        const el = page.locator(selector);
        if (await el.count()) {
            try {
                const target = el.first();
                await target.click();
                await target.fill('');
                const isFocused = await page.evaluate((sel) => {
                    const node = document.querySelector(sel);
                    return !!node && node === document.activeElement;
                }, selector);
                if (!isFocused)
                    continue;
                await target.type(value, { delay: 20 });
                return true;
            }
            catch { }
        }
    }
    return false;
}
async function typeIntoWithinRoot(root, page, selectors, value) {
    for (const selector of selectors) {
        const el = root.locator(selector);
        if (await el.count()) {
            try {
                const target = el.first();
                await target.click();
                await target.fill('');
                const isFocused = await page.evaluate((sel) => {
                    const node = document.querySelector(sel);
                    return !!node && node === document.activeElement;
                }, selector);
                if (!isFocused)
                    continue;
                await target.type(value, { delay: 20 });
                return true;
            }
            catch { }
        }
    }
    return false;
}
async function ensureParagraphText(root, selector, value) {
    const p = root.locator(selector).first();
    if (!(await p.count()))
        return false;
    for (let i = 0; i < 2; i++) {
        try {
            await p.click();
            await p.fill('');
            await p.type(value, { delay: 0 });
            const ok = await p.evaluate((node, v) => node.textContent?.trim() === v, value);
            if (ok)
                return true;
        }
        catch { }
    }
    return false;
}
async function ensureInputValue(root, page, selector, value) {
    const input = root.locator(selector).first();
    if (!(await input.count()))
        return false;
    for (let i = 0; i < 2; i++) {
        try {
            await input.click();
            await input.fill('');
            const focused = await input.evaluate((n) => n === document.activeElement);
            if (!focused)
                continue;
            await input.type(value, { delay: 0 });
            const ok = await input.evaluate((n, v) => n.value.replace(/\D/g, '') === v.replace(/\D/g, ''), value);
            if (ok)
                return true;
        }
        catch { }
    }
    return false;
}
async function createContactAndMessage(name, phone, messageText) {
    const userDataDir = path.join(process.cwd(), 'state', 'chromium-profile');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1600, height: 900 }
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://web.whatsapp.com', { waitUntil: 'load' });
    await page.waitForSelector('div[aria-label="Chat list"]', { timeout: 30000 }).catch(() => undefined);
    // 1) Click New Chat (plus icon) using resilient selectors
    const newChatSelectors = [
        '[data-testid="chat-new"]',
        '[data-testid="menu-bar-new-chat"]',
        'div[role="button"][title="New chat"]',
        'button[aria-label="New chat"]',
        'span[data-icon="new-chat"]',
        'span[data-icon="new-chat-outline"]',
        'button svg[aria-label="New chat"]'
    ];
    let newChatClicked = await clickAny(page, newChatSelectors);
    if (!newChatClicked) {
        // Fallback: use keyboard shortcut Ctrl+N to open New Chat panel
        await page.keyboard.press('Control+KeyN').catch(() => undefined);
        // Wait for panel to appear (look for New contact option or panel container)
        const panel = page.locator('div[role="dialog"], [data-testid="chatlist"]');
        await panel.first().waitFor({ timeout: 5000 }).catch(() => undefined);
    }
    // 2) Click "New contact"
    // Click by visible text fallback (robust against obfuscated class names)
    let newContactClicked = await clickAny(page, [
        'div:has-text("New contact")',
        'button:has-text("New contact")',
        'div[role="button"]:has-text("New contact")',
        'li:has-text("New contact")',
        '[data-testid="new-contact"]'
    ]);
    if (!newContactClicked) {
        try {
            await page.getByText('New contact', { exact: true }).first().click({ timeout: 5000 });
            newContactClicked = true;
        }
        catch { }
    }
    if (!newContactClicked) {
        // As a final fallback, search for any element with that text and click via evaluate
        await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('*')).find(e => e.textContent?.trim() === 'New contact');
            if (el)
                el.click();
        });
    }
    // Wait for New Contact dialog/panel to be visible with better detection
    await page.waitForTimeout(1000);
    // Try multiple dialog selectors
    const dialogSelectors = [
        'div[role="dialog"]',
        '[data-testid*="contact" i]',
        'div[aria-label*="contact" i]',
        'div:has-text("Add contact")',
        'div:has-text("New contact")',
        'div[data-animate-modal-body="true"]'
    ];
    let dialogRoot;
    for (const selector of dialogSelectors) {
        const dialog = page.locator(selector);
        if (await dialog.count() > 0) {
            dialogRoot = dialog.first();
            await dialogRoot.waitFor({ timeout: 5000 }).catch(() => undefined);
            break;
        }
    }
    if (!dialogRoot) {
        throw new Error('Could not find New Contact dialog');
    }
    // 3) Fill contact form (name + phone) with multiple selector fallbacks
    const phoneDigits = normalizePhoneToDigits(phone);
    // Fill name field with comprehensive approach
    let nameFilled = false;
    // First try the specific paragraph selector
    nameFilled = await ensureParagraphText(dialogRoot, 'p.selectable-text.copyable-text.x15bjb6t.x1n2onr6', name);
    // Try alternative paragraph selectors
    if (!nameFilled) {
        const paragraphSelectors = [
            'p.selectable-text.copyable-text',
            'p[contenteditable="true"]',
            'div[contenteditable="true"] p',
            'span[contenteditable="true"]'
        ];
        for (const selector of paragraphSelectors) {
            nameFilled = await ensureParagraphText(dialogRoot, selector, name);
            if (nameFilled)
                break;
        }
    }
    // Try input field selectors
    if (!nameFilled) {
        const nameSelectors = [
            'input[aria-label="Name"]',
            'input[aria-label*="name" i]',
            'input[placeholder="Name"]',
            'input[placeholder*="name" i]',
            'input[name="name"]',
            'input[data-testid*="name" i]',
            'input[class*="name" i]',
            'input[id*="name" i]'
        ];
        nameFilled = await typeIntoWithinRoot(dialogRoot, page, nameSelectors, name);
    }
    // Try contenteditable divs
    if (!nameFilled) {
        const editableSelectors = [
            'div[role="textbox"][contenteditable="true"]',
            'div[contenteditable="true"]',
            '[contenteditable="true"]'
        ];
        nameFilled = await typeIntoWithinRoot(dialogRoot, page, editableSelectors, name);
    }
    // Try getByPlaceholder for name variations
    if (!nameFilled) {
        const namePlaceholders = ['Name', 'name', 'First name', 'Nome', 'Nombre'];
        for (const placeholder of namePlaceholders) {
            try {
                const nameField = dialogRoot.getByPlaceholder(placeholder, { exact: false });
                if (await nameField.count()) {
                    await nameField.first().click();
                    await nameField.first().fill('');
                    await nameField.first().type(name, { delay: 15 });
                    nameFilled = true;
                    break;
                }
            }
            catch { }
        }
    }
    // If still not found, try the first input field (usually name field comes first)
    if (!nameFilled) {
        try {
            const allInputs = dialogRoot.locator('input[type="text"], input:not([type]), div[contenteditable="true"], p[contenteditable="true"]');
            const inputCount = await allInputs.count();
            if (inputCount >= 1) {
                // Try first input as name field
                const nameInput = allInputs.nth(0);
                await nameInput.click();
                await nameInput.fill('');
                await nameInput.type(name, { delay: 15 });
                nameFilled = true;
            }
        }
        catch { }
    }
    if (!nameFilled) {
        console.warn('Name field not found via any selectors. Available fields:');
        try {
            const allFields = await dialogRoot.locator('input, div[contenteditable="true"], p[contenteditable="true"]').all();
            for (let i = 0; i < allFields.length; i++) {
                const attrs = await allFields[i].evaluate(el => ({
                    tagName: el.tagName,
                    type: el.getAttribute('type'),
                    placeholder: el.getAttribute('placeholder'),
                    ariaLabel: el.getAttribute('aria-label'),
                    className: el.className,
                    textContent: el.textContent?.slice(0, 50)
                }));
                console.log(`Field ${i}:`, attrs);
            }
        }
        catch { }
    }
    // Fill phone using comprehensive selectors including modern WhatsApp UI
    let phoneFilled = false;
    // Try the exact selectors first
    phoneFilled = await ensureInputValue(dialogRoot, page, 'input[aria-label="Phone number"][type="text"]', phoneDigits);
    if (!phoneFilled) {
        phoneFilled = await ensureInputValue(dialogRoot, page, 'input.selectable-text[aria-label="Phone number"][type="text"]', phoneDigits);
    }
    // Try more comprehensive selectors
    if (!phoneFilled) {
        const phoneSelectors = [
            'input[aria-label*="phone" i]',
            'input[placeholder*="phone" i]',
            'input[placeholder*="number" i]',
            'input[type="tel"]',
            'input[name*="phone" i]',
            'input[data-testid*="phone" i]',
            'input[class*="phone" i]',
            'input[id*="phone" i]',
            'div[contenteditable="true"][aria-label*="phone" i]',
            'div[contenteditable="true"][placeholder*="phone" i]'
        ];
        phoneFilled = await typeIntoWithinRoot(dialogRoot, page, phoneSelectors, phoneDigits);
    }
    // Try getByPlaceholder with multiple variations
    if (!phoneFilled) {
        const placeholderVariations = ['Phone', 'phone', 'Phone number', 'Number', 'Telefone', 'Número'];
        for (const placeholder of placeholderVariations) {
            try {
                const phonePh = dialogRoot.getByPlaceholder(placeholder, { exact: false });
                if (await phonePh.count()) {
                    await phonePh.first().fill('');
                    await phonePh.first().type(phoneDigits, { delay: 15 });
                    phoneFilled = true;
                    break;
                }
            }
            catch { }
        }
    }
    // If still not found, try to find any input field in the dialog
    if (!phoneFilled) {
        try {
            const allInputs = dialogRoot.locator('input[type="text"], input[type="tel"], input:not([type])');
            const inputCount = await allInputs.count();
            if (inputCount >= 2) {
                // Assume second input is phone (first is usually name)
                const phoneInput = allInputs.nth(1);
                await phoneInput.click();
                await phoneInput.fill('');
                await phoneInput.type(phoneDigits, { delay: 15 });
                phoneFilled = true;
            }
        }
        catch { }
    }
    if (!phoneFilled) {
        console.warn('Phone field not found via any selectors. Available inputs:');
        try {
            const allInputs = await dialogRoot.locator('input, div[contenteditable="true"]').all();
            for (let i = 0; i < allInputs.length; i++) {
                const attrs = await allInputs[i].evaluate(el => ({
                    tagName: el.tagName,
                    type: el.getAttribute('type'),
                    placeholder: el.getAttribute('placeholder'),
                    ariaLabel: el.getAttribute('aria-label'),
                    className: el.className
                }));
                console.log(`Input ${i}:`, attrs);
            }
        }
        catch { }
    }
    // Validate that both name and phone were filled before proceeding
    if (!nameFilled) {
        throw new Error('Could not fill contact name field');
    }
    if (!phoneFilled) {
        throw new Error('Could not fill phone number field. Please check if contact creation dialog is properly loaded.');
    }
    console.log(`Form filled successfully: Name="${name}", Phone="${phoneDigits}"`);
    // Wait a moment for the UI to update and save button to appear
    await page.waitForTimeout(500);
    // 4) Save contact (click the green Save button) inside dialog
    const saved = await clickAnyWithinRoot(dialogRoot, [
        'div[role="button"][aria-label="Save contact"]',
        'button[aria-label="Save contact"]',
        'div[role="button"]:has(span[data-icon="checkmark"])',
        'div[role="button"]:has(svg[title*="check" i])',
        'button:has(span[data-icon="checkmark"])',
        'button:has(svg[title*="check" i])',
        'button:has-text("Save")',
        'div[role="button"]:has-text("Save")'
    ]);
    if (!saved) {
        console.warn('Save button not found via selectors; trying fallback green button query.');
        try {
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find((b) => getComputedStyle(b).backgroundColor.includes('rgb(37,') || getComputedStyle(b).backgroundColor.includes('rgb(18,'));
                if (btn)
                    btn.click();
            });
        }
        catch { }
    }
    // Attempt to close the dialog if still open
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(300);
    // 5) After saving, prefer direct navigation to chat (header visible)
    await page.waitForSelector('div[aria-label="Chat list"]', { timeout: 20000 }).catch(() => undefined);
    const headerNameAfter = page.locator(`header span[title="${name}"]`).first();
    const headerVisible = await headerNameAfter.count().then(c => c > 0).catch(() => false);
    if (!headerVisible) {
        // Fallback to searching by name only if header not visible
        const searchField = page.locator('[data-testid="chat-list-search"], input[placeholder*="Search" i]');
        if (await searchField.count()) {
            try {
                await searchField.first().click();
                await searchField.first().fill('');
                await page.keyboard.type(name, { delay: 10 });
                const chatTitle = page.locator(`span[title="${name}"]`);
                await chatTitle.first().waitFor({ timeout: 10000 });
                await chatTitle.first().click();
            }
            catch { }
        }
    }
    // Now wait for chat composer and send message
    const composerSelectors = [
        'div[contenteditable="true"][data-tab="10"]',
        'div[contenteditable="true"][data-tab="6"]',
        '[data-testid="conversation-compose-box-input"]',
        'footer div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-tab]'
    ];
    let sent = false;
    for (const selector of composerSelectors) {
        const c = page.locator(selector);
        if (await c.count()) {
            try {
                const target = c.first();
                await target.waitFor({ timeout: 20000 });
                await target.click();
                const composerFocused = await page.evaluate((sel) => {
                    const node = document.querySelector(sel);
                    return !!node && node.getAttribute('contenteditable') === 'true' && node === document.activeElement;
                }, selector);
                if (!composerFocused)
                    continue;
                await target.type(messageText, { delay: 30 });
                await page.keyboard.press('Enter');
                sent = true;
                break;
            }
            catch { }
        }
    }
    if (!sent) {
        throw new Error('Could not locate message composer after creating contact.');
    }
    console.log(`Contact '${name}' created (or opened) and messaged at ${phoneDigits}.`);
}
async function main() {
    const name = process.env.CONTACT_NAME || '';
    const phone = process.env.PHONE || '';
    const messageText = process.env.MESSAGE_TEXT || 'hey';
    if (!name || !phone) {
        console.error('Missing CONTACT_NAME or PHONE env variables.');
        process.exit(1);
    }
    await createContactAndMessage(name, phone, messageText);
}
main();
