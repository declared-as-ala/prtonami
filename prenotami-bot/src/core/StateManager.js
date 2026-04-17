'use strict';

const { EventEmitter } = require('events');
const moment = require('moment');

// ============================================================
//  StateManager — tracks global statistics and bot states
// ============================================================
class StateManager extends EventEmitter {
  constructor() {
    super();
    this._startTime   = null;
    this._stats       = {
      totalChecks:    0,
      slotsFound:     0,
      bookingsBooked: 0,
      bookingsFailed: 0,
      loginErrors:    0,
      otpSolved:      0,
      sessionRestored: 0,
    };
    this._accountStates = new Map();
  }

  // ---- Lifecycle ----

  start() {
    this._startTime = Date.now();
    this.emit('start', { time: this._startTime });
  }

  end() {
    this.emit('end', this.getSummary());
  }

  // ---- Account state tracking ----

  setAccountState(accountId, state, extra = {}) {
    this._accountStates.set(accountId, {
      accountId,
      state,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
    this.emit('stateChange', { accountId, state, ...extra });
  }

  getAccountState(accountId) {
    return this._accountStates.get(accountId) || null;
  }

  getAllAccountStates() {
    return Array.from(this._accountStates.values());
  }

  // ---- Stat increments ----

  incrementChecks()      { this._stats.totalChecks++;     this._emit(); }
  incrementSlotsFound()  { this._stats.slotsFound++;      this._emit(); }
  incrementBooked()      { this._stats.bookingsBooked++;  this._emit(); }
  incrementFailed()      { this._stats.bookingsFailed++;  this._emit(); }
  incrementLoginError()  { this._stats.loginErrors++;     this._emit(); }
  incrementOTPSolved()   { this._stats.otpSolved++;       this._emit(); }
  incrementSessionRestored() { this._stats.sessionRestored++; this._emit(); }

  // ---- Getters ----

  getStats() {
    return { ...this._stats };
  }

  getSummary() {
    const uptime = this._startTime
      ? moment.duration(Date.now() - this._startTime).humanize()
      : '—';

    return {
      uptime,
      ...this._stats,
      accounts: this.getAllAccountStates().length,
    };
  }

  getUptimeSeconds() {
    if (!this._startTime) return 0;
    return Math.floor((Date.now() - this._startTime) / 1000);
  }

  // ---- Private ----
  _emit() {
    this.emit('statsUpdate', this.getStats());
  }
}

// Singleton
module.exports = new StateManager();
