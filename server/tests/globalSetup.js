/** Create (if needed), migrate and seed the test database once before all test files. */
module.exports = async () => {
  const { pool } = require('../src/db/pool');
  const { migrate } = require('../src/db/migrate');
  const { seed } = require('../src/db/seed');
  await migrate();
  await seed();
  await pool.end();
};
