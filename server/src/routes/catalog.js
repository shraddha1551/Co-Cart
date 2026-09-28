/** GET /catalog — every product (FR-API-02). */
const { Router } = require('express');
const { query } = require('../db/pool');
const { h } = require('../lib/errors');

module.exports = () => Router().get('/catalog', h(async (req, res) => {
  const { rows } = await query(
    `SELECT id, sku, name, unit_label AS "unitLabel", category, price_paise AS "pricePaise" FROM products ORDER BY id`);
  res.json({ products: rows });
}));
