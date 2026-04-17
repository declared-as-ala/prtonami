'use strict';

/**
 * Quick test — sends a test message to your Telegram.
 * Run: node scripts/test-telegram.js
 */

require('dotenv').config();
const axios = require('axios');

const token  = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error('\n❌  Missing credentials in .env\n');
  console.error('   TELEGRAM_BOT_TOKEN=your_token');
  console.error('   TELEGRAM_CHAT_ID=your_chat_id\n');
  process.exit(1);
}

console.log('\n📨  Sending test message to Telegram...\n');

axios.post(
  `https://api.telegram.org/bot${token}/sendMessage`,
  {
    chat_id:                  chatId,
    text:                     '✅ Prenotami Bot — Telegram is working!\n\nYou will receive notifications here.',
    disable_web_page_preview: true,
  },
  { timeout: 10000 }
)
.then(() => {
  console.log('✅  Message sent! Check your Telegram.\n');
})
.catch((err) => {
  const detail = err.response?.data || err.message;
  console.error(`❌  Failed: ${JSON.stringify(detail)}\n`);
  console.error('Common causes:');
  console.error('  - Wrong TELEGRAM_BOT_TOKEN (check with @BotFather)');
  console.error('  - Wrong TELEGRAM_CHAT_ID (check with @userinfobot)');
  console.error('  - You never sent a message to your bot (open the bot and press Start first)\n');
  process.exit(1);
});
