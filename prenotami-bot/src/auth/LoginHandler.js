'use strict';

const config         = require('../../config/config');
const logger         = require('../utils/logger');
const { retry, randomDelay, sleep } = require('../utils/retry');
const AntiDetection  = require('../browser/AntiDetection');
const BrowserFactory = require('../browser/BrowserFactory');
const { authenticateProxy } = require('../utils/proxy');

// ============================================================
//  LoginHandler — iam.esteri.it SSO portal
//
//  Confirmed selectors:
//    username → input[name="callback_1"]
//    password → input[name="callback_2"]
//
//  After successful login, Prenotami redirects to:
//    https://prenotami.esteri.it/?cid=xxxxxxxx
// ============================================================

const LOGIN_URL =
  'https://iam.esteri.it/signin/?realm=/external' +
  '&goto=https%3A%2F%2Fiam.esteri.it%2Flogin%2Foauth2%2Fauthorize' +
  '%3Fresponse_type%3Dcode%26client_id%3Dprenotami-fo' +
  '%26redirect_uri%3Dhttps%3A%2F%2Fprenotami.esteri.it%2Fpingid' +
  '%26scope%3Dopenid' +
  '&authIndexType=service&authIndexValue=LoginExternal';

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button[class*="btn-primary"]',
  '.btn-primary',
  'input[type="submit"]',
];

class LoginHandler {
  constructor(page, credentials, accountId) {
    this.page        = page;
    this.credentials = credentials;
    this.accountId   = accountId;
    this.log         = logger.forAccount(accountId);
  }

  async login() {
    return retry(async (attempt) => {
      this.log.info(`[Login] Attempt ${attempt}`);

      // Guard: "Requesting main frame too early" happens when the page
      // is still mid-navigation from a previous attempt. Wait for it.
      await sleep(1500);

      await authenticateProxy(this.page);

      try {
        await this.page.goto(LOGIN_URL, {
          waitUntil: 'domcontentloaded',
          timeout:   60000,
        });
      } catch (err) {
        // Navigation may have been interrupted by a redirect — that's fine
        if (!err.message.includes('Navigation timeout') &&
            !err.message.includes('net::ERR')) {
          this.log.debug(`[Login] goto warning (non-fatal): ${err.message}`);
        } else {
          throw err;
        }
      }

      // Handle Radware Bot Manager challenge if intercepted
      await BrowserFactory.waitForRadwareChallenge(this.page, 20000);

      // Vue app needs time to render
      await sleep(3000);
      await AntiDetection.dismissPopups(this.page);

      // Check BEFORE trying to fill form — login may have already succeeded
      // (e.g. on retry 2+, session cookie already valid)
      if (await this._isLoggedIn()) {
        this.log.info('[Login] Already authenticated.');
        return true;
      }

      await this._waitForForm();
      await this._fillForm();
      await this._submit();

      // Wait for OAuth redirect — can take 3–6 seconds
      await sleep(5000);

      if (await this._isLoggedIn()) {
        this.log.info('[Login] Login successful.');
        return true;
      }

      const errMsg = await this._getErrorMessage();
      if (errMsg) throw new Error(`Login rejected: ${errMsg}`);

      await this._debugScreenshot('login-failed');
      throw new Error(`Login did not redirect. Current URL: ${this.page.url()}`);

    }, {
      attempts: config.bot.maxRetryAttempts,
      delay:    config.bot.retryDelayMs,
      label:    `login:${this.accountId}`,
    });
  }

  // ---- Private ----

  async _waitForForm() {
    this.log.debug('[Login] Waiting for IAM form…');

    // Before waiting, check if we somehow already landed on prenotami (logged in)
    if (await this._isLoggedIn()) return;

    try {
      await this.page.waitForSelector('input[name="callback_1"]', { timeout: 45000 });
      await this.page.waitForSelector('input[name="callback_2"]', { timeout: 10000 });
    } catch {
      // Check one more time — maybe the login redirect happened during the wait
      if (await this._isLoggedIn()) return;

      await this._debugScreenshot('form-not-found');
      throw new Error(
        `Form not found after 45s.\n` +
        `URL: ${this.page.url()}\n` +
        `Check screenshots/debug/ for what the browser saw.`
      );
    }
  }

  async _fillForm() {
    this.log.debug('[Login] Typing credentials…');

    await this.page.$eval('input[name="callback_1"]', (el) => { el.value = ''; });
    await this.page.focus('input[name="callback_1"]');
    await randomDelay(300, 600);
    await AntiDetection.humanType(this.page, 'input[name="callback_1"]', this.credentials.email);
    await randomDelay(400, 800);

    await this.page.$eval('input[name="callback_2"]', (el) => { el.value = ''; });
    await this.page.focus('input[name="callback_2"]');
    await randomDelay(300, 600);
    await AntiDetection.humanType(this.page, 'input[name="callback_2"]', this.credentials.password);
    await randomDelay(500, 1000);

    await AntiDetection.idleMouseMove(this.page);
    await randomDelay(400, 700);
  }

  async _submit() {
    this.log.debug('[Login] Submitting…');

    for (const sel of SUBMIT_SELECTORS) {
      try {
        const btn = await this.page.$(sel);
        if (!btn) continue;
        const ok = await this.page.evaluate(
          (el) => el.offsetParent !== null && !el.disabled, btn
        );
        if (!ok) continue;
        this.log.debug(`[Login] Clicking: ${sel}`);
        await Promise.allSettled([
          this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
          this.page.click(sel),
        ]);
        return;
      } catch (_) {}
    }

    // Fallback
    this.log.warn('[Login] No button matched — pressing Enter');
    await this.page.focus('input[name="callback_2"]');
    await Promise.allSettled([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      this.page.keyboard.press('Enter'),
    ]);
  }

  async _isLoggedIn() {
    try {
      const url = this.page.url();

      // All confirmed post-login URL patterns
      if (
        // Landing page after OAuth — the ?cid= token is the session identifier
        (url.includes('prenotami.esteri.it') && url.includes('cid='))    ||
        url.includes('prenotami.esteri.it/Services')                      ||
        url.includes('prenotami.esteri.it/UserArea')                      ||
        url.includes('prenotami.esteri.it/Home')                          ||
        url.includes('prenotami.esteri.it/pingid')
      ) return true;

      // Logout link present = authenticated session active
      const logout = await this.page.$(
        'a[href*="logout"], a[href*="Logout"], a[href*="signout"], a[href*="Logoff"]'
      );
      return !!logout;
    } catch { return false; }
  }

  async _getErrorMessage() {
    try {
      for (const sel of ['.alert-danger', '.error-message', '[class*="error"]']) {
        const el = await this.page.$(sel);
        if (el) {
          const text = await this.page.evaluate((e) => e.innerText.trim(), el);
          if (text) return text;
        }
      }
    } catch {}
    return null;
  }

  async _debugScreenshot(name) {
    try {
      const fs   = require('fs');
      const path = require('path');
      const dir  = './screenshots/debug';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${this.accountId}-${name}-${Date.now()}.png`);
      await this.page.screenshot({ path: file, fullPage: true });
      this.log.info(`[Login] Debug screenshot: ${file}`);
    } catch (_) {}
  }
}

module.exports = LoginHandler;
