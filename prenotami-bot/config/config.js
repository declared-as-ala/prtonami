'use strict';

require('dotenv').config();

// ============================================================
//  PRENOTAMI BOT — Central Configuration
// ============================================================

const config = {
  // ---- URLs ----
  urls: {
    base:       process.env.PRENOTAMI_BASE_URL || 'https://prenotami.esteri.it',
    login:      process.env.LOGIN_URL          || 'https://prenotami.esteri.it/UserArea',
    booking:    `${process.env.PRENOTAMI_BASE_URL || 'https://prenotami.esteri.it'}/Services`,
    calendar:   `${process.env.PRENOTAMI_BASE_URL || 'https://prenotami.esteri.it'}/Services/Booking`,
  },

  // ---- Booking target ----
  booking: {
    serviceId:       process.env.SERVICE_ID            || null,
    dateFrom:        process.env.APPOINTMENT_DATE_FROM || null,
    dateTo:          process.env.APPOINTMENT_DATE_TO   || null,
    checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS, 10) || 15000,
  },

  // ---- Bot behaviour ----
  bot: {
    maxRetryAttempts:      parseInt(process.env.MAX_RETRY_ATTEMPTS, 10) || 5,
    retryDelayMs:          parseInt(process.env.RETRY_DELAY_MS,     10) || 3000,
    randomDelayMin:        parseInt(process.env.RANDOM_DELAY_MIN,   10) || 800,
    randomDelayMax:        parseInt(process.env.RANDOM_DELAY_MAX,   10) || 2500,
    maxConcurrentAccounts: parseInt(process.env.MAX_CONCURRENT_ACCOUNTS, 10) || 5,
  },

  // ---- Browser ----
  browser: {
    headless:          process.env.HEADLESS          !== 'false',
    slowMo:            parseInt(process.env.SLOW_MO, 10) || 0,
    rotateUserAgent:   process.env.ROTATE_USER_AGENT !== 'false',
    useStealthPlugin:  process.env.USE_STEALTH_PLUGIN !== 'false',
    defaultViewport: {
      width:  1366,
      height: 768,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-blink-features=AutomationControlled',
    ],
  },

  // ---- Proxy ----
  proxy: {
    enabled:  process.env.USE_PROXY === 'true',
    host:     process.env.PROXY_HOST     || null,
    port:     process.env.PROXY_PORT     || null,
    username: process.env.PROXY_USERNAME || null,
    password: process.env.PROXY_PASSWORD || null,
  },

  // ---- Notifications (Telegram only) ----
  notifications: {
    telegram: {
      enabled:  process.env.NOTIFY_TELEGRAM === 'true',
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId:   process.env.TELEGRAM_CHAT_ID   || '',
    },
  },

  // ---- Logging ----
  logging: {
    level:     process.env.LOG_LEVEL  || 'info',
    toFile:    process.env.LOG_TO_FILE !== 'false',
    dir:       process.env.LOG_DIR    || './logs',
  },

  // ---- Sessions ----
  sessions: {
    dir:          process.env.SESSION_DIR   || './sessions',
    reuseSessions: process.env.REUSE_SESSIONS !== 'false',
  },

  // ---- Selectors (CSS selectors for Prenotami pages) ----
  selectors: {
    login: {
      email:    '#login-email',
      password: '#login-password',
      submit:   'button[type="submit"], input[type="submit"]',
      error:    '.alert-danger, .error-message',
    },
    services: {
      serviceRow:    '.service-row, tr[data-id]',
      serviceButton: 'a.btn, button.prenotaBtn',
    },
    calendar: {
      availableSlot: '.day-available, .slot-available, td.available',
      unavailable:   '.no-slots, .unavailable-message',
      nextMonth:     '.next-month, .calendar-next',
      timeSlot:      '.time-slot, .orario',
    },
    booking: {
      confirmButton: 'button[type="submit"], .confirm-btn',
      successMessage: '.success, .conferma, .booking-confirmed',
      otpInput:       '#otp, input[name="otp"]',
      otpSubmit:      '.otp-submit, button.verifica',
    },
  },

  // ---- Error messages to detect ----
  errorPatterns: [
    'nessun appuntamento disponibile',
    'no appointments available',
    'non ci sono posti',
    'servizio non disponibile',
    'errore di sistema',
    'session expired',
    'sessione scaduta',
  ],
};

module.exports = config;
