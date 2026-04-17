'use strict';

const logger        = require('../utils/logger');
const { randomDelay } = require('../utils/retry');
const AntiDetection = require('../browser/AntiDetection');

// ============================================================
//  FormFiller — fills in personal data on booking forms
// ============================================================
class FormFiller {
  /**
   * @param {import('puppeteer').Page} page
   * @param {Object} account  { firstName, lastName, fiscalCode, phone, … }
   * @param {string} accountId
   */
  constructor(page, account, accountId) {
    this.page      = page;
    this.account   = account;
    this.accountId = accountId;
    this.log       = logger.forAccount(accountId);
  }

  /**
   * Auto-fill all form fields found on the current page.
   * Maps account fields to common Italian form field names.
   */
  async fillForm() {
    this.log.debug('[FormFiller] Filling booking form…');

    const fieldMap = {
      // Name / cognome
      'input[name*="nome"],   input[name*="name"],   input[id*="nome"],   input[id*="name"]':    this.account.firstName,
      'input[name*="cognome"],input[name*="surname"],input[id*="cognome"],input[id*="surname"]': this.account.lastName,

      // Fiscal code
      'input[name*="fiscal"],input[name*="codicefiscale"],input[id*="fiscal"],input[id*="cf"]': this.account.fiscalCode,

      // Phone
      'input[name*="phone"],input[name*="telefono"],input[name*="tel"],input[id*="phone"],input[id*="tel"]': this.account.phone,

      // Passport
      'input[name*="passport"],input[name*="passaporto"],input[id*="passport"]': this.account.passport,

      // Birth date
      'input[name*="nascita"],input[name*="birth"],input[id*="nascita"],input[id*="birth"]': this.account.birthDate,
    };

    for (const [selector, value] of Object.entries(fieldMap)) {
      if (!value) continue;

      // Try each comma-separated sub-selector
      for (const subSel of selector.split(',').map((s) => s.trim())) {
        try {
          const el = await this.page.$(subSel);
          if (!el) continue;

          const isVisible = await this.page.evaluate(
            (e) => e.offsetParent !== null && !e.disabled && !e.readOnly,
            el
          );
          if (!isVisible) continue;

          await AntiDetection.humanType(this.page, subSel, String(value));
          await randomDelay(200, 500);
          break; // Found & filled
        } catch (_) {}
      }
    }

    // Handle dropdowns / selects
    await this._fillSelects();

    // Handle checkboxes (e.g., consent)
    await this._checkConsents();

    this.log.debug('[FormFiller] Form filled.');
  }

  async _fillSelects() {
    const selects = await this.page.$$('select');

    for (const select of selects) {
      try {
        const name = await this.page.evaluate((el) => (el.name || el.id || '').toLowerCase(), select);

        // Pick the right value based on field name
        if (name.includes('servizio') || name.includes('service')) {
          // Already on the target service — skip
        } else if (name.includes('motivo') || name.includes('reason')) {
          await select.select((await this._getFirstNonEmptyOption(select)) || '');
        }

        await randomDelay(100, 300);
      } catch (_) {}
    }
  }

  async _getFirstNonEmptyOption(selectEl) {
    return this.page.evaluate((sel) => {
      const opts = Array.from(sel.options).filter((o) => o.value.trim() !== '');
      return opts[0]?.value || null;
    }, selectEl);
  }

  async _checkConsents() {
    const checkboxes = await this.page.$$('input[type="checkbox"]:not(:checked)');

    for (const cb of checkboxes) {
      try {
        const label = await this.page.evaluate((el) => {
          const l = document.querySelector(`label[for="${el.id}"]`);
          return (l?.innerText || el.name || '').toLowerCase();
        }, cb);

        // Auto-accept privacy / consent checkboxes
        if (
          label.includes('privacy') ||
          label.includes('consent') ||
          label.includes('accetto') ||
          label.includes('acconsento') ||
          label.includes('dichiaro')
        ) {
          await cb.click();
          await randomDelay(200, 400);
          this.log.debug(`[FormFiller] Checked consent: "${label.substring(0, 40)}"`);
        }
      } catch (_) {}
    }
  }
}

module.exports = FormFiller;
