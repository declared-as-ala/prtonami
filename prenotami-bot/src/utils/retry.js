'use strict';

const logger = require('./logger');

/**
 * Retry an async function with exponential backoff.
 *
 * @param {Function} fn           - Async function to retry
 * @param {Object}   opts
 * @param {number}   opts.attempts  - Max attempts (default 5)
 * @param {number}   opts.delay     - Initial delay ms (default 2000)
 * @param {number}   opts.factor    - Backoff multiplier (default 2)
 * @param {number}   opts.maxDelay  - Cap delay ms (default 30000)
 * @param {string}   opts.label     - Name for log messages
 * @param {Function} opts.onRetry   - Called on each retry (attempt, error)
 * @returns {Promise<*>}
 */
async function retry(fn, opts = {}) {
  const {
    attempts  = 5,
    delay     = 2000,
    factor    = 2,
    maxDelay  = 30000,
    label     = 'operation',
    onRetry   = null,
  } = opts;

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt === attempts) break;

      const wait = Math.min(currentDelay, maxDelay);
      logger.warn(`[Retry] "${label}" failed (attempt ${attempt}/${attempts}). Retrying in ${wait}ms…`, {
        error: err.message,
      });

      if (onRetry) await onRetry(attempt, err);

      await sleep(wait);
      currentDelay = Math.min(currentDelay * factor, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Simple sleep helper.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max ms.
 * @param {number} min
 * @param {number} max
 * @returns {Promise<void>}
 */
async function randomDelay(min = 800, max = 2500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  await sleep(ms);
  return ms;
}

/**
 * Jittered delay — adds ±20% randomness on top of a base delay.
 * @param {number} base
 * @returns {Promise<void>}
 */
async function jitteredDelay(base) {
  const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
  await sleep(Math.max(100, Math.round(base + jitter)));
}

module.exports = { retry, sleep, randomDelay, jitteredDelay };
