'use strict';

require('dotenv').config();

const chalk           = require('chalk');
const BotOrchestrator = require('./core/BotOrchestrator');
const stateManager    = require('./core/StateManager');
const logger          = require('./utils/logger');

// ============================================================
//  PRENOTAMI SMART BOT — Entry Point
// ============================================================

printBanner();
stateManager.start();

const orchestrator = new BotOrchestrator();

// ---- Graceful shutdown ----
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException',  (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

// ---- Orchestrator events ----
orchestrator.on('booked', (accountId) => {
  logger.info(chalk.green.bold(`\n🎉 APPOINTMENT BOOKED — ${accountId}\n`));
});

orchestrator.on('done', (results) => {
  stateManager.end();
  const summary = stateManager.getSummary();
  logger.info(`\n🏁 All bots finished. Uptime: ${summary.uptime}`);
  process.exit(0);
});

// ---- Start ----
orchestrator.start().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});

// ---- Helpers ----

function shutdown(signal) {
  logger.info(`\n[Main] ${signal} received — shutting down gracefully…`);
  orchestrator.stopAll();
  setTimeout(() => process.exit(0), 5000);
}

function printBanner() {
  const lines = [
    '',
    chalk.cyan('╔══════════════════════════════════════════════════╗'),
    chalk.cyan('║') + chalk.bold.white('   🤖  PRENOTAMI SMART AUTOMATION BOT  v2.0      ') + chalk.cyan('║'),
    chalk.cyan('║') + chalk.gray('        The Ultimate Intelligent Booking Tool     ') + chalk.cyan('║'),
    chalk.cyan('╚══════════════════════════════════════════════════╝'),
    '',
    `  ${chalk.yellow('Node')}     : ${process.version}`,
    `  ${chalk.yellow('PID')}      : ${process.pid}`,
    `  ${chalk.yellow('Started')} : ${new Date().toLocaleString('it-IT')}`,
    '',
  ];
  lines.forEach((l) => console.log(l));
}
