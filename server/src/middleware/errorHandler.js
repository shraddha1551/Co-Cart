/** 404 fallback and the single error-to-JSON handler: every error becomes { error: { code, message } }. */
const { AppError } = require('../lib/errors');

const notFound = (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });

// Express recognises error middleware by its four arguments, so `next` must stay.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } });
  }
  req.log.error({ err }, 'unhandled');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
}

module.exports = { notFound, errorHandler };
