'use strict';

/**
 * Login test — run this to verify your credentials work
 * before launching the full bot.
 *
 * Usage:
 *   node scripts/test-login.js
 *   node scripts/test-login.js account-002   ← test specific account
 */

require('dotenv').config();

const path           = require('path');
const chalk          = require('chalk');
const BrowserFactory = require('../src/browser/BrowserFactory');
const LoginHandler   = require('../src/auth/LoginHandler');
const AccountManager = require('../src/accounts/AccountManager');

const targetId = process.argv[2] || null;

(async () => {
  console.log('');
  console.log(chalk.cyan('══════════════════════════════════════'));
  console.log(chalk.bold('  Prenotami — Login Test'));
  console.log(chalk.cyan('══════════════════════════════════════'));
  console.log('');

  // Load accounts
  let accounts;
  try {
    const manager = new AccountManager();
    accounts = manager.load();
  } catch (err) {
    console.log(chalk.red(`❌  Could not load accounts: ${err.message}`));
    process.exit(1);
  }

  // Pick which account to test
  const account = targetId
    ? accounts.find((a) => a.id === targetId)
    : accounts[0];

  if (!account) {
    console.log(chalk.red(`❌  Account "${targetId || 'first'}" not found in accounts.json`));
    process.exit(1);
  }

  console.log(`  Account  : ${chalk.yellow(account.id)}`);
  console.log(`  Email    : ${chalk.yellow(account.email)}`);
  console.log(`  Headless : ${chalk.yellow(process.env.HEADLESS !== 'false' ? 'yes' : 'no (browser visible)')}`);
  console.log('');
  console.log(chalk.gray('  Tip: set HEADLESS=false in .env to watch the browser'));
  console.log('');

  let browser = null;

  try {
    console.log(chalk.gray('  Launching browser…'));
    browser = await BrowserFactory.launch();
    const page = await BrowserFactory.newPage(browser);

    console.log(chalk.gray('  Navigating to IAM login portal…'));
    console.log('');

    const handler = new LoginHandler(page, account, account.id);

    const start = Date.now();
    await handler.login();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const url = page.url();
    console.log('');
    console.log(chalk.green('  ✅  LOGIN SUCCESSFUL'));
    console.log(`  Time     : ${elapsed}s`);
    console.log(`  Final URL: ${url}`);
    console.log('');
    console.log(chalk.gray('  Your credentials and selectors are working correctly.'));
    console.log(chalk.gray('  You can now run: npm start'));
    console.log('');

  } catch (err) {
    console.log('');
    console.log(chalk.red('  ❌  LOGIN FAILED'));
    console.log('');
    console.log(`  Error: ${chalk.red(err.message)}`);
    console.log('');
    console.log('  Possible causes:');
    console.log(chalk.yellow('   - Wrong email or password in accounts.json'));
    console.log(chalk.yellow('   - Site is currently down or overloaded'));
    console.log(chalk.yellow('   - IAM portal URL changed (check iam.esteri.it)'));
    console.log(chalk.yellow('   - Check screenshots/debug/ for a screenshot of what the browser saw'));
    console.log('');
    process.exitCode = 1;

  } finally {
    await BrowserFactory.close(browser);
  }
})();
