'use strict';

const { EventEmitter } = require('events');
const config = require('../../config/config');
const logger = require('../utils/logger');

// ============================================================
//  TaskQueue — manages concurrent bot tasks with rate limiting
// ============================================================
class TaskQueue extends EventEmitter {
  constructor(concurrency = config.bot.maxConcurrentAccounts) {
    super();
    this.concurrency  = concurrency;
    this.running      = 0;
    this.queue        = [];
    this.completed    = 0;
    this.failed       = 0;
    this.results      = new Map();
  }

  /**
   * Add a task to the queue.
   * @param {string}   id     - Unique task identifier
   * @param {Function} fn     - Async function () => result
   * @param {Object}   [meta] - Optional metadata for logging
   */
  enqueue(id, fn, meta = {}) {
    this.queue.push({ id, fn, meta });
    logger.debug(`[Queue] Task enqueued: ${id} (queue size: ${this.queue.length})`);
    this._drain();
  }

  /**
   * Add multiple tasks at once.
   * @param {Array<{ id, fn, meta }>} tasks
   */
  enqueueAll(tasks) {
    for (const task of tasks) {
      this.enqueue(task.id, task.fn, task.meta);
    }
  }

  /**
   * Wait until all queued tasks complete.
   * @returns {Promise<void>}
   */
  async waitForAll() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.queue.length === 0 && this.running === 0) {
          resolve();
        } else {
          this.once('taskComplete', check);
          this.once('taskError',    check);
        }
      };
      check();
    });
  }

  /**
   * Get results map { id -> { success, result|error } }
   */
  getResults() {
    return Object.fromEntries(this.results);
  }

  /** ---- Private ---- */

  _drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      this._run(task);
    }
  }

  async _run({ id, fn, meta }) {
    this.running++;
    logger.debug(`[Queue] Starting task: ${id} (running: ${this.running})`);

    try {
      const result = await fn();
      this.completed++;
      this.results.set(id, { success: true, result });
      this.emit('taskComplete', { id, result, meta });
      logger.debug(`[Queue] Task done: ${id}`);
    } catch (err) {
      this.failed++;
      this.results.set(id, { success: false, error: err.message });
      this.emit('taskError', { id, error: err, meta });
      logger.warn(`[Queue] Task failed: ${id} — ${err.message}`);
    } finally {
      this.running--;
      this._drain();
    }
  }

  get stats() {
    return {
      pending:   this.queue.length,
      running:   this.running,
      completed: this.completed,
      failed:    this.failed,
    };
  }
}

module.exports = TaskQueue;
