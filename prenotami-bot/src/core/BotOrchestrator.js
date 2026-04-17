'use strict';

const { EventEmitter } = require('events');
const config          = require('../../config/config');
const logger          = require('../utils/logger');
const { Bot }         = require('./Bot');
const AccountManager  = require('../accounts/AccountManager');
const TaskQueue       = require('../queue/TaskQueue');

// ============================================================
//  BotOrchestrator — runs all account bots in parallel
// ============================================================
class BotOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.accountManager = new AccountManager();
    this.queue          = new TaskQueue(config.bot.maxConcurrentAccounts);
    this.bots           = new Map();   // accountId → Bot instance
    this._running       = false;
  }

  /**
   * Load accounts and start all bots.
   * @returns {Promise<void>}
   */
  async start() {
    logger.info('═══════════════════════════════════════════');
    logger.info('  🚀 Prenotami Smart Bot — Starting Up');
    logger.info('═══════════════════════════════════════════');

    const accounts = this.accountManager.load();

    if (accounts.length === 0) {
      logger.error('❌ No active accounts found. Exiting.');
      process.exit(1);
    }

    logger.info(`📋 ${accounts.length} account(s) loaded. Concurrency: ${config.bot.maxConcurrentAccounts}`);
    this._running = true;

    // Wire queue events
    this.queue.on('taskComplete', ({ id, result }) => {
      if (result === true) {
        logger.info(`✅ [${id}] Booking CONFIRMED!`);
        this.accountManager.markBooked(id);
        this.emit('booked', id);
      } else {
        logger.info(`⏹  [${id}] Bot finished without booking.`);
      }
    });

    this.queue.on('taskError', ({ id, error }) => {
      logger.error(`❌ [${id}] Bot crashed: ${error.message}`);
      this.emit('error', { id, error });
    });

    // Enqueue one task per account
    this.queue.enqueueAll(
      accounts.map((account) => ({
        id:   account.id,
        fn:   () => this._runAccount(account),
        meta: { email: account.email },
      }))
    );

    // Wait for all to complete
    await this.queue.waitForAll();

    this._printSummary();
    this._running = false;
    this.emit('done', this.queue.getResults());
  }

  /**
   * Gracefully stop all running bots.
   */
  stopAll() {
    logger.info('[Orchestrator] Stopping all bots…');
    for (const [, bot] of this.bots) {
      bot.stop();
    }
  }

  /**
   * Get live status snapshot of all bots.
   */
  getStatus() {
    const statuses = [];
    for (const [id, bot] of this.bots) {
      statuses.push(bot.getState());
    }
    return {
      queue:   this.queue.stats,
      bots:    statuses,
      running: this._running,
    };
  }

  // ---- Private ----

  async _runAccount(account) {
    const bot = new Bot(account);
    this.bots.set(account.id, bot);

    try {
      const result = await bot.start();
      return result;
    } finally {
      this.bots.delete(account.id);
    }
  }

  _printSummary() {
    const results = this.queue.getResults();
    const booked  = Object.values(results).filter((r) => r.success && r.result === true).length;
    const failed  = Object.values(results).filter((r) => !r.success).length;
    const noSlot  = Object.values(results).filter((r) => r.success && r.result !== true).length;

    logger.info('');
    logger.info('═══════════════════════════════════════════');
    logger.info('  📊 FINAL SUMMARY');
    logger.info('═══════════════════════════════════════════');
    logger.info(`  ✅ Booked      : ${booked}`);
    logger.info(`  ⚠️  No Slot     : ${noSlot}`);
    logger.info(`  ❌ Errors      : ${failed}`);
    logger.info('═══════════════════════════════════════════');
  }
}

module.exports = BotOrchestrator;
