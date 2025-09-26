import { chromium, BrowserContext } from 'playwright';
import path from 'path';
import { readLeadsCsv, Lead } from '../utils/fileUtils.js';

function normalizePhoneToDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function startChatByPhone(phoneDigits: string, presetText?: string): Promise<void> {
  const userDataDir = path.join(process.cwd(), 'state', 'chromium-profile');
  const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = context.pages()[0] ?? (await context.newPage());
  const textParam = presetText ? `?text=${encodeURIComponent(presetText)}` : '';

  // First try wa.me landing then redirect to WhatsApp Web
  await page.goto(`https://wa.me/${phoneDigits}${textParam}`, { waitUntil: 'load' });

  // Click "Continue to Chat" if present
  const continueBtn = page.locator('#action-button');
  if (await continueBtn.count()) {
    await continueBtn.click();
  }

  // Click "use WhatsApp Web" if present
  const useWebLink = page.locator('a[href*="/send?"][href*="web.whatsapp.com"]');
  if (await useWebLink.count()) {
    await useWebLink.first().click();
  }

  // Ensure we are on WhatsApp Web
  await page.waitForURL(/web\.whatsapp\.com\//, { timeout: 30000 }).catch(() => undefined);

  // Wait for composer and optionally send if presetText was not used
  const composerSelectors = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][data-tab="6"]',
    '[data-testid="conversation-compose-box-input"]',
    'div[role="textbox"][contenteditable="true"]'
  ];
  for (const selector of composerSelectors) {
    const c = page.locator(selector);
    if (await c.count()) {
      await c.first().waitFor({ timeout: 15000 }).catch(() => undefined);
      if (!presetText) {
        await c.first().click();
        await c.first().type('Hello from automation', { delay: 30 });
      }
      await page.keyboard.press('Enter');
      console.log(`Chat opened and message sent to ${phoneDigits}`);
      return;
    }
  }
  throw new Error('Could not locate composer to start chat.');
}

async function main(): Promise<void> {
  const targetName = process.env.CONTACT_NAME || '';
  const targetPhone = process.env.PHONE || '';
  const presetText = process.env.MESSAGE_TEXT || 'hey';

  let phoneDigits = targetPhone ? normalizePhoneToDigits(targetPhone) : '';
  if (!phoneDigits && targetName) {
    const leads: Lead[] = readLeadsCsv('src/data/leads.csv');
    const match = leads.find((l) => l.name.toLowerCase() === targetName.toLowerCase());
    if (!match) {
      console.error(`Lead with name '${targetName}' not found in CSV.`);
      process.exit(1);
    }
    phoneDigits = normalizePhoneToDigits(match.phone);
  }

  if (!phoneDigits) {
    console.error('Provide PHONE env var or CONTACT_NAME present in CSV.');
    process.exit(1);
  }

  await startChatByPhone(phoneDigits, presetText);
}

main();


