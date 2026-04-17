'use strict';

const { sleep } = require('../utils/retry');
const logger    = require('../utils/logger');

// ============================================================
//  RateLimiter — adaptive rate limiting to avoid Prenotami bans
//
//  Prenotami bans confirmed triggers:
//   1. Requests "too rapid to be performed by a human operator"
//   2. Multiple booking attempts across different services
//   3. Repeated wrong password entries (3+ locks account)
//   4. IP-level anomaly (many accounts same IP)
//
//  Strategy:
//   - Track per-account request timestamps
//   - Enforce minimum spacing between page navigations
//   - Detect "Account bloccato" page → pause 24h or skip account
//   - Detect HTTP 429 / 503 → backoff exponentially
//   - Adaptive: slow down further after each warning signal
// ============================================================

const BLOCK_PHRASES = [
  'account bloccato',
  'account blocked',
  'utente bloccato',
  'too many requests',
  'troppe richieste',
  'accesso negato',
  'access denied',
  'anomalia rilevata',
  'servizio temporaneamente non disponibile',
  'sistema non disponibile',
  'riprova tra',          // "try again in X minutes"
  'wait',
  'rate limit',
];

const SOFT_BLOCK_PHRASES = [
  'riprova',              // "try again"
  'errore temporaneo',
  'temporary error',
  'please wait',
  'attendere',
];

// ---- Block severity levels ----
const SEVERITY = {
  NONE:       'NONE',
  SOFT:       'SOFT',       // slow down, add delay
  HARD:       'HARD',       // account blocked — pause 24h
  PERMANENT:  'PERMANENT',  // needs manual intervention
};

class RateLimiter {
  constructor(accountId) {
    this.accountId       = accountId;
    this.log             = logger.forAccount(accountId);

    this._lastRequestAt  = 0;
    this._requestCount   = 0;     // in current window
    this._windowStart    = Date.now();
    this._windowDuration = 60000; // 1 minute window
    this._maxPerWindow   = 6;     // max 6 page navigations per minute

    this._softBlockCount = 0;     // how many soft blocks hit
    this._blocked        = false;
    this._blockedUntil   = null;
    this._severity       = SEVERITY.NONE;

    // Adaptive interval: starts at config value, increases on warnings
    this._currentInterval = null;
  }

  // ---- Public API ----

