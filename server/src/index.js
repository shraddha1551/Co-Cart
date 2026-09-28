/** Bootstrap: HTTP server, Socket.io, Express app, DB wait, expiry sweeper and graceful shutdown. */
const http = require('http');
const config = require('./config');
const logger = require('./logger');
const { pool } = require('./db/pool');
const { createApp } = require('./app');
const { createRealtime } = require('./realtime/socket');
const { makeBroadcaster } = require('./realtime/broadcast');
const presence = require('./realtime/presence');
const { authenticate } = require('./middleware/memberAuth');
const { expireDueSessions } = require('./services/sessionService');

/** Retry SELECT 1 up to 10 times, 2 s apart, before giving up (SRS §6). */
async function waitForDb(tries = 10) {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    if (tries <= 1) throw err;
    logger.warn('waiting for PostgreSQL…');
    await new Promise((r) => setTimeout(r, 2000));
    await waitForDb(tries - 1);
  }
}

async function main() {
  const server = http.createServer();
  const { io, redis } = await createRealtime(server, { config, logger, authenticate, presence });
  const emit = makeBroadcaster(io, logger);
  server.on('request', createApp({ emit, presence, redis }));
  await waitForDb();
  server.listen(config.port, () => logger.info(`Sync Cart server on :${config.port}`));

  const sweeper = setInterval(
    () => expireDueSessions(emit).catch((err) => logger.error({ err }, 'expiry sweep failed')), config.EXPIRY_SWEEP_MS);
  sweeper.unref();

  const shutdown = () => {
    logger.info('shutting down');
    clearInterval(sweeper);
    io.close();
    server.close(async () => {
      await Promise.allSettled([redis?.quit(), pool.end()]);
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
