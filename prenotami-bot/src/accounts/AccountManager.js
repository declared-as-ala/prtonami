'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Default accounts file path
const ACCOUNTS_FILE = path.resolve('./accounts/accounts.json');

// ============================================================
//  AccountManager — loads, validates, and manages accounts
// ============================================================
class AccountManager {
  constructor(filePath = ACCOUNTS_FILE) {
    this.filePath = filePath;
    this.accounts = [];
  }

  /**
   * Load accounts from JSON file.
   * @returns {Account[]}
   */
  load() {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(
        `Accounts file not found: ${this.filePath}\n` +
        `Please create it based on accounts/accounts.example.json`
      );
    }

    try {
      const raw  = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);

      if (!Array.isArray(data)) {
        throw new Error('accounts.json must be a JSON array.');
      }

      this.accounts = data
        .filter((acc) => acc.enabled !== false)   // skip disabled accounts
        .map((acc, i) => this._normalise(acc, i));

      logger.info(`[AccountManager] Loaded ${this.accounts.length} active account(s).`);
      return this.accounts;
    } catch (err) {
      throw new Error(`Failed to load accounts: ${err.message}`);
    }
  }

  /**
   * Get all loaded accounts.
   * @returns {Account[]}
   */
  getAll() {
    return this.accounts;
  }

  /**
   * Get a single account by id.
   * @param {string} id
   * @returns {Account|undefined}
   */
  getById(id) {
    return this.accounts.find((a) => a.id === id);
  }

  /**
   * Mark an account as successfully booked (to skip future runs).
   * @param {string} id
   */
  markBooked(id) {
    const acc = this.getById(id);
    if (acc) acc.booked = true;
    logger.info(`[AccountManager] Account ${id} marked as booked.`);
  }

  /**
   * Returns only accounts that haven't been booked yet.
   * @returns {Account[]}
   */
  getPending() {
    return this.accounts.filter((a) => !a.booked);
  }

  // ---- Private ----

  _normalise(acc, index) {
    if (!acc.email || !acc.password) {
      throw new Error(`Account[${index}] missing required fields: email, password`);
    }

    return {
      id:            acc.id            || `account-${index + 1}`,
      email:         acc.email.trim(),
      password:      acc.password,
      firstName:     acc.firstName     || acc.first_name  || '',
      lastName:      acc.lastName      || acc.last_name   || '',
      fiscalCode:    acc.fiscalCode    || acc.codice_fiscale || '',
      birthDate:     acc.birthDate     || acc.data_nascita  || '',
      phone:         acc.phone         || acc.telefono      || '',
      passport:      acc.passport      || acc.passaporto    || '',
      emailPassword: acc.emailPassword || acc.email_password || acc.password,
      imapHost:      acc.imapHost      || 'imap.gmail.com',
      imapPort:      acc.imapPort      || 993,
      enabled:       acc.enabled       !== false,
      booked:        false,
      notes:         acc.notes         || '',
    };
  }
}

module.exports = AccountManager;
