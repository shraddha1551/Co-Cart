/** GET /health — liveness plus DB and Redis status (FR-API-01). */
const { Router } = require('express');
const config = require('../config');
const { query } = require('../db/pool');
const { h } = require('../lib/errors');

const started = Date.now();

module.exports = ({ redis }) => Router().get('/health', h(async (req, res) => {
  const [db, cache] = await Promise.allSettled([query('SELECT 1'), redis?.ping()]);
  let redisStatus = 'disabled';
  if (config.redisUrl) redisStatus = redis && cache.status === 'fulfilled' ? 'ok' : 'error';
  const dbStatus = db.status === 'fulfilled' ? 'ok' : 'error';
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status: dbStatus === 'ok' ? 'ok' : 'error',
    db: dbStatus,
    redis: redisStatus,
    adapter: redis ? 'redis' : 'memory',
    uptimeSec: Math.round((Date.now() - started) / 1000),
  });
}));
