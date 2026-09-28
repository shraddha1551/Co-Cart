/** zod body validation: replaces req.body with the parsed value or fails with 400 VALIDATION_ERROR. */
const { AppError } = require('../lib/errors');

const validate = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request', r.error.issues));
  req.body = r.data;
  return next();
};

module.exports = { validate };
