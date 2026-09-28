/** Create the synccart_test database if it does not exist (42P04 = already exists). */
require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgres://synccart:synccart@localhost:5432/synccart' });

client.connect()
  .then(() => client.query('CREATE DATABASE synccart_test'))
  .catch((e) => { if (e.code !== '42P04') { console.error(e); process.exitCode = 1; } })
  .finally(() => client.end());
