#!/usr/bin/env node
'use strict';

/**
 * First-time setup wizard for Prenotami Smart Bot.
 * Run: node scripts/setup.js
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const COLORS = {
  reset:  '\x1b[0m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  bold:   '\x1b[1m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

(async () => {
  console.log('');
  console.log(c('cyan', '╔══════════════════════════════════════════╗'));
  console.log(c('cyan', '║') + c('bold', '   Prenotami Bot — Setup Wizard          ') + c('cyan', '║'));
  console.log(c('cyan', '╚══════════════════════════════════════════╝'));
  console.log('');

  // --- Create directories ---
  const dirs = ['./logs', './sessions', './accounts', './screenshots'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(c('green', `  ✅ Created: ${dir}`));
    } else {
      console.log(c('yellow', `  ⚡ Exists:  ${dir}`));
    }
  }
  console.log('');

  // --- Create .env from template ---
  if (!fs.existsSync('.env')) {
    const envSrc = path.resolve('.env.example');
    if (fs.existsSync(envSrc)) {
      fs.copyFileSync(envSrc, '.env');
      console.log(c('green', '  ✅ Created .env from .env.example'));
    } else {
      console.log(c('yellow', '  ⚠️  .env.example not found — skipping .env creation'));
    }
  } else {
    console.log(c('yellow', '  ⚡ .env already exists — skipping'));
  }
  console.log('');

  // --- Create accounts file ---
  const accountsFile = './accounts/accounts.json';
  if (!fs.existsSync(accountsFile)) {
    const example = path.resolve('./accounts/accounts.example.json');
    if (fs.existsSync(example)) {
      fs.copyFileSync(example, accountsFile);
      console.log(c('green', '  ✅ Created accounts/accounts.json from example'));
      console.log(c('yellow', '  👉 Edit accounts/accounts.json with your credentials!'));
    }
  } else {
    console.log(c('yellow', '  ⚡ accounts/accounts.json already exists — skipping'));
  }
  console.log('');

  // --- Quick config questions ---
  console.log(c('cyan', '  Quick configuration (press Enter to keep defaults):\n'));

  const serviceId  = await ask('  Service ID (leave blank to set later): ');
  const intervalMs = await ask('  Check interval in ms [15000]: ') || '15000';
  const headless   = await ask('  Run headless? (true/false) [true]: ') || 'true';
  const notifyTo   = await ask('  Notification email (leave blank to skip): ');

  // Patch .env
  if (fs.existsSync('.env')) {
    let env = fs.readFileSync('.env', 'utf8');

    const patch = {
      SERVICE_ID:          serviceId,
      CHECK_INTERVAL_MS:   intervalMs,
      HEADLESS:            headless,
      NOTIFY_TO:           notifyTo,
    };

    for (const [key, val] of Object.entries(patch)) {
      if (!val) continue;
      const regex = new RegExp(`^(${key}=).*$`, 'm');
      if (regex.test(env)) {
        env = env.replace(regex, `$1${val}`);
      } else {
        env += `\n${key}=${val}`;
      }
    }

    fs.writeFileSync('.env', env);
    console.log(c('green', '\n  ✅ .env updated.'));
  }

  console.log('');
  console.log(c('green', '  🎉 Setup complete!'));
  console.log('');
  console.log('  Next steps:');
  console.log(c('yellow', '   1. Edit accounts/accounts.json  — add your Prenotami credentials'));
  console.log(c('yellow', '   2. Edit .env                    — configure service ID, SMTP, etc.'));
  console.log(c('yellow', '   3. npm install                  — install dependencies'));
  console.log(c('yellow', '   4. npm test                     — verify connection to Prenotami'));
  console.log(c('yellow', '   5. npm start                    — launch the bot'));
  console.log('');

  rl.close();
})();
