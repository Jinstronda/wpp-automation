import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';

let sharedContext: BrowserContext | null = null;
let isInitialized = false;

export async function getWhatsAppPage(): Promise<Page> {
  try {
    console.log('🔍 [DEBUG] getWhatsAppPage() called');
    console.log(`🔍 [DEBUG] sharedContext: ${sharedContext ? 'exists' : 'null'}, isInitialized: ${isInitialized}`);

    if (!sharedContext || !isInitialized) {
      console.log('🔍 [DEBUG] Need to initialize browser...');
      await initializeBrowser();
      console.log('🔍 [DEBUG] initializeBrowser() completed');
    }

    if (!sharedContext) {
      console.error('❌ [ERROR] sharedContext is still null after initialization');
      throw new Error('Failed to initialize browser context');
    }

    console.log('🔍 [DEBUG] Getting pages from context...');
    const pages = sharedContext.pages();
    console.log(`🔍 [DEBUG] Found ${pages.length} existing pages`);

    let page: Page;

    if (pages.length > 0) {
      page = pages[0];
      console.log('🔍 [DEBUG] Using existing page');
    } else {
      console.log('🔍 [DEBUG] Creating new page...');
      page = await sharedContext.newPage();
      console.log('🔍 [DEBUG] New page created');
    }

    // Navigate to WhatsApp Web if not already there
    const currentUrl = page.url();
    console.log(`🔍 [DEBUG] Current URL: ${currentUrl}`);

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
    console.log('🔍 [DEBUG] Bringing page to front...');
    await page.bringToFront();
    console.log('🔍 [DEBUG] Page brought to front');

    console.log('✅ [DEBUG] getWhatsAppPage() completed successfully');
    return page;
  } catch (error) {
    console.error('❌ [ERROR] getWhatsAppPage() failed:', error);
    console.error('❌ [ERROR] Error stack:', error instanceof Error ? error.stack : 'No stack');
    throw error;
  }
}

async function initializeBrowser(): Promise<void> {
  console.log('🔍 [DEBUG] initializeBrowser() called');
  console.log(`🔍 [DEBUG] isInitialized: ${isInitialized}`);

  if (isInitialized) {
    console.log('ℹ️ Browser already initialized, skipping...');
    return;
  }

  try {
    console.log('🔍 [DEBUG] Getting user data directory...');
    const userDataDir = path.join(process.cwd(), 'state', 'chromium-profile');
    console.log(`🔍 [DEBUG] process.cwd(): ${process.cwd()}`);

    console.log('🚀 Launching browser...');
    console.log(`📁 User data directory: ${userDataDir}`);

    // MINIMAL configuration - just what's needed for persistent login
    // Window is always visible and stays in foreground
    try {
      console.log('🔍 [DEBUG] Calling chromium.launchPersistentContext...');
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
      console.log('✅ Browser context created successfully');
      console.log(`🔍 [DEBUG] sharedContext type: ${typeof sharedContext}`);
    } catch (launchError) {
      console.error('❌ CRITICAL: Failed to launch browser context');
      console.error('❌ [ERROR] Error details:', launchError);
      console.error('❌ [ERROR] Error stack:', launchError instanceof Error ? launchError.stack : 'No stack');
      throw new Error(`Failed to launch browser: ${launchError instanceof Error ? launchError.message : String(launchError)}`);
    }

    // Minimal stealth - only hide webdriver flag
    try {
      await sharedContext.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });
      console.log('✅ Stealth script added');
    } catch (scriptError) {
      console.warn('⚠️ Failed to add stealth script (non-critical):', scriptError);
      // Don't throw - this is non-critical
    }

    // Navigate to WhatsApp Web
    const pages = sharedContext.pages();
    const page = pages.length > 0 ? pages[0] : await sharedContext.newPage();
    console.log(`✅ Got page (${pages.length > 0 ? 'existing' : 'new'})`);

    console.log('🌐 Loading WhatsApp Web...');
    try {
      await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle', timeout: 60000 });
      console.log('✅ WhatsApp Web loaded');
    } catch (navError) {
      console.error('❌ Failed to navigate to WhatsApp Web:', navError);
      throw new Error(`Failed to load WhatsApp Web: ${navError instanceof Error ? navError.message : String(navError)}`);
    }

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
      console.log('⚠️ WhatsApp Web loaded but UI state unclear (may need manual check)');
    }

    isInitialized = true;
    console.log('✅ Browser initialized successfully');
  } catch (error) {
    console.error('❌ FATAL: Failed to initialize browser');
    console.error('Full error:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');

    // Clean up partial initialization
    if (sharedContext) {
      try {
        await sharedContext.close();
      } catch (closeError) {
        console.error('Failed to close context during cleanup:', closeError);
      }
      sharedContext = null;
    }
    isInitialized = false;

    throw new Error(`Browser initialization failed: ${error instanceof Error ? error.message : String(error)}`);
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