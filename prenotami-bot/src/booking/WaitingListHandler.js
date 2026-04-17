'use strict';

const config        = require('../../config/config');
const logger        = require('../utils/logger');
const { randomDelay, sleep } = require('../utils/retry');
const AntiDetection = require('../browser/AntiDetection');

// ============================================================
//  WaitingListHandler — manages Prenotami lista d'attesa
//
//  What the waiting list gives you:
//   1. Priority when someone cancels their appointment
//   2. Preemption rights on new daily slots
//   Average wait: 35–40 days from joining
//
//  Critical rules (missing any = lose your place):
//   - Confirm #1: click link in assignment email ASAP
//   - Confirm #2: click link ~10 days before appointment
//   - Never refuse an offered slot (= permanent removal)
//   - Max 90 days on list before must re-register
// ============================================================

// Selectors for waiting list UI elements on Prenotami
const WL_SELECTORS = {
  // The "Lista d'attesa" button / link on the service page
  joinButton: [
    'a[href*="WaitingList"]',
    'button[id*="waitinglist"]',
    'button[id*="attesa"]',
    '.waiting-list-btn',
    'input[value*="attesa" i]',
    'input[value*="waiting" i]',
    'a[href*="attesa" i]',
  ],

  // Confirmation button on the waiting list form
  confirmButton: [
    'button[type="submit"]',
    'input[type="submit"]',
    '.btn-primary',
    '#btnConferma',
  ],

  // Success / already-enrolled indicators
  successIndicators: [
    '.success',
    '.alert-success',
    '[class*="success"]',
    '#successMessage',
  ],

  alreadyEnrolled: [
    '[class*="already"]',
    '[class*="gia"]',       // "già in lista"
    '[class*="esistente"]',
  ],

  // Position in queue (e.g. "You are number 47")
  queuePosition: [
    '#queuePosition',
    '.queue-number',
    '[class*="posizione"]',
    '[class*="numero"]',
  ],
};

// Phrases that indicate waiting list is full
const WL_FULL_PHRASES = [
  'lista d\'attesa piena',
  'waiting list full',
  'lista esaurita',
  'no more places',
  'posti esauriti',
  'lista al completo',
];

// Phrases that indicate successful enrollment
const WL_SUCCESS_PHRASES = [
  'inserito in lista',
  'lista d\'attesa',
  'you have been added',
  'iscrizione effettuata',
  'richiesta inserita',
  'in coda',
];

class WaitingListHandler {
  /**
   * @param {import('puppeteer').Page} page
   * @param {Object} account
   * @param {string} accountId
   */
  constructor(page, account, accountId) {
    this.page      = page;
    this.account   = account;
    this.accountId = accountId;
    this.log       = logger.forAccount(accountId);
  }

  // ============================================================
  //  Public API
  // ============================================================

  /**
   * Check if the waiting list option is present on the current page.
   * @returns {Promise<boolean>}
   */
  async isWaitingListAvailable() {
    for (const sel of WL_SELECTORS.joinButton) {
      try {
        const el = await this.page.$(sel);
        if (el) {
          const visible = await this.page.evaluate(
            (e) => e.offsetParent !== null,
            el
          );
          if (visible) return true;
        }
      } catch (_) {}
    }

    // Also check page text for waiting list mention
    const text = await this._getPageText();
    return (
      text.includes('lista d\'attesa') ||
      text.includes('waiting list') ||
      text.includes('lista attesa')
    );
  }

  /**
   * Check if the waiting list is currently full.
   * @returns {Promise<boolean>}
   */
  async isWaitingListFull() {
    const text = await this._getPageText();
    return WL_FULL_PHRASES.some((p) => text.includes(p));
  }

  /**
   * Check if this account is already on the waiting list.
   * @returns {Promise<boolean>}
   */
  async isAlreadyEnrolled() {
    for (const sel of WL_SELECTORS.alreadyEnrolled) {
      const el = await this.page.$(sel).catch(() => null);
      if (el) return true;
    }

    const text = await this._getPageText();
    return (
      text.includes('già in lista') ||
      text.includes('already enrolled') ||
      text.includes('già iscritto')
    );
  }

  /**
   * Full flow: join the waiting list for the current service.
   * @returns {Promise<{ success: boolean, position: number|null, reason: string }>}
   */
  async joinWaitingList() {
    this.log.info('[WaitingList] Attempting to join lista d\'attesa…');

    // Already enrolled?
    if (await this.isAlreadyEnrolled()) {
      const pos = await this._getQueuePosition();
      this.log.info(`[WaitingList] Already enrolled. Position: ${pos || 'unknown'}`);
      return { success: true, position: pos, reason: 'already_enrolled' };
    }

    // Full?
    if (await this.isWaitingListFull()) {
      this.log.warn('[WaitingList] Waiting list is full — cannot join.');
      return { success: false, position: null, reason: 'list_full' };
    }

    // Find and click the join button
    const clicked = await this._clickJoinButton();
    if (!clicked) {
      this.log.warn('[WaitingList] Join button not found.');
      return { success: false, position: null, reason: 'button_not_found' };
    }

    await randomDelay(1000, 2000);

    // Fill any required form fields on the WL form
    await this._fillWaitingListForm();

    // Submit
    await this._submitForm();
    await randomDelay(1500, 3000);

    // Verify success
    const success = await this._verifyEnrollment();
    const position = success ? await this._getQueuePosition() : null;

    if (success) {
      this.log.info(`[WaitingList] Successfully joined! Queue position: ${position || 'N/A'}`);
      return { success: true, position, reason: 'joined' };
    }

    this.log.warn('[WaitingList] Enrollment result unclear.');
    return { success: false, position: null, reason: 'unknown' };
  }

  /**
   * Detect if current page is a waiting list confirmation page
   * (arrived from email link click).
   * @returns {Promise<boolean>}
   */
  async isConfirmationPage() {
    const url  = this.page.url();
    const text = await this._getPageText();

    return (
      url.includes('confirm') ||
      url.includes('conferma') ||
      url.includes('WaitingListConfirm') ||
      text.includes('conferma appuntamento') ||
      text.includes('confirm appointment') ||
      text.includes('confermato')
    );
  }

  /**
   * Click the confirm button on a WL confirmation page.
   * @returns {Promise<boolean>}
   */
  async confirmFromPage() {
    this.log.info('[WaitingList] Confirming appointment from confirmation page…');

    for (const sel of WL_SELECTORS.confirmButton) {
      try {
        const btn = await this.page.$(sel);
        if (!btn) continue;

        await AntiDetection.humanNavigate(this.page, () =>
          AntiDetection.humanClick(this.page, sel)
        );

        await randomDelay(1000, 2000);
        const text = await this._getPageText();

        if (
          text.includes('confermato') ||
          text.includes('confirmed') ||
          text.includes('successo')
        ) {
          this.log.info('[WaitingList] Appointment confirmed!');
          return true;
        }
      } catch (_) {}
    }

    return false;
  }

  // ============================================================
  //  Private helpers
  // ============================================================

  async _clickJoinButton() {
    for (const sel of WL_SELECTORS.joinButton) {
      try {
        const el = await this.page.$(sel);
        if (!el) continue;

        const visible = await this.page.evaluate(
          (e) => e.offsetParent !== null,
          el
        );
        if (!visible) continue;

        await AntiDetection.humanClick(this.page, sel);
        this.log.debug(`[WaitingList] Clicked join button: ${sel}`);
        return true;
      } catch (_) {}
    }
    return false;
  }

  async _fillWaitingListForm() {
    // Some consulates show a brief form before enrolling
    // (reason, preferred dates, etc.) — fill what we can
    try {
      const textareas = await this.page.$$('textarea');
      for (const ta of textareas) {
        const name = await this.page.evaluate(
          (e) => (e.name || e.id || '').toLowerCase(),
          ta
        );
        if (name.includes('note') || name.includes('motivo') || name.includes('reason')) {
          await AntiDetection.humanType(
            this.page,
            `textarea[name="${name}"], textarea[id="${name}"]`,
            'Richiesta appuntamento urgente'
          );
        }
      }
    } catch (_) {}
  }

  async _submitForm() {
    for (const sel of WL_SELECTORS.confirmButton) {
      try {
        const btn = await this.page.$(sel);
        if (!btn) continue;
        await AntiDetection.humanNavigate(this.page, () =>
          AntiDetection.humanClick(this.page, sel)
        );
        return;
      } catch (_) {}
    }
    // Fallback — press Enter
    await this.page.keyboard.press('Enter');
    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  }

  async _verifyEnrollment() {
    const text = await this._getPageText();
    return WL_SUCCESS_PHRASES.some((p) => text.includes(p));
  }

  async _getQueuePosition() {
    try {
      for (const sel of WL_SELECTORS.queuePosition) {
        const el = await this.page.$(sel);
        if (!el) continue;
        const raw = await this.page.evaluate((e) => e.innerText, el);
        const num = parseInt(raw.replace(/\D/g, ''), 10);
        if (!isNaN(num)) return num;
      }

      // Try parsing from page text
      const text = await this._getPageText();
      const match = text.match(/(?:numero|position|posizione|sei il numero|you are number)[^\d]*(\d+)/i);
      if (match) return parseInt(match[1], 10);
    } catch (_) {}
    return null;
  }

  async _getPageText() {
    try {
      return (await this.page.evaluate(() => document.body.innerText || '')).toLowerCase();
    } catch {
      return '';
    }
  }
}

module.exports = WaitingListHandler;
