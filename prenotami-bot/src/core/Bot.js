'use strict';

const config                   = require('../../config/config');
const logger                   = require('../utils/logger');
const { sleep }                = require('../utils/retry');
const BrowserFactory           = require('../browser/BrowserFactory');
const SessionManager           = require('../auth/SessionManager');
const LoginHandler             = require('../auth/LoginHandler');
const SlotMonitor              = require('../booking/SlotMonitor');
const BookingHandler           = require('../booking/BookingHandler');
const WaitingListHandler       = require('../booking/WaitingListHandler');
const notify                   = require('../notifications/NotificationService');
const RateLimiter              = require('../protection/RateLimiter');
const { SmartScheduler, MODE } = require('../protection/SmartScheduler');

const STATE = {
  IDLE:       'IDLE',
  SLEEPING:   'SLEEPING',
  WARMUP:     'WARMUP',
  FIRING:     'FIRING',
  BOOKING:    'BOOKING',
  JOINING_WL: 'JOINING_WL',
  BLOCKED:    'BLOCKED',
  DONE:       'DONE',
  ERROR:      'ERROR',
};

// ============================================================
//  Bot v5 — clean, no IMAP, no OTP, no email access
//
//  Flow:
//   • Sleeps all day
//   • Wakes up 3 min before 23:59 IT and 07:00 IT
//   • During fire window:
//     1. Checks for direct slots — books immediately if found
//     2. If no slots — joins waiting list (once per window)
//   • All events → Telegram notification to you
//   • Waiting list confirmation email → you handle yourself
// ============================================================
class Bot {
  constructor(account) {
    this.account      = account;
    this.accountId    = account.id;
    this.log          = logger.forAccount(this.accountId);
    this.session      = new SessionManager(this.accountId);
    this.rateLimiter  = new RateLimiter(this.accountId);
    this.scheduler    = new SmartScheduler(this.accountId);

    this.browser      = null;
    this.page         = null;
    this.state        = STATE.IDLE;
    this.booked       = false;
    this.wlJoined     = false;

    this._stopRequested = false;
  }

  async start() {
    this.log.info(`[Bot] Starting — ${this.scheduler.status()}`);
    try {
      return await this._masterLoop();
    } catch (err) {
      this._setState(STATE.ERROR);
      this.log.error(`[Bot] Fatal: ${err.message}`);
      await notify.notifyError(this.accountId, err);
      return false;
    } finally {
      await this._cleanup();
    }
  }

  stop() { this._stopRequested = true; }

  getState() {
    return {
      accountId: this.accountId,
      state:     this.state,
      booked:    this.booked,
      wlJoined:  this.wlJoined,
      blocked:   this.rateLimiter.isBlocked(),
      status:    this.scheduler.status(),
    };
  }

  // ============================================================
  //  Master loop
  // ============================================================
  async _masterLoop() {
    while (!this._stopRequested && !this.booked) {
      const { mode } = this.scheduler.getCurrentMode();

      if (mode === MODE.SLEEP) {
        this._setState(STATE.SLEEPING);
        await this._cleanup();
        await this.scheduler.sleepUntilNextWindow();
        continue;
      }

      if (mode === MODE.WARMUP) {
        this._setState(STATE.WARMUP);
        this.log.info('[Bot] Warmup — pre-loading session and calendar…');
        await this._initBrowser();
        await this._login();
        await this.session.saveCookies(this.page);
        const monitor = new SlotMonitor(this.page, this.accountId);
        await monitor.goToCalendar();
        await this._waitForFireMode();
        await notify.notifyWindowOpen(this.scheduler.getCurrentMode().window?.name || 'window');
        await this._fireWindow(monitor);
        continue;
      }

      if (mode === MODE.FIRE) {
        this._setState(STATE.FIRING);
        await this._initBrowser();
        await this._login();
        const monitor = new SlotMonitor(this.page, this.accountId);
        await monitor.goToCalendar();
        await this._fireWindow(monitor);
        continue;
      }
    }

    return this.booked;
  }

