'use strict';

const config        = require('../../config/config');
const logger        = require('../utils/logger');
const { randomDelay, sleep } = require('../utils/retry');
const AntiDetection = require('../browser/AntiDetection');

// ============================================================
//  SlotMonitor — continuously monitors calendar for open slots
// ============================================================
class SlotMonitor {
  /**
   * @param {import('puppeteer').Page} page
   * @param {string} accountId
   */
  constructor(page, accountId) {
    this.page      = page;
    this.accountId = accountId;
    this.log       = logger.forAccount(accountId);
    this._running  = false;
  }

  /**
   * Navigate to the booking calendar for the configured service.
   */
  async goToCalendar() {
    const url = config.booking.serviceId
      ? `${config.urls.booking}/${config.booking.serviceId}`
      : config.urls.booking;

    this.log.info(`[Monitor] Navigating to booking service: ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(1000, 2000);
    await AntiDetection.dismissPopups(this.page);
  }

  /**
   * One-shot check: look for available slots on the current calendar view.
   * @returns {Promise<SlotInfo[]>} Array of available slot objects
   */
  async checkCurrentMonth() {
    this.log.debug('[Monitor] Scanning current month…');

    try {
      // Wait for calendar to render
      await this.page.waitForSelector(
        `${config.selectors.calendar.availableSlot}, ${config.selectors.calendar.unavailable}`,
        { timeout: 15000 }
      );
    } catch {
      this.log.warn('[Monitor] Calendar did not render in time.');
      return [];
    }

    // Check for "no appointments" message
    const noSlots = await this.page.$(config.selectors.calendar.unavailable);
    if (noSlots) {
      const msg = await this.page.evaluate((el) => el.innerText.trim(), noSlots).catch(() => '');
      this.log.debug(`[Monitor] No slots message: "${msg}"`);
      return [];
    }

    // Gather available slots
    const slots = await this.page.evaluate((sel) => {
      const elements = Array.from(document.querySelectorAll(sel));
      return elements.map((el) => ({
        date:     el.dataset.date   || el.getAttribute('data-date')  || el.title || '',
        label:    el.innerText.trim(),
        selector: el.id ? `#${el.id}` : null,
      }));
    }, config.selectors.calendar.availableSlot);

    if (slots.length > 0) {
      this.log.info(`[Monitor] 🎯 Found ${slots.length} available slot(s)!`);
    } else {
      this.log.debug('[Monitor] No available slots found.');
    }

    return slots;
  }

  /**
   * Check N months forward from today.
   * @param {number} monthsAhead - How many months to scan
   * @returns {Promise<SlotInfo[]>}
   */
  async checkNextMonths(monthsAhead = 3) {
    const allSlots = [];

    for (let m = 0; m < monthsAhead; m++) {
      const monthSlots = await this.checkCurrentMonth();
      allSlots.push(...monthSlots);

      if (monthSlots.length > 0) {
        this.log.info(`[Monitor] Stopping scan — slots found in month +${m}.`);
        break; // Found slots — no need to scan further
      }

      // Go to next month
      const nextBtn = await this.page.$(config.selectors.calendar.nextMonth);
      if (!nextBtn) {
        this.log.debug('[Monitor] No "next month" button — stopping scan.');
        break;
      }

      await AntiDetection.humanClick(this.page, config.selectors.calendar.nextMonth);
      await randomDelay(1000, 2000);
    }

    return allSlots;
  }

  /**
   * Reload the calendar page to get fresh data.
   */
  async refresh() {
    this.log.debug('[Monitor] Refreshing calendar page…');
    await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(800, 1500);
  }

  /**
   * Detect any blocking error on the current page.
   * @returns {Promise<string|null>} error text or null
   */
  async detectError() {
    const pageText = await this.page.evaluate(() =>
      document.body.innerText.toLowerCase()
    ).catch(() => '');

    for (const pattern of config.errorPatterns) {
      if (pageText.includes(pattern.toLowerCase())) {
        return pattern;
      }
    }
    return null;
  }
}

module.exports = SlotMonitor;
