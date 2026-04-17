'use strict';

require('dotenv').config();
const axios  = require('axios');
const config = require('../../config/config');
const logger = require('./logger');

(async () => {
  logger.info('🔌 Testing connection to Prenotami…');

  try {
    const resp = await axios.get(config.urls.base, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (resp.status === 200) {
      logger.info(`✅ Prenotami reachable — HTTP ${resp.status}`);
    } else {
      logger.warn(`⚠️  Unexpected status: ${resp.status}`);
    }
  } catch (err) {
    logger.error(`❌ Cannot reach Prenotami: ${err.message}`);
    process.exit(1);
  }
})();
