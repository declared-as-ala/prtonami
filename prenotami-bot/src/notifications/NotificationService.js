'use strict';

const axios  = require('axios');
const config = require('../../config/config');
const logger = require('../utils/logger');

// ============================================================
//  NotificationService — Telegram only
// ============================================================
class NotificationService {

  async notifyBookingSuccess(accountId, slotInfo) {
    await this.send([
      '✅ APPOINTMENT BOOKED',
      '',
      `Account : ${accountId}`,
      `Date    : ${slotInfo?.date || 'N/A'}`,
      `Time    : ${slotInfo?.time || 'N/A'}`,
      `Service : ${config.booking.serviceId || 'N/A'}`,
      '',
      'Check your Prenotami account for details.',
    ]);
  }

  async notifySlotFound(accountId, slotInfo) {
    await this.send([
      '🎯 SLOT FOUND — booking now',
      '',
      `Account : ${accountId}`,
      `Date    : ${slotInfo?.date || 'any'}`,
      `Label   : ${slotInfo?.label || 'N/A'}`,
    ]);
  }

  async notifyWaitingListJoined(accountId, position) {
    const pos = position ? `Queue position: #${position}` : 'Position unknown';
    await this.send([
      '📋 JOINED WAITING LIST',
      '',
      `Account : ${accountId}`,
      pos,
      '',
      'You will receive a Prenotami email when a slot is assigned.',
      'Confirm it yourself from your inbox.',
      'Expected wait: ~35 days.',
    ]);
  }

  async notifyError(accountId, error) {
    const msg = error instanceof Error ? error.message : String(error);
    await this.send([
      `⚠️ Bot error [${accountId}]`,
      '',
      msg,
    ]);
  }

  async notifyBlocked(accountId, reason) {
    await this.send([
      `🚫 Account blocked [${accountId}]`,
      '',
      `Reason: ${reason}`,
      'Bot paused 24h — will resume automatically.',
    ]);
  }

  async notifyBotStarted(accountCount) {
    await this.send([
      '🤖 Prenotami Bot started',
      '',
      `Accounts : ${accountCount}`,
      'Windows  : 23:59 IT  |  07:00 IT',
      '',
      'Sleeping until next window.',
    ]);
  }

  async notifyWindowOpen(windowName) {
    await this.send([`⚡ Window open: ${windowName} — checking for slots now!`]);
  }

  // ============================================================
  //  Core send — plain text, no HTML parser, safe for any content
  // ============================================================
  async send(lines) {
    const message = Array.isArray(lines) ? lines.join('\n') : lines;
    const { enabled, botToken, chatId } = config.notifications.telegram;

    if (!enabled || !botToken || !chatId) {
      logger.debug(`[Notify] Telegram not configured — skipped.`);
      return;
    }

    try {
      await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          chat_id:                  chatId,
          text:                     message,
          disable_web_page_preview: true,
          // No parse_mode — plain text, never breaks on special chars
        },
        { timeout: 10000 }
      );
      logger.info(`[Notify] Telegram sent: "${message.substring(0, 60).replace(/\n/g, ' ')}"`);
    } catch (err) {
      logger.warn(`[Notify] Telegram failed: ${err.message}`);
    }
  }
}

module.exports = new NotificationService();
