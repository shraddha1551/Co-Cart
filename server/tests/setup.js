/** Close this test file's DB pool so Jest can exit. */
const { pool } = require('../src/db/pool');

afterAll(() => pool.end());
