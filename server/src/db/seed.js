/** Upsert the 30-product catalog by sku in a single statement (FR-DB-03). */
const { pool } = require('./pool');
const catalog = require('./catalog.json');

const columns = ['sku', 'name', 'unitLabel', 'category', 'pricePaise'];

/** Insert or update every catalog product. */
async function seed() {
  await pool.query(
    `INSERT INTO products (sku, name, unit_label, category, price_paise)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[])
     ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, unit_label = EXCLUDED.unit_label,
       category = EXCLUDED.category, price_paise = EXCLUDED.price_paise`,
    columns.map((k) => catalog.map((p) => p[k])));
}

if (require.main === module) seed().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });

module.exports = { seed };
