/** Build the Express app. deps = { emit, presence, redis } are injected so routes can broadcast and tests can stub. */
const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const config = require('./config');
const logger = require('./logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const routes = ['health', 'catalog', 'sessions', 'items', 'duplicates', 'settlement'];

/** Create the app with every /api router, the 404 fallback and the JSON error handler. */
function createApp(deps) {
  const app = express();
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '10kb' }));
  app.use(pinoHttp({ logger, redact: ['req.headers["x-member-token"]'] }));
  for (const name of routes) app.use('/api', require(`./routes/${name}`)(deps));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