  /**
   * Must be called before every page navigation.
   * Waits if needed to stay under rate limits.
   */
  async throttle() {
    if (this._blocked) {
      const remaining = this._blockedUntil - Date.now();
      if (remaining > 0) {
        this.log.warn(`[RateLimit] Account blocked. Waiting ${Math.round(remaining / 1000 / 60)} min…`);
        await sleep(Math.min(remaining, 30 * 60 * 1000)); // wait max 30m then recheck
        return;
      }
      // Block expired
      this._blocked   = false;
      this._severity  = SEVERITY.NONE;
      this._softBlockCount = 0;
      this.log.info('[RateLimit] Block period expired — resuming.');
    }

    // Window management
    const now = Date.now();
    if (now - this._windowStart > this._windowDuration) {
      this._windowStart   = now;
      this._requestCount  = 0;
    }

    if (this._requestCount >= this._maxPerWindow) {
      const wait = this._windowDuration - (now - this._windowStart) + 1000;
      this.log.debug(`[RateLimit] Rate window full — waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      this._windowStart  = Date.now();
      this._requestCount = 0;
    }

    // Minimum gap between requests
    const minGap    = this._getMinGap();
    const sinceLeft = Date.now() - this._lastRequestAt;
    if (sinceLeft < minGap) {
      await sleep(minGap - sinceLeft);
    }

    this._lastRequestAt = Date.now();
    this._requestCount++;
  }

  /**
   * Analyse the current page text for block indicators.
   * @param {string} pageText  Full page body text (lowercase)
   * @returns {{ severity: string, message: string|null }}
   */
  analysePageText(pageText) {
    const lower = pageText.toLowerCase();

    // Check hard blocks first
    for (const phrase of BLOCK_PHRASES) {
      if (lower.includes(phrase)) {
        return { severity: SEVERITY.HARD, message: phrase };
      }
    }

    // Check soft warnings
    for (const phrase of SOFT_BLOCK_PHRASES) {
      if (lower.includes(phrase)) {
        return { severity: SEVERITY.SOFT, message: phrase };
      }
    }

    return { severity: SEVERITY.NONE, message: null };
  }

  /**
   * React to a detected block.
   * @param {string} severity
   * @param {string} message   Detected phrase
   */
  handleBlock(severity, message) {
    this._severity = severity;

    if (severity === SEVERITY.HARD) {
      const waitMs = 24 * 60 * 60 * 1000; // 24 hours
      this._blocked      = true;
      this._blockedUntil = Date.now() + waitMs;

      this.log.error(
        `[RateLimit] 🚨 ACCOUNT BLOCKED — detected: "${message}". ` +
        `Pausing this account for 24 hours.`
      );
      return;
    }

    if (severity === SEVERITY.SOFT) {
      this._softBlockCount++;
      // Each soft block doubles the interval (max 5 minutes)
      const penalty = Math.min(5 * 60 * 1000, (this._softBlockCount * 2) * 60 * 1000);
      this.log.warn(
        `[RateLimit] Soft block detected: "${message}". ` +
        `Soft count: ${this._softBlockCount}. Cooling down ${penalty / 1000}s.`
      );
      // Non-blocking — caller handles the sleep
      return penalty;
    }

    return 0;
  }

  /**
   * Check HTTP status code for rate-limiting responses.
   * @param {number} status
   * @returns {number} milliseconds to wait (0 if ok)
   */
  handleHttpStatus(status) {
    if (status === 429) {
      const wait = 5 * 60 * 1000; // 5 minutes for HTTP 429
      this.log.warn(`[RateLimit] HTTP 429 received — waiting ${wait / 1000}s`);
      return wait;
    }
    if (status === 503) {
      const wait = 2 * 60 * 1000; // 2 minutes for 503
      this.log.warn(`[RateLimit] HTTP 503 — server overloaded. Waiting ${wait / 1000}s`);
      return wait;
    }
    return 0;
  }

  /**
   * Returns whether this account is currently hard-blocked.
   */
  isBlocked() {
    if (!this._blocked) return false;
    if (Date.now() >= this._blockedUntil) {
      this._blocked = false;
      return false;
    }
    return true;
  }

  /**
   * How long until block expires (ms). Returns 0 if not blocked.
   */
  blockedFor() {
    if (!this._blocked) return 0;
    return Math.max(0, this._blockedUntil - Date.now());
  }

  /**
   * Increase the minimum gap between requests permanently
   * (called when bot detects increased risk).
   * @param {number} factor  Multiplier (e.g. 1.5 = 50% slower)
   */
  slowDown(factor = 1.5) {
    if (!this._currentInterval) {
      const config = require('../../config/config');
      this._currentInterval = config.booking.checkIntervalMs;
    }
    this._currentInterval = Math.min(
      this._currentInterval * factor,
      10 * 60 * 1000  // cap at 10 minutes
    );
    this.log.debug(`[RateLimit] Slowed down. New interval: ${this._currentInterval / 1000}s`);
  }

  /**
   * Reset adaptive slowdown back to configured base interval.
   */
  resetInterval() {
    this._currentInterval = null;
    this._softBlockCount  = 0;
  }

  // ---- Private ----

  _getMinGap() {
    const config = require('../../config/config');
    const base   = this._currentInterval || config.booking.checkIntervalMs;

    // Add jitter ±20% to avoid predictable timing
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    return Math.max(3000, base + jitter);
  }
}

module.exports = RateLimiter;
