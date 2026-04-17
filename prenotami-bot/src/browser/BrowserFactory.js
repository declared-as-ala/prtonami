'use strict';

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config        = require('../../config/config');
const { getProxyArgs } = require('../utils/proxy');
const logger        = require('../utils/logger');

// ============================================================
//  BrowserFactory — hardened against Radware Bot Manager
//
//  Radware checks for:
//   1. Old / fake user agents (Chrome 52 etc)
//   2. navigator.webdriver = true
//   3. navigator.plugins being empty or [1,2,3,4,5]
//   4. Missing chrome runtime object
//   5. Headless-only APIs exposed
//   6. Missing realistic screen / hardware concurrency values
//
//  Fix: use stealth plugin ONLY (no AnonymizePlugin which injects
//  a fake old UA), set a hardcoded modern realistic UA, and patch
//  all navigator properties to match a real Windows Chrome.
// ============================================================

// Modern realistic UA — Windows 11, Chrome 124
// Hard-coded so it never randomly picks an old version
const REALISTIC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

// Apply stealth plugin once at module load
// Do NOT use AnonymizePlugin — it injects Chrome 52 UA and breaks everything
puppeteer.use(StealthPlugin());

class BrowserFactory {
  static async launch(opts = {}) {
    const args = [
      ...config.browser.args,
      ...getProxyArgs(),
      // Additional args to help pass Radware checks
      '--window-size=1366,768',
      '--start-maximized',
    ];

    const browser = await puppeteer.launch({
      headless:          opts.headless ?? config.browser.headless,
      slowMo:            config.browser.slowMo,
      defaultViewport: { width: 1366, height: 768 },
      args,
      ignoreHTTPSErrors: true,
      ...(opts.userDataDir ? { userDataDir: opts.userDataDir } : {}),
    });

    logger.debug('[Browser] Launched.');
    return browser;
  }

  static async newPage(browser) {
    const page = await browser.newPage();

    // Always use the same modern realistic UA
    // Never let user-agents library pick a random old one
    await page.setUserAgent(REALISTIC_UA);

    // Headers that match a real Italian Chrome browser
    await page.setExtraHTTPHeaders({
      'Accept-Language':           'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding':           'gzip, deflate, br',
      'Cache-Control':             'no-cache',
      'Pragma':                    'no-cache',
      'Sec-Ch-Ua':                 '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':          '?0',
      'Sec-Ch-Ua-Platform':        '"Windows"',
      'Sec-Fetch-Dest':            'document',
      'Sec-Fetch-Mode':            'navigate',
      'Sec-Fetch-Site':            'none',
      'Sec-Fetch-User':            '?1',
      'Upgrade-Insecure-Requests': '1',
    });

    // Patch all navigator / window properties Radware checks
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Realistic language settings
      Object.defineProperty(navigator, 'language',  { get: () => 'it-IT' });
      Object.defineProperty(navigator, 'languages', { get: () => ['it-IT', 'it', 'en-US', 'en'] });

      // Realistic hardware — not the headless defaults
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory',        { get: () => 8 });

      // Real plugins list — Radware checks this is not empty / not [1,2,3,4,5]
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const p = [
            { name: 'Chrome PDF Plugin',         filename: 'internal-pdf-viewer',    description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer',          filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client',              filename: 'internal-nacl-plugin',   description: '' },
          ];
          p.__proto__ = PluginArray.prototype;
          return p;
        },
      });

      // Real mimeTypes
      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => {
          const m = [];
          m.__proto__ = MimeTypeArray.prototype;
          return m;
        },
      });

      // Full chrome runtime object — Radware checks window.chrome exists
      window.chrome = {
        app:     { isInstalled: false, InstallState: {}, RunningState: {} },
        runtime: {
          PlatformOs:      {},
          PlatformArch:    {},
          PlatformNaclArch:{},
          RequestUpdateCheckStatus: {},
          OnInstalledReason:{},
          OnRestartRequiredReason:{},
          id: undefined,
          connect: () => {},
          sendMessage: () => {},
        },
        loadTimes: () => {},
        csi:       () => {},
      };

      // Permissions — headless returns denied for notifications, real Chrome prompts
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
      }

      // WebGL vendor — headless exposes SwiftShader, real Chrome shows GPU vendor
      try {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return 'Intel Inc.';           // UNMASKED_VENDOR_WEBGL
          if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
          return getParameter.call(this, parameter);
        };
      } catch (_) {}
    });

    page.on('dialog', async (d) => { await d.dismiss().catch(() => {}); });

    logger.debug('[Browser] Page ready with Radware bypass.');
    return page;
  }

  // Handle the Radware perfdrive challenge page.
  // It auto-redirects after running JS checks — just wait for it.
  static async waitForRadwareChallenge(page, timeoutMs = 15000) {
    const url = page.url();
    if (!url.includes('perfdrive.com') && !url.includes('validate.')) return;

    logger.info('[Browser] Radware challenge detected — waiting for auto-redirect…');
    try {
      await page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout:   timeoutMs,
      });
      logger.info(`[Browser] Passed Radware challenge. Now at: ${page.url()}`);
    } catch {
      logger.warn('[Browser] Radware challenge did not redirect in time.');
    }
  }

  static async close(browser) {
    try {
      if (browser && browser.isConnected()) {
        await browser.close();
        logger.debug('[Browser] Closed.');
      }
    } catch (err) {
      logger.warn(`[Browser] Close error: ${err.message}`);
    }
  }
}

module.exports = BrowserFactory;
