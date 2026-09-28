/** AppError carries an HTTP status and a stable error code for the client. */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Wrap an async Express handler so rejected promises reach the error middleware (Express 4). */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, h };
