import { getWhatsAppPage } from './browserManager.js';
import { markContactProcessed, normalizePhoneNumber, extractPhoneWithCountry, validatePhonePreFlight, processMessageTemplate } from '../utils/fileUtils.js';
import { aiMessageGenerator } from '../utils/aiMessageGenerator.js';
// Remove this duplicate function since we're importing normalizePhoneNumber from fileUtils
// function normalizePhoneToDigits(phone: string): string {
//   return phone.replace(/\D/g, '');
// }
async function clickAny(page, selectors) {
    for (const selector of selectors) {
        const el = page.locator(selector);
        if (await el.count()) {
            try {
                await el.first().click({ timeout: 1000 }); // Reduced from 5000ms to 1000ms
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
                await el.first().click({ timeout: 1000 }); // Reduced from 5000ms to 1000ms
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
                await target.fill(value); // Use fill() to prevent duplicates - atomic operation
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
    try {
        await p.click();
        await p.fill(value); // Use fill() instead of type() - atomic, no duplicates
        const ok = await p.evaluate((node, v) => node.textContent?.trim() === v, value);
        return ok;
    }
    catch {
        return false;
    }
}
async function ensureInputValue(root, page, selector, value) {
    const input = root.locator(selector).first();
    if (!(await input.count()))
        return false;
    try {
        await input.click();
        await input.fill(value); // Use fill() - atomic, no duplicates
        const ok = await input.evaluate((n, v) => n.value.replace(/\D/g, '') === v.replace(/\D/g, ''), value);
        return ok;
    }
    catch {
        return false;
    }
}
async function selectCountryFromDropdown(dialogRoot, page, country) {
    console.log(`Attempting to select country: ${country.name} (${country.code})`);
    try {
        // Find and click the country dropdown button - Simplified to essential working selectors
        const countryDropdownSelectors = [
            'button[aria-label*="Country:"]', // EXACT working selector from testing
            'div[role="button"][aria-label*="Country:"]', // Generic fallback
            'div.x1y1aw1k.xs9asl8' // User provided selector as final fallback
        ];
        let dropdownClicked = false;
        for (const selector of countryDropdownSelectors) {
            const dropdown = dialogRoot.locator(selector);
            if (await dropdown.count()) {
                try {
                    await dropdown.first().click({ timeout: 3000 });
                    console.log(`✅ Clicked country dropdown with selector: ${selector}`);
                    dropdownClicked = true;
                    break;
                }
                catch (e) {
                    console.log(`Failed to click dropdown with selector ${selector}: ${e}`);
                }
            }
        }
        if (!dropdownClicked) {
            console.log('❌ Could not find country dropdown button');
            return false;
        }
        // Wait for the dropdown/search interface to appear - based on testing
        await page.waitForTimeout(1000);
        // Look for the search textbox within the dropdown popup - EXACT working approach from Playwright testing
        let searchTextbox = null;
        // First try the exact working Playwright approach - scope to dropdown container
        try {
            const dropdownContainer = page.locator('#wa-popovers-bucket');
            if (await dropdownContainer.count()) {
                searchTextbox = dropdownContainer.getByRole('textbox');
                if (await searchTextbox.count()) {
                    console.log(`✅ Found search textbox in dropdown container (Playwright method)`);
                }
                else {
                    searchTextbox = null;
                }
            }
        }
        catch (e) {
            console.log(`Dropdown container method failed: ${e}`);
            searchTextbox = null;
        }
        // Fallback: try other selectors but still scope to avoid main search textbox
        if (!searchTextbox) {
            const searchTextboxSelectors = [
                'textbox', // Last resort - may find wrong textbox
                'input[type="text"]',
                'input[placeholder*="Search" i]',
                'input[aria-label*="Search" i]',
                'div[contenteditable="true"]'
            ];
            for (const selector of searchTextboxSelectors) {
                const input = page.locator(selector);
                if (await input.count()) {
                    searchTextbox = input.first();
                    console.log(`✅ Found search textbox with fallback selector: ${selector}`);
                    break;
                }
            }
        }
        if (!searchTextbox) {
            console.log('❌ Could not find search textbox in country dropdown');
            await page.keyboard.press('Escape');
            return false;
        }
        // Clear the search field and type the country name - tested approach
        await searchTextbox.click();
        await searchTextbox.fill('');
        await page.waitForTimeout(300);
        // Type the country name - tested working approach
        console.log(`Typing "${country.name}" in search textbox...`);
        await searchTextbox.type(country.name, { delay: 50 });
        // Wait for search results to filter - crucial for accuracy
        await page.waitForTimeout(800);
        // Look for the specific country button in the filtered results - CONFIRMED working selectors from live testing
        const countryButtonSelectors = [
            `button:has-text("🇬🇧 ${country.name} ${country.prefix}")`, // EXACT format confirmed by live testing
            `button:has-text("${country.name} ${country.prefix}")`, // Without flag emoji
            `button:has-text("${country.name}")`, // Simplified - most reliable
            `listitem button:has-text("${country.name}")`, // Within listitem structure
            `button[role="button"]:has-text("${country.name}")`, // Fallback
            `[role="option"] button:has-text("${country.name}")`, // Fallback
            `[role="listitem"] button:has-text("${country.name}")`, // Fallback
            `button:has-text("${country.prefix}")` // Prefix only fallback
        ];
        let countrySelected = false;
        for (const selector of countryButtonSelectors) {
            const countryButton = page.locator(selector);
            const buttonCount = await countryButton.count();
            if (buttonCount > 0) {
                try {
                    console.log(`✅ Found country button with selector: ${selector}`);
                    await countryButton.first().click({ timeout: 3000 });
                    console.log(`✅ Successfully clicked country button for ${country.name}`);
                    countrySelected = true;
                    break;
                }
                catch (e) {
                    console.log(`Failed to click country button with selector ${selector}: ${e}`);
                }
            }
        }
        // If specific button clicking failed, try a more general approach
        if (!countrySelected) {
            console.log(`Trying to find any button containing "${country.name}"...`);
            try {
                const anyCountryButton = page.locator(`button:has-text("${country.name}")`);
                const count = await anyCountryButton.count();
                if (count > 0) {
                    await anyCountryButton.first().click();
                    console.log(`✅ Successfully clicked general country button for ${country.name}`);
                    countrySelected = true;
                }
            }
            catch (e) {
                console.log(`General button click also failed: ${e}`);
            }
        }
        // If clicking still fails, try Enter key as last resort
        if (!countrySelected) {
            console.log(`Trying Enter key to select first filtered result...`);
            try {
                await searchTextbox.press('Enter');
                await page.waitForTimeout(500);
                // Check if dropdown closed (indicating selection worked)
                const dropdownStillOpen = await page.locator('textbox, input[type="text"]').count();
                if (dropdownStillOpen === 0) {
                    console.log(`✅ Country selected via Enter key`);
                    countrySelected = true;
                }
            }
            catch (e) {
                console.log(`Enter key approach failed: ${e}`);
            }
        }
        if (!countrySelected) {
            console.log(`❌ Could not select country ${country.name} with any approach`);
            await page.keyboard.press('Escape');
            return false;
        }
        // Wait for dropdown to close and form to update
        await page.waitForTimeout(800);
        console.log(`✅ Successfully selected country: ${country.name}`);
        return true;
    }
    catch (error) {
        console.error(`❌ Error selecting country ${country.name}:`, error);
        // Try to close any open dropdown
        await page.keyboard.press('Escape').catch(() => { });
        return false;
    }
}
async function createContactAndMessage(name, phone, messageContent, messageMode = 'template', contactData) {
    const phoneDigits = normalizePhoneNumber(phone);
    // FAST PRE-FLIGHT VALIDATION - Check blacklist and format BEFORE launching browser
    console.log(`⚡ Pre-flight validation for ${name} (${phoneDigits})`);
    const validation = validatePhonePreFlight(phone, name);
    if (!validation.isValid) {
        const skipIcon = validation.skipReason === 'blacklist' ? '🚫' :
            validation.skipReason === 'test_number' ? '🧪' :
                validation.skipReason === 'invalid_format' ? '📝' : '❌';
        console.log(`${skipIcon} FAST SKIP: ${validation.reason}`);
        // For blacklist hits, just skip (already in database)
        if (validation.skipReason === 'blacklist') {
            return;
        }
        // For new invalid formats, mark them in blacklist for future speed
        if (validation.skipReason === 'invalid_format' || validation.skipReason === 'test_number') {
            markContactProcessed(name, phoneDigits, 'invalid_phone', validation.reason);
        }
        throw new Error(validation.reason);
    }
    console.log(`✅ Pre-flight passed for ${name} (${phoneDigits}) - launching browser`);
    // Extract country information from the original phone number (before normalization)
    const { country, localNumber } = extractPhoneWithCountry(phone);
    // Use shared browser manager to get WhatsApp page
    const page = await getWhatsAppPage();
    try {
        // 1) Click New Chat (plus icon) using resilient selectors
        const newChatSelectors = [
            'button[aria-label="New chat"]',
            '[aria-label="New chat"]',
            'button[role="button"][aria-label="New chat"]',
            '[data-testid="chat-new"]',
            '[data-testid="menu-bar-new-chat"]',
            'div[role="button"][title="New chat"]',
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
            await panel.first().waitFor({ timeout: 2000 }).catch(() => undefined);
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
                await page.getByText('New contact', { exact: true }).first().click({ timeout: 1000 });
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
        await page.waitForTimeout(500);
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
                await dialogRoot.waitFor({ timeout: 2000 }).catch(() => undefined);
                break;
            }
        }
        if (!dialogRoot) {
            throw new Error('Could not find New Contact dialog');
        }
        // 3) Fill contact form (name + phone) with multiple selector fallbacks
        // Using phoneDigits variable declared at the top of the function
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
                if (nameFilled) {
                    console.log(`✅ Name filled using paragraph selector: ${selector}`);
                    break;
                }
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
            if (nameFilled) {
                console.log(`✅ Name filled using input selector`);
            }
        }
        // Try contenteditable divs
        if (!nameFilled) {
            const editableSelectors = [
                'div[role="textbox"][contenteditable="true"]',
                'div[contenteditable="true"]',
                '[contenteditable="true"]'
            ];
            nameFilled = await typeIntoWithinRoot(dialogRoot, page, editableSelectors, name);
            if (nameFilled) {
                console.log(`✅ Name filled using contenteditable`);
            }
        }
        // Try getByPlaceholder for name variations
        if (!nameFilled) {
            const namePlaceholders = ['Name', 'name', 'First name', 'Nome', 'Nombre'];
            for (const placeholder of namePlaceholders) {
                try {
                    const nameField = dialogRoot.getByPlaceholder(placeholder, { exact: false });
                    if (await nameField.count()) {
                        await nameField.first().click();
                        await nameField.first().fill(name); // Use fill() instead of fill('') + type() to prevent duplication
                        nameFilled = true;
                        console.log(`✅ Name filled using placeholder: ${placeholder}`);
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
                    // Try first input as name field - use fill() to avoid duplication
                    const nameInput = allInputs.nth(0);
                    await nameInput.click();
                    await nameInput.fill(name); // Use fill() instead of type() to prevent duplication
                    nameFilled = true;
                    console.log(`✅ Name filled using first input field`);
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
        // Handle country selection if an international number was detected
        if (country && country.code !== 'PT') {
            console.log(`International number detected for ${country.name} (${country.code}). Selecting country from dropdown...`);
            const countrySelected = await selectCountryFromDropdown(dialogRoot, page, country);
            if (countrySelected) {
                console.log(`Successfully selected country: ${country.name}`);
                // After selecting country, we need to re-fill the phone field with the local number
                // since the country selection might clear or modify the phone field
                await page.waitForTimeout(500); // Wait for UI to update after country selection
                const localPhoneSelectors = [
                    'input[aria-label*="phone" i]',
                    'input[placeholder*="phone" i]',
                    'input[type="tel"]',
                    'input[aria-label="Phone number"][type="text"]'
                ];
                let localPhoneFilled = false;
                for (const selector of localPhoneSelectors) {
                    const phoneInput = dialogRoot.locator(selector);
                    if (await phoneInput.count()) {
                        try {
                            await phoneInput.first().click();
                            await phoneInput.first().fill('');
                            await phoneInput.first().type(localNumber, { delay: 15 });
                            localPhoneFilled = true;
                            console.log(`Re-filled phone field with local number: ${localNumber}`);
                            break;
                        }
                        catch { }
                    }
                }
                if (!localPhoneFilled) {
                    console.warn('Could not re-fill phone field with local number after country selection');
                }
            }
            else {
                console.warn(`Failed to select country ${country.name}. Proceeding with default country.`);
            }
        }
        else if (country && country.code === 'PT') {
            console.log(`Portuguese number detected. Using default country setting.`);
        }
        else {
            console.log(`No specific country detected for phone ${phone}. Using default country setting.`);
        }
        // Validate that both name and phone were filled before proceeding
        if (!nameFilled) {
            throw new Error('Could not fill contact name field');
        }
        if (!phoneFilled) {
            throw new Error('Could not fill phone number field. Please check if contact creation dialog is properly loaded.');
        }
        console.log(`Form filled successfully: Name="${name}", Phone="${phoneDigits}"`);
        // Wait a moment for the UI to update and check for validation messages
        await page.waitForTimeout(500);
        // Check for various error messages that can appear immediately after filling the phone field
        console.log('Checking for WhatsApp validation messages...');
        // FIRST: Check for "not on WhatsApp" message immediately after phone entry
        const notOnWhatsAppSelectors = [
            ':text("This phone number is not on WhatsApp")',
            ':text("This phone number is not on WhatsApp.")',
            ':text("not on WhatsApp")',
            '[class*="error"]:has-text("not on WhatsApp")',
            '[role="alert"]:has-text("not on WhatsApp")'
        ];
        let notOnWhatsAppDetected = false;
        for (const selector of notOnWhatsAppSelectors) {
            const count = await page.locator(selector).count();
            if (count > 0) {
                console.log(`Phone number ${phoneDigits} is not on WhatsApp - detected immediately after phone entry with selector: ${selector}`);
                markContactProcessed(name, phoneDigits, 'not_on_whatsapp', 'This phone number is not on WhatsApp');
                await page.keyboard.press('Escape').catch(() => undefined);
                await page.waitForTimeout(500);
                throw new Error(`Phone number ${phoneDigits} is not on WhatsApp. Contact marked as invalid.`);
            }
        }
        // Check for "not a valid phone number" message (exact text from your screenshot)
        const invalidPhoneSelectors = [
            'text="This is not a valid phone number."',
            'text="This is not a valid phone number"',
            ':text("This is not a valid phone number")',
            '[class*="error"]:has-text("valid phone number")',
            '[role="alert"]:has-text("valid phone number")',
            'span:has-text("This is not a valid phone number")',
            'div:has-text("This is not a valid phone number")'
        ];
        let invalidPhoneDetected = false;
        for (const selector of invalidPhoneSelectors) {
            try {
                const elements = await page.locator(selector).count();
                if (elements > 0) {
                    console.log(`Invalid phone number detected with selector: ${selector}`);
                    invalidPhoneDetected = true;
                    break;
                }
            }
            catch (e) {
                // Continue checking other selectors
            }
        }
        if (invalidPhoneDetected) {
            console.log(`Phone number ${phoneDigits} is not a valid phone number (WhatsApp validation failed)`);
            markContactProcessed(name, phoneDigits, 'invalid_phone', 'This is not a valid phone number');
            // Simply close the dialog and stay in WhatsApp - no navigation needed
            await page.keyboard.press('Escape').catch(() => undefined);
            await page.waitForTimeout(500);
            throw new Error(`Phone number ${phoneDigits} is not a valid phone number. Contact marked as invalid.`);
        }
        // Check for "not on WhatsApp" message
        const notOnWhatsAppElements = await page.locator(':text("This phone number is not on WhatsApp")').count();
        if (notOnWhatsAppElements > 0) {
            console.log(`Phone number ${phoneDigits} is not on WhatsApp`);
            markContactProcessed(name, phoneDigits, 'not_on_whatsapp', 'This phone number is not on WhatsApp');
            // Simply close the dialog and stay in WhatsApp - no navigation needed
            await page.keyboard.press('Escape').catch(() => undefined);
            await page.waitForTimeout(500);
            throw new Error(`Phone number ${phoneDigits} is not on WhatsApp. Contact marked as invalid.`);
        }
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
        // THIRD: Check for "not on WhatsApp" message after save attempt
        const notOnWhatsAppElements3 = await page.locator(':text("This phone number is not on WhatsApp")').count();
        if (notOnWhatsAppElements3 > 0) {
            console.log(`Phone number ${phoneDigits} is not on WhatsApp - detected after save attempt`);
            markContactProcessed(name, phoneDigits, 'not_on_whatsapp', 'This phone number is not on WhatsApp');
            await page.keyboard.press('Escape').catch(() => undefined);
            await page.waitForTimeout(500);
            throw new Error(`Phone number ${phoneDigits} is not on WhatsApp. Contact marked as invalid.`);
        }
        // 5) After saving contact, always go back to search and find the contact by name
        console.log(`Contact saved. Now searching for "${name}" to start conversation...`);
        // Wait for chat list to be visible
        await page.waitForSelector('div[aria-label="Chat list"]', { timeout: 5000 }).catch(() => undefined);
        // Search for the contact by name - optimized to avoid duplicate clicks
        const searchSelectors = [
            '[data-testid="chat-list-search"]',
            'input[placeholder*="Search" i]',
            'div[contenteditable="true"][data-tab="3"]',
            'div[role="textbox"][data-tab="3"]'
        ];
        let searchField = null;
        // First, find a working search field
        for (const selector of searchSelectors) {
            const field = page.locator(selector);
            if (await field.count()) {
                searchField = field.first();
                console.log(`Found search field with selector: ${selector}`);
                break;
            }
        }
        if (!searchField) {
            throw new Error('Could not find search field');
        }
        // Clear and fill search field - use fill() to prevent duplication
        try {
            await searchField.click();
            await page.waitForTimeout(200);
            await searchField.fill(name); // Use fill() instead of fill('') + type() to prevent duplication
            await page.waitForTimeout(800); // Wait for search results
            console.log(`Filled search field with "${name}"`);
        }
        catch (e) {
            throw new Error(`Failed to fill search field: ${e}`);
        }
        // Now look for the contact in search results - try multiple strategies
        let contactClicked = false;
        // Strategy 1: Try exact name match
        try {
            console.log(`🔍 Trying exact match for: "${name}"`);
            const chatTitle = page.locator(`span[title="${name}"]`);
            await chatTitle.first().waitFor({ timeout: 2000, state: 'visible' });
            await chatTitle.first().click();
            console.log(`✅ Found and clicked exact match: ${name}`);
            contactClicked = true;
        }
        catch (e) {
            console.log(`⚠️ Exact match not found, trying alternatives...`);
        }
        // Strategy 2: If exact match failed, try any search result (first result)
        if (!contactClicked) {
            try {
                console.log(`🔍 Looking for any search result...`);
                // Try different selectors for search results
                const resultSelectors = [
                    'div[data-testid="cell-frame-container"]',
                    'div[role="listitem"]',
                    'div[class*="x10l6tqk"]',
                    'span[dir="auto"][title]'
                ];
                for (const selector of resultSelectors) {
                    const results = page.locator(selector);
                    const count = await results.count();
                    console.log(`   Found ${count} results with selector: ${selector}`);
                    if (count > 0) {
                        await results.first().click();
                        console.log(`✅ Clicked first search result`);
                        contactClicked = true;
                        break;
                    }
                }
            }
            catch (e) {
                console.log(`⚠️ Could not find any search results: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        // Strategy 3: If still no results, clear search and go back to main page
        if (!contactClicked) {
            console.log(`❌ No search results found for "${name}" - clearing search field`);
            try {
                // Clear the search field
                if (searchField) {
                    await searchField.click();
                    await page.waitForTimeout(200);
                    await searchField.fill('');
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);
                    console.log(`🔄 Search cleared, returned to main page`);
                }
            }
            catch (clearError) {
                console.log(`⚠️ Failed to clear search: ${clearError instanceof Error ? clearError.message : String(clearError)}`);
            }
            throw new Error(`Could not find contact "${name}" in search results after multiple attempts`);
        }
        // IMPORTANT: Do NOT clear the search field after clicking contact!
        // Testing with Playwright MCP revealed that:
        // 1. The search field remaining visible is NORMAL WhatsApp behavior
        // 2. Clicking "Cancel search" or clearing search EXITS the chat entirely
        // 3. The message composer is a separate element that coexists with the search field
        // 4. Clearing search would return us to the main chat list, losing the conversation
        // Wait for the chat to fully load and composer to be ready
        console.log(`⏳ Waiting for chat composer to be ready...`);
        await page.waitForTimeout(2000); // Give the chat time to fully load
        // Generate the final message NOW that contact is successfully created and we're in their chat
        console.log(`📝 Generating message for ${name}...`);
        let finalMessage;
        if (messageMode === 'ai-prompt' && contactData) {
            // AI Prompt mode: Use AI to generate message based on custom prompt
            console.log(`🤖 Using AI prompt mode for ${name}`);
            // Replace variables in the prompt template
            const promptWithVars = processMessageTemplate(messageContent, contactData);
            // Generate AI message using the custom prompt
            finalMessage = await aiMessageGenerator.generateOpenerMessage({
                ...contactData,
                // Pass the custom prompt as a system instruction context
                promptVariant: promptWithVars
            });
            console.log(`✅ AI generated message: "${finalMessage}"`);
        }
        else {
            // Template mode: Simple variable replacement
            if (contactData) {
                finalMessage = processMessageTemplate(messageContent, contactData);
            }
            else {
                // Fallback if no contact data provided
                finalMessage = messageContent;
            }
            console.log(`📝 Using template message: "${finalMessage}"`);
        }
        // Now wait for chat composer and send message
        console.log(`🔍 Looking for message composer...`);
        const composerSelectors = [
            'div[contenteditable="true"][data-tab="10"]',
            'div[contenteditable="true"][data-tab="6"]',
            '[data-testid="conversation-compose-box-input"]',
            'footer div[contenteditable="true"][role="textbox"]',
            'div[contenteditable="true"][data-tab]',
            'footer div[contenteditable="true"]'
        ];
        let sent = false;
        for (const selector of composerSelectors) {
            console.log(`🔍 Trying composer selector: ${selector}`);
            const c = page.locator(selector);
            const count = await c.count();
            console.log(`   Found ${count} elements`);
            if (count > 0) {
                try {
                    const target = c.first();
                    console.log(`   Waiting for element to be visible...`);
                    await target.waitFor({ timeout: 5000, state: 'visible' });
                    console.log(`   Clicking composer...`);
                    await target.click();
                    await page.waitForTimeout(300); // Wait for focus
                    // Click again to ensure focus
                    await target.click();
                    await page.waitForTimeout(300);
                    console.log(`   Typing message: "${finalMessage.substring(0, 50)}..."`);
                    await target.type(finalMessage, { delay: 30 });
                    console.log(`   Pressing Enter to send...`);
                    await page.waitForTimeout(500); // Wait before pressing Enter
                    await page.keyboard.press('Enter');
                    sent = true;
                    console.log(`✅ Message sent successfully using selector: ${selector}`);
                    break;
                }
                catch (error) {
                    console.log(`   ⚠️ Failed with this selector: ${error instanceof Error ? error.message : String(error)}`);
                    continue;
                }
            }
        }
        if (!sent) {
            console.error(`❌ Failed to send message - tried ${composerSelectors.length} selectors`);
            throw new Error('Could not locate message composer after creating contact.');
        }
        console.log(`Contact '${name}' created (or opened) and messaged at ${phoneDigits}.`);
        // Mark contact as successfully processed
        markContactProcessed(name, phoneDigits, 'processed');
    }
    finally {
        // Only close browser context if there was a critical error
        // For normal operation (successful or recoverable errors), keep browser open
        // The browser will be closed when the process ends or manually
    }
}
export { createContactAndMessage };
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
// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
