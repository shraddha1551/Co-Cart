/** Apply unapplied migrations/*.sql in filename order, each in its own transaction (FR-DB-02). */
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const dir = path.join(__dirname, 'migrations');

/** Run every migration not yet recorded in schema_migrations. */
async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const pending = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && !applied.has(f)).sort();
  for (const f of pending) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

if (require.main === module) migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });

module.exports = { migrate };
