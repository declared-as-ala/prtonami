'use strict';

const { randomDelay } = require('../utils/retry');
const logger = require('../utils/logger');

// ============================================================
//  AntiDetection — human-like interaction helpers
// ============================================================
class AntiDetection {
  /**
   * Type text character by character with random delays.
   * @param {import('puppeteer').Page} page
   * @param {string} selector
   * @param {string} text
   */
  static async humanType(page, selector, text) {
    await page.focus(selector);
    await randomDelay(200, 500);

    // Clear field first
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.value = '';
    }, selector);

    for (const char of text) {
      await page.keyboard.type(char, { delay: Math.floor(Math.random() * 120) + 40 });
    }
  }

  /**
   * Move mouse to element with curve simulation, then click.
   * @param {import('puppeteer').Page} page
   * @param {string} selector
   */
  static async humanClick(page, selector) {
    const el = await page.$(selector);
    if (!el) throw new Error(`humanClick: Element not found: ${selector}`);

    const box = await el.boundingBox();
    if (!box) throw new Error(`humanClick: No bounding box for: ${selector}`);

    // Move to slightly random spot within the element
    const x = box.x + box.width  * (0.2 + Math.random() * 0.6);
    const y = box.y + box.height * (0.2 + Math.random() * 0.6);

    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 15) + 5 });
    await randomDelay(80, 250);
    await page.mouse.click(x, y);
  }

  /**
   * Scroll page randomly to mimic reading.
   * @param {import('puppeteer').Page} page
   */
  static async randomScroll(page) {
    const scrollY = Math.floor(Math.random() * 300) + 100;
    await page.evaluate((y) => window.scrollBy(0, y), scrollY);
    await randomDelay(300, 800);
    await page.evaluate((y) => window.scrollBy(0, -y / 2), scrollY);
  }

  /**
   * Simulate idle mouse movement.
   * @param {import('puppeteer').Page} page
   */
  static async idleMouseMove(page) {
    try {
      const { width, height } = await page.evaluate(() => ({
        width:  window.innerWidth,
        height: window.innerHeight,
      }));

      const moves = Math.floor(Math.random() * 3) + 2;
      for (let i = 0; i < moves; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 3 });
        await randomDelay(100, 400);
      }
    } catch (err) {
      // Silently ignore — page may have navigated
    }
  }

  /**
   * Wait for navigation with a human-like pause before interaction.
   * @param {import('puppeteer').Page} page
   * @param {Function} action
   */
  static async humanNavigate(page, action) {
    await randomDelay(400, 1000);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      action(),
    ]);
    await randomDelay(600, 1500);
  }

  /**
   * Dismiss cookie banners / GDPR popups if present.
   * @param {import('puppeteer').Page} page
   */
  static async dismissPopups(page) {
    const cookieSelectors = [
      '#cookie-accept',
      '.cookie-accept',
      '[data-testid="cookie-accept"]',
      'button[aria-label*="accetta"]',
      'button[aria-label*="accept"]',
      '#onetrust-accept-btn-handler',
      '.cc-btn.cc-allow',
    ];

    for (const sel of cookieSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          logger.debug(`[AntiDetection] Dismissed popup: ${sel}`);
          await randomDelay(300, 700);
          break;
        }
      } catch (_) {}
    }
  }
}

module.exports = AntiDetection;
