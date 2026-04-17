'use strict';

const config        = require('../../config/config');
const logger        = require('../utils/logger');
const { retry, randomDelay } = require('../utils/retry');
const AntiDetection = require('../browser/AntiDetection');
const FormFiller    = require('./FormFiller');

// ============================================================
//  BookingHandler — selects a slot and drives the booking flow
// ============================================================
class BookingHandler {
  /**
   * @param {import('puppeteer').Page} page
   * @param {Object} account   Full account object (credentials + personal data)
   * @param {string} accountId
   */
  constructor(page, account, accountId) {
    this.page      = page;
    this.account   = account;
    this.accountId = accountId;
    this.log       = logger.forAccount(accountId);
    this.formFiller = new FormFiller(page, account, accountId);
  }

  /**
   * Attempt to book the first available slot.
   * @param {import('../booking/SlotMonitor').SlotInfo[]} slots
   * @returns {Promise<boolean>} true if booking confirmed
   */
  async bookFirstAvailable(slots) {
    if (!slots || slots.length === 0) return false;

    const slot = this._filterBestSlot(slots);
    if (!slot) {
      this.log.warn('[Booking] No slot matched date filter criteria.');
      return false;
    }

    this.log.info(`[Booking] Attempting slot: ${slot.date || slot.label}`);

    return retry(async (attempt) => {
      this.log.debug(`[Booking] Booking attempt ${attempt}…`);

      await this._selectSlot(slot);
      await this._selectTimeSlot();
      await this.formFiller.fillForm();
      const confirmed = await this._confirmBooking();

      if (confirmed) {
        this.log.info('[Booking] ✅ Booking CONFIRMED!');
        await this._takeSuccessScreenshot();
        return true;
      }

      throw new Error('Booking confirmation not detected.');
    }, {
      attempts: 3,
      delay:    3000,
      label:    `booking:${this.accountId}`,
    });
  }

  // ---- Private ----

  /**
   * Filter slots by configured date range.
   */
  _filterBestSlot(slots) {
    const { dateFrom, dateTo } = config.booking;

    if (!dateFrom && !dateTo) return slots[0];

    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo   ? new Date(dateTo)   : null;

    const filtered = slots.filter((slot) => {
      if (!slot.date) return true; // no date info — accept
      const d = new Date(slot.date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });

    return filtered[0] || null;
  }

  async _selectSlot(slot) {
    this.log.debug(`[Booking] Clicking slot: "${slot.label}"`);

    if (slot.selector) {
      await AntiDetection.humanClick(this.page, slot.selector);
    } else {
      // Try clicking by date attribute
      const sel = `[data-date="${slot.date}"], [title="${slot.date}"]`;
      await AntiDetection.humanClick(this.page, sel);
    }

    await randomDelay(800, 1500);
    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  }

  async _selectTimeSlot() {
    const timeSlotSel = config.selectors.calendar.timeSlot;
    const timeSlot = await this.page.$(timeSlotSel);

    if (!timeSlot) {
      this.log.debug('[Booking] No time-slot picker found — skipping.');
      return;
    }

    this.log.debug('[Booking] Selecting first available time slot…');
    await AntiDetection.humanClick(this.page, timeSlotSel);
    await randomDelay(500, 1000);
  }

  async _confirmBooking() {
    const confirmSel = config.selectors.booking.confirmButton;

    const btn = await this.page.$(confirmSel);
    if (!btn) {
      this.log.warn('[Booking] Confirm button not found.');
      return false;
    }

    await AntiDetection.humanNavigate(this.page, () =>
      AntiDetection.humanClick(this.page, confirmSel)
    );

    // Check for success indicator
    await this.page.waitForSelector(config.selectors.booking.successMessage, {
      timeout: 15000,
    }).catch(() => {});

    const success = await this.page.$(config.selectors.booking.successMessage);
    return !!success;
  }

  async _takeSuccessScreenshot() {
    try {
      const fs   = require('fs');
      const path = require('path');
      const dir  = path.join('./screenshots', this.accountId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const filename = path.join(dir, `success-${Date.now()}.png`);
      await this.page.screenshot({ path: filename, fullPage: true });
      this.log.info(`[Booking] Screenshot saved: ${filename}`);
    } catch (err) {
      this.log.debug(`[Booking] Could not save screenshot: ${err.message}`);
    }
  }
}

module.exports = BookingHandler;
