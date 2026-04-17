'use strict';

const fs   = require('fs');
const path = require('path');
const config = require('../../config/config');
const logger = require('../utils/logger');

// ============================================================
//  SessionManager — save/restore cookies & localStorage
// ============================================================
class SessionManager {
  /**
   * @param {string} accountId - Unique identifier for the account
   */
  constructor(accountId) {
    this.accountId  = accountId;
    this.sessionDir = path.join(config.sessions.dir, accountId);
    this.cookiesFile = path.join(this.sessionDir, 'cookies.json');
    this.storageFile = path.join(this.sessionDir, 'storage.json');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  /**
   * Save page cookies to disk.
   * @param {import('puppeteer').Page} page
   */
  async saveCookies(page) {
    try {
      const cookies = await page.cookies();
      fs.writeFileSync(this.cookiesFile, JSON.stringify(cookies, null, 2));
      logger.debug(`[Session:${this.accountId}] Cookies saved (${cookies.length}).`);
    } catch (err) {
      logger.warn(`[Session:${this.accountId}] Could not save cookies: ${err.message}`);
    }
  }

  /**
   * Restore cookies from disk to page.
   * @param {import('puppeteer').Page} page
   * @returns {boolean} whether cookies were loaded
   */
  async restoreCookies(page) {
    if (!fs.existsSync(this.cookiesFile)) return false;

    try {
      const raw     = fs.readFileSync(this.cookiesFile, 'utf8');
      const cookies = JSON.parse(raw);

      if (!Array.isArray(cookies) || cookies.length === 0) return false;

      await page.setCookie(...cookies);
      logger.info(`[Session:${this.accountId}] Restored ${cookies.length} cookies.`);
      return true;
    } catch (err) {
      logger.warn(`[Session:${this.accountId}] Could not restore cookies: ${err.message}`);
      return false;
    }
  }

  /**
   * Check if a saved session exists and is not empty.
   * @returns {boolean}
   */
  hasSession() {
    if (!config.sessions.reuseSessions) return false;
    if (!fs.existsSync(this.cookiesFile)) return false;

    try {
      const cookies = JSON.parse(fs.readFileSync(this.cookiesFile, 'utf8'));
      return Array.isArray(cookies) && cookies.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Delete saved session (e.g., on logout / session expiry).
   */
  clearSession() {
    [this.cookiesFile, this.storageFile].forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    logger.info(`[Session:${this.accountId}] Session cleared.`);
  }

  /**
   * Returns the user-data dir path for Puppeteer profile isolation.
   * @returns {string}
   */
  getUserDataDir() {
    const dir = path.join(this.sessionDir, 'chrome-profile');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

module.exports = SessionManager;
