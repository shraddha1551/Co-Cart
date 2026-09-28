/** Reads environment variables once and exports frozen configuration and business constants. */
require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';

module.exports = Object.freeze({
  isTest,
  port: Number(process.env.PORT || 4000),
  databaseUrl: isTest
    ? (process.env.TEST_DATABASE_URL || 'postgres://synccart:synccart@localhost:5432/synccart_test')
    : (process.env.DATABASE_URL || 'postgres://synccart:synccart@localhost:5432/synccart'),
  redisUrl: isTest ? '' : (process.env.REDIS_URL ?? 'redis://localhost:6379'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  logLevel: isTest ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  MAX_MEMBERS: 10,
  MAX_QTY: 20,
  SESSION_TTL_HOURS: 24,
  DISPLAY_NAME_MAX: 30,
  EXPIRY_SWEEP_MS: 60000,
});