  // ============================================================
  //  Fire window
  // ============================================================
  async _fireWindow(monitor) {
    this._setState(STATE.FIRING);
    this.log.info('[Bot] FIRE — checking at maximum speed!');

    let checkedWL = false;

    while (!this._stopRequested && !this.booked) {
      const { mode, interval } = this.scheduler.getCurrentMode();

      if (mode === MODE.SLEEP) {
        this.log.info('[Bot] Window closed — going to sleep.');
        break;
      }

      if (this.rateLimiter.isBlocked()) {
        this._setState(STATE.BLOCKED);
        break;
      }

      // Block detection
      const pageText = await this._getPageText();
      const { severity, message } = this.rateLimiter.analysePageText(pageText);

      if (severity === 'HARD') {
        this.rateLimiter.handleBlock(severity, message);
        this._setState(STATE.BLOCKED);
        await notify.notifyBlocked(this.accountId, message);
        break;
      }
      if (severity === 'SOFT') {
        const penalty = this.rateLimiter.handleBlock(severity, message) || 30000;
        await sleep(penalty);
        await monitor.refresh().catch(() => monitor.goToCalendar());
        continue;
      }

      // Try direct slots
      let slots = [];
      try {
        slots = await monitor.checkNextMonths(3);
      } catch (err) {
        this.log.warn(`[Bot] Scan error: ${err.message}`);
        await sleep(interval || 3000);
        await monitor.refresh().catch(() => monitor.goToCalendar());
        continue;
      }

      if (slots.length > 0) {
        this.log.info(`[Bot] Slot found — booking now!`);
        await notify.notifySlotFound(this.accountId, slots[0]);
        this._setState(STATE.BOOKING);
        const booked = await this._attemptBooking(slots);
        if (booked) { this.booked = true; return; }
        this._setState(STATE.FIRING);
        await monitor.goToCalendar();
        continue;
      }

      // No direct slots — try waiting list once per window
      if (!checkedWL) {
        checkedWL = true;
        await this._handleWaitingList(monitor);
      }

      await sleep(interval || 3000);
      await monitor.refresh().catch(() => monitor.goToCalendar());
    }
  }

  // ============================================================
  //  Waiting list
  // ============================================================
  async _handleWaitingList(monitor) {
    this._setState(STATE.JOINING_WL);

    const wl = new WaitingListHandler(this.page, this.account, this.accountId);

    if (!(await wl.isWaitingListAvailable())) {
      this.log.info('[Bot] Waiting list not available.');
      this._setState(STATE.FIRING);
      return;
    }

    if (this.wlJoined) {
      this.log.info('[Bot] Already on waiting list — skipping.');
      this._setState(STATE.FIRING);
      return;
    }

    const result = await wl.joinWaitingList();

    if (result.success) {
      this.wlJoined = true;
      await notify.notifyWaitingListJoined(this.accountId, result.position);
    } else {
      this.log.warn(`[Bot] Could not join waiting list: ${result.reason}`);
    }

    await monitor.goToCalendar().catch(() => {});
    this._setState(STATE.FIRING);
  }

  // ============================================================
  //  Booking (no OTP step)
  // ============================================================
  async _attemptBooking(slots) {
    const h = new BookingHandler(this.page, this.account, this.accountId);
    const booked = await h.bookFirstAvailable(slots).catch(() => false);
    if (!booked) return false;
    await notify.notifyBookingSuccess(this.accountId, slots[0]);
    return true;
  }

  // ============================================================
  //  Helpers
  // ============================================================
  async _waitForFireMode() {
    while (true) {
      const { mode } = this.scheduler.getCurrentMode();
      if (mode === MODE.FIRE || mode === MODE.SLEEP) return;
      await sleep(1000);
    }
  }

  async _initBrowser() {
    if (this.browser && this.browser.isConnected()) return;
    this.browser = await BrowserFactory.launch({ userDataDir: this.session.getUserDataDir() });
    this.page    = await BrowserFactory.newPage(this.browser);
    this.page.on('response', (r) => {
      const w = this.rateLimiter.handleHttpStatus(r.status());
      if (w > 0) sleep(w);
    });
  }

  async _login() {
    if (this.session.hasSession()) {
      await this.page.goto(config.urls.base, { waitUntil: 'networkidle2', timeout: 30000 });
      const ok = await this.session.restoreCookies(this.page);
      if (ok) {
        await this.page.goto(config.urls.login, { waitUntil: 'networkidle2', timeout: 30000 });
        if (!this.page.url().includes('login')) return;
        this.session.clearSession();
      }
    }
    const h = new LoginHandler(this.page, this.account, this.accountId);
    await h.login();
  }

  async _getPageText() {
    try { return (await this.page.evaluate(() => document.body.innerText || '')).toLowerCase(); }
    catch { return ''; }
  }

  _setState(s) { this.state = s; this.log.debug(`[Bot] → ${s}`); }

  async _cleanup() {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.session.saveCookies(this.page).catch(() => {});
      }
    } catch (_) {}
    await BrowserFactory.close(this.browser);
    this.browser = null;
    this.page    = null;
  }
}

module.exports = { Bot, STATE };
