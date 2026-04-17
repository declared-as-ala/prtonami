'use strict';

const cron    = require('node-cron');
const logger  = require('../utils/logger');

// ============================================================
//  Scheduler — wraps node-cron for timed bot runs
// ============================================================
class Scheduler {
  constructor() {
    this._tasks = new Map();
  }

  /**
   * Schedule a job with a cron expression.
   * @param {string}   name     - Unique name for this job
   * @param {string}   expr     - Cron expression e.g. '*/15 * * * *'
   * @param {Function} fn       - Async function to execute
   * @param {boolean}  [runNow] - Run immediately in addition to schedule
   */
  schedule(name, expr, fn, runNow = false) {
    if (this._tasks.has(name)) {
      logger.warn(`[Scheduler] Task "${name}" already scheduled — replacing.`);
      this.cancel(name);
    }

    if (!cron.validate(expr)) {
      throw new Error(`[Scheduler] Invalid cron expression for "${name}": ${expr}`);
    }

    const task = cron.schedule(expr, async () => {
      logger.debug(`[Scheduler] Running task: ${name}`);
      try {
        await fn();
      } catch (err) {
        logger.error(`[Scheduler] Task "${name}" failed: ${err.message}`);
      }
    }, { scheduled: true, timezone: 'Europe/Rome' });

    this._tasks.set(name, task);
    logger.info(`[Scheduler] Task "${name}" scheduled (${expr}).`);

    if (runNow) {
      setImmediate(async () => {
        logger.debug(`[Scheduler] Immediate run: ${name}`);
        try { await fn(); } catch (err) {
          logger.error(`[Scheduler] Immediate run "${name}" failed: ${err.message}`);
        }
      });
    }
  }

  /**
   * Cancel a scheduled task by name.
   * @param {string} name
   */
  cancel(name) {
    const task = this._tasks.get(name);
    if (task) {
      task.stop();
      this._tasks.delete(name);
      logger.info(`[Scheduler] Task "${name}" cancelled.`);
    }
  }

  /**
   * Cancel all scheduled tasks.
   */
  cancelAll() {
    for (const [name] of this._tasks) {
      this.cancel(name);
    }
  }

  /**
   * List all scheduled task names.
   * @returns {string[]}
   */
  listTasks() {
    return Array.from(this._tasks.keys());
  }
}

module.exports = new Scheduler(); // Singleton
