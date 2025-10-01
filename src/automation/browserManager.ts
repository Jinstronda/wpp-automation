import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';

let sharedContext: BrowserContext | null = null;
let isInitialized = false;

export async function getWhatsAppPage(): Promise<Page> {
  if (!sharedContext || !isInitialized) {
    await initializeBrowser();
  }

  if (!sharedContext) {
    throw new Error('Failed to initialize browser context');
  }

  // Get the first page or create a new one
  const pages = sharedContext.pages();
  let page: Page;

  if (pages.length > 0) {
    page = pages[0];
  } else {
    page = await sharedContext.newPage();
  }

  // Navigate to WhatsApp Web if not already there
  const currentUrl = page.url();
  if (!currentUrl.includes('web.whatsapp.com')) {
    console.log('🌐 Navigating to WhatsApp Web...');
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for either QR code or chat list
    console.log('⏳ Waiting for WhatsApp Web to load...');
    await page.waitForTimeout(3000); // Give UI time to render

    try {
      await Promise.race([
        page.waitForSelector('canvas[aria-label="Scan me!"]', { timeout: 30000, state: 'visible' }),
        page.waitForSelector('div[aria-label="Chat list"]', { timeout: 30000, state: 'visible' })
      ]);
      console.log('✅ WhatsApp Web loaded successfully');
    } catch (error) {
      console.log('⚠️ WhatsApp Web UI not detected, but continuing...');
    }
  }

  // Bring the page to the foreground so user can see the automation
  await page.bringToFront();

  return page;
}

async function initializeBrowser(): Promise<void> {
  if (isInitialized) return;

  try {
    const userDataDir = path.join(process.cwd(), 'state', 'chromium-profile');

    console.log('🚀 Launching browser...');

    // MINIMAL configuration - just what's needed for persistent login
    // Window is always visible and stays in foreground
    sharedContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1400, height: 900 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
        '--window-position=0,0', // Position at top-left
        '--disable-backgrounding-occluded-windows' // Prevent window from being hidden
      ]
    });

    // Minimal stealth - only hide webdriver flag
    await sharedContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Navigate to WhatsApp Web
    const pages = sharedContext.pages();
    const page = pages.length > 0 ? pages[0] : await sharedContext.newPage();

    console.log('🌐 Loading WhatsApp Web...');
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle', timeout: 60000 });

    // Give the page time to render
    console.log('⏳ Waiting for WhatsApp Web UI...');
    await page.waitForTimeout(3000);

    // Check what loaded
    const qrCode = await page.locator('canvas[aria-label="Scan me!"]').count();
    const chatList = await page.locator('div[aria-label="Chat list"]').count();

    if (qrCode > 0) {
      console.log('✅ QR Code detected - ready to scan');
    } else if (chatList > 0) {
      console.log('✅ Already logged in - Chat list detected');
    } else {
      console.log('⚠️ WhatsApp Web loaded but UI state unclear');
    }

    isInitialized = true;
    console.log('✅ Browser initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize browser:', error);
    throw error;
  }
}

export async function closeBrowser(): Promise<void> {
  if (sharedContext) {
    await sharedContext.close();
    sharedContext = null;
    isInitialized = false;
    console.log('🔒 Browser closed');
  }
}

export function isBrowserInitialized(): boolean {
  return isInitialized && sharedContext !== null;
}