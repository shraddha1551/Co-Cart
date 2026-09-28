/** PostgreSQL pool and withSessionLock(), which runs a callback in a transaction holding the session's advisory lock. */
const { Pool } = require('pg');
const config = require('../config');
const { AppError } = require('../lib/errors');

const pool = new Pool({
  connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});

/** Run a single query on the pool. */
const query = (text, params) => pool.query(text, params);

/**
 * Run fn(client) inside BEGIN/COMMIT while holding pg_advisory_xact_lock for sessionId.
 * All writes to a session MUST go through here (DESIGN §2.3.1).
 */
async function withSessionLock(sessionId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [sessionId]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '55P03') throw new AppError(503, 'BUSY', 'The cart is busy, please try again.');
    throw err;
  } finally {
    client.release();
  }
}

/** Run fn(client) in one READ ONLY REPEATABLE READ transaction, so multi-query reads see a single consistent state. */
async function withSnapshot(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Increment and return the session revision (exactly once per mutation, inside the lock). */
async function bumpRevision(client, sessionId) {
  const { rows } = await client.query(
    'UPDATE cart_sessions SET revision = revision + 1 WHERE id = $1 RETURNING revision', [sessionId]);
  return Number(rows[0].revision);
}

module.exports = { pool, query, withSessionLock, withSnapshot, bumpRevision };
