'use strict';

const config = require('../../config/config');
const logger = require('./logger');

/**
 * Returns Puppeteer browser args + auth handler for proxy (if enabled).
 */
function getProxyArgs() {
  const { enabled, host, port } = config.proxy;

  if (!enabled || !host || !port) return [];

  const proxyUrl = `http://${host}:${port}`;
  logger.info(`[Proxy] Using proxy: ${proxyUrl}`);

  return [`--proxy-server=${proxyUrl}`];
}

/**
 * Authenticates a page with proxy credentials (if required).
 * Must be called before page.goto().
 * @param {import('puppeteer').Page} page
 */
async function authenticateProxy(page) {
  const { enabled, username, password } = config.proxy;

  if (enabled && username && password) {
    await page.authenticate({ username, password });
    logger.debug('[Proxy] Proxy authentication set.');
  }
}

/**
 * Returns a formatted proxy URL string for Axios / HTTP clients.
 * @returns {string|null}
 */
function getProxyUrl() {
  const { enabled, host, port, username, password } = config.proxy;

  if (!enabled || !host || !port) return null;

  const auth = username && password ? `${username}:${password}@` : '';
  return `http://${auth}${host}:${port}`;
}

module.exports = { getProxyArgs, authenticateProxy, getProxyUrl };
