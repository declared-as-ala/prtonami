'use strict';

const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs   = require('fs');
const chalk = require('chalk');
const config = require('../../config/config');

// Ensure log dir exists
const logDir = config.logging.dir;
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// ---- Custom pretty format for console ----
const consoleFormat = format.printf(({ level, message, timestamp, account, ...meta }) => {
  const ts      = chalk.gray(`[${timestamp}]`);
  const acc     = account ? chalk.cyan(` [${account}]`) : '';
  const metaStr = Object.keys(meta).length
    ? chalk.gray(` ${JSON.stringify(meta)}`)
    : '';

  const colored = {
    error: chalk.red(message),
    warn:  chalk.yellow(message),
    info:  chalk.white(message),
    debug: chalk.gray(message),
  }[level] || message;

  const lvlLabel = {
    error: chalk.bgRed.white(' ERROR '),
    warn:  chalk.bgYellow.black(' WARN  '),
    info:  chalk.bgBlue.white('  INFO '),
    debug: chalk.bgGray.white(' DEBUG '),
  }[level] || level;

  return `${ts} ${lvlLabel}${acc} ${colored}${metaStr}`;
});

// ---- File transport (structured JSON) ----
const fileTransport = new DailyRotateFile({
  dirname:       logDir,
  filename:      'bot-%DATE%.log',
  datePattern:   'YYYY-MM-DD',
  maxFiles:      '14d',
  maxSize:       '20m',
  zippedArchive: true,
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
});

const errorFileTransport = new DailyRotateFile({
  dirname:   logDir,
  filename:  'errors-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles:  '30d',
  level:     'error',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
});

// ---- Build logger ----
const logger = createLogger({
  level: config.logging.level,
  format: format.combine(
    format.timestamp({ format: 'HH:mm:ss' }),
    format.errors({ stack: true })
  ),
  transports: [
    new transports.Console({ format: consoleFormat }),
    ...(config.logging.toFile ? [fileTransport, errorFileTransport] : []),
  ],
});

// ---- Convenience child-logger factory per account ----
logger.forAccount = (accountId) =>
  logger.child({ account: accountId });

module.exports = logger;
