'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');
const { sleep } = require('../utils/retry');

// ============================================================
//  SmartScheduler v2 — real Prenotami slot window strategy
//
//  Confirmed slot release windows (Italy time / Europe/Rome):
//   WINDOW 1: 23:57 → 00:02  (midnight batch — ~1 min, very fast)
//   WINDOW 2: 06:57 → 07:32  (morning batch — ~30 min)
//
//  Everything else: bot sleeps completely.
//  No checks outside windows = no ban risk = clean account.
//
//  Tunisia note:
//   Winter (Oct–Mar): Tunisia = Italy = UTC+1
//   Summer (Mar–Oct): Italy = UTC+2, Tunisia = UTC+1
//   → Always compute windows in Europe/Rome, then inform user of
//     their local equivalent.
// ============================================================

const TIMEZONE = 'Europe/Rome';

const MODE = {
  WARMUP:  'WARMUP',   // 2-3 min before window — pre-login, pre-load calendar
  FIRE:    'FIRE',     // inside window — maximum speed checks
  SLEEP:   'SLEEP',    // rest of day — bot is idle
};

// Windows defined in Italy time.
// Start/end are "HH:MM" strings. wakeup = when bot pre-warms.
const WINDOWS = [
  {
    name:    'midnight',
    wakeup:  '23:56',    // wake up 3 min early to pre-login
    start:   '23:59',    // start firing checks
    end:     '00:02',    // stop (slots gone by now)
    overnight: true,     // crosses midnight
    interval: 2000,      // check every 2 seconds — maximum speed
    description: 'Midnight batch (1 min window)',
  },
  {
    name:    'morning',
    wakeup:  '06:57',    // wake up 3 min early
    start:   '07:00',
    end:     '07:32',
    overnight: false,
    interval: 3000,      // check every 3 seconds
    description: 'Morning batch (30 min window)',
  },
];

class SmartScheduler {
  constructor(accountId) {
    this.accountId = accountId;
    this.log = logger.forAccount(accountId);
  }

  /**
   * Get current mode based on Italy time.
   * @returns {{ mode: string, window: object|null, interval: number }}
   */
  getCurrentMode() {
    const now     = moment().tz(TIMEZONE);
    const timeStr = now.format('HH:mm');

    for (const win of WINDOWS) {
      // Check FIRE zone
      if (this._inWindow(timeStr, win.start, win.end, win.overnight)) {
        return { mode: MODE.FIRE, window: win, interval: win.interval };
      }
      // Check WARMUP zone (wakeup → start)
      if (this._inWindow(timeStr, win.wakeup, win.start, false)) {
        return { mode: MODE.WARMUP, window: win, interval: 5000 };
      }
    }

    return { mode: MODE.SLEEP, window: null, interval: 0 };
  }

  /**
   * Calculate how many milliseconds until the next wakeup.
   * @returns {{ ms: number, windowName: string, wakeupIT: string, wakeupLocal: string }}
   */
  msUntilNextWakeup() {
    const now = moment().tz(TIMEZONE);

    let nearest = null;
    let nearestMs = Infinity;

    for (const win of WINDOWS) {
      const [wh, wm] = win.wakeup.split(':').map(Number);
      let candidate = now.clone().hour(wh).minute(wm).second(0).millisecond(0);

      // If wakeup already passed today, schedule for tomorrow
      if (candidate.isSameOrBefore(now)) {
        candidate.add(1, 'day');
      }

      const diffMs = candidate.diff(now);
      if (diffMs < nearestMs) {
        nearestMs = diffMs;
        nearest = { ms: diffMs, windowName: win.name, wakeupIT: win.wakeup, win: win };
      }
    }

    // Compute Tunisia local equivalent
    const wakeupMoment = now.clone().add(nearestMs, 'ms');
    const tunisiaTime  = wakeupMoment.clone().tz('Africa/Tunis').format('HH:mm');

    return {
      ms:          nearest.ms,
      windowName:  nearest.windowName,
      wakeupIT:    nearest.wakeupIT,
      wakeupLocal: tunisiaTime,
    };
  }

  /**
   * Sleep until the next wakeup window, then return.
   * Logs the exact local (Tunisia) time the bot will wake.
   */
  async sleepUntilNextWindow() {
    const { ms, windowName, wakeupIT, wakeupLocal } = this.msUntilNextWakeup();

    const hours   = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);

    this.log.info(
      `[Scheduler] Sleeping ${hours}h ${minutes}m → ` +
      `Next window: "${windowName}" ` +
      `| Wake at ${wakeupIT} Italy time (${wakeupLocal} Tunisia time)`
    );

    // Sleep in 30-minute chunks so we can log progress
    const CHUNK = 30 * 60 * 1000;
    let remaining = ms;

    while (remaining > CHUNK) {
      await sleep(CHUNK);
      remaining -= CHUNK;
      const mLeft = Math.round(remaining / 60000);
      this.log.info(`[Scheduler] Still sleeping — ${mLeft} min until next window`);
    }

    if (remaining > 0) await sleep(remaining);

    this.log.info(`[Scheduler] Waking up for "${windowName}" window!`);
  }

  /**
   * Whether the bot should be actively checking right now.
   */
  shouldBeActive() {
    const { mode } = this.getCurrentMode();
    return mode === MODE.FIRE || mode === MODE.WARMUP;
  }

  /**
   * Current interval in ms for the active window. 0 if sleeping.
   */
  getInterval() {
    const { mode, interval } = this.getCurrentMode();
    if (mode === MODE.SLEEP) return 0;
    return interval;
  }

  /**
   * Human-readable status string.
   */
  status() {
    const now           = moment().tz(TIMEZONE);
    const tunisiaNow    = moment().tz('Africa/Tunis').format('HH:mm');
    const { mode, window: win } = this.getCurrentMode();

    const modeLabel = {
      [MODE.FIRE]:   'FIRING',
      [MODE.WARMUP]: 'WARMUP',
      [MODE.SLEEP]:  'SLEEPING',
    }[mode];

    return (
      `${now.format('HH:mm')} IT (${tunisiaNow} TN) | ` +
      `Mode: ${modeLabel}` +
      (win ? ` | Window: ${win.description}` : '')
    );
  }

  // ---- Private ----

  /**
   * Check if timeStr is within [start, end].
   * Handles overnight ranges (e.g. 23:59 → 00:02).
   */
  _inWindow(timeStr, start, end, overnight) {
    if (!overnight) {
      return timeStr >= start && timeStr <= end;
    } else {
      // Overnight: in range if time >= start OR time <= end
      return timeStr >= start || timeStr <= end;
    }
  }
}

module.exports = { SmartScheduler, MODE, WINDOWS };
