const { MILK, PROTEIN, resetDb, makeApp, cartWith } = require('./helpers');
const { query } = require('../src/db/pool');

beforeEach(resetDb);

const app = makeApp();
const line = async (m, id) => (await m.get('/state')).body.items.find((i) => i.id === id);

test('add creates a line with one contribution; defaults to quantity 1 shared', async () => {
  const { members: [riya] } = await cartWith(app, ['Riya']);
  const r = await riya.post('/items', { productId: MILK });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ mergedIntoExisting: false, capped: false, revision: 2 });
  expect(r.body.item).toMatchObject({ quantity: 1, type: 'shared', unitPricePaise: 6800, contributions: [{ memberId: riya.id, quantity: 1 }] });
});

test('BR-05: same member, same product and type grows one line', async () => {
  const { members: [riya] } = await cartWith(app, ['Riya']);
  const a = await riya.add(MILK, 2);
  const b = await riya.add(MILK, 3);
  expect(b.status).toBe(200);
  expect(b.body.mergedIntoExisting).toBe(true);
  expect(b.body.item).toMatchObject({ id: a.body.item.id, quantity: 5 });
  await riya.add(MILK, 1, 'personal');
  expect((await riya.get('/state')).body.items).toHaveLength(2);
});

test('line total caps at 20', async () => {
  const { members: [riya] } = await cartWith(app, ['Riya']);
  await riya.add(MILK, 18);
  const r = await riya.add(MILK, 5);
  expect(r.body).toMatchObject({ capped: true, item: { quantity: 20 } });
  const full = await riya.add(MILK, 1);
  expect(full.status).toBe(200);
  expect(full.body.capped).toBe(true);
  expect(full.body.revision).toBe(r.body.revision);
});

test('unknown product → 404 and bad body → 400', async () => {
  const { members: [riya] } = await cartWith(app, ['Riya']);
  expect((await riya.add(9999)).body.error.code).toBe('PRODUCT_NOT_FOUND');
  expect((await riya.add(MILK, 21)).body.error.code).toBe('VALIDATION_ERROR');
});

test('members edit and remove only their own part', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  const { body } = await riya.add(MILK, 2);
  const id = body.item.id;
  expect((await arjun.patch(`/items/${id}`, { quantity: 5 })).body.error.code).toBe('NOT_A_CONTRIBUTOR');
  expect((await arjun.del(`/items/${id}`)).body.error.code).toBe('NOT_A_CONTRIBUTOR');
  const p = await riya.patch(`/items/${id}`, { quantity: 4 });
  expect(p.status).toBe(200);
  expect(p.body.item.quantity).toBe(4);
  expect((await riya.patch(`/items/${id}`, { quantity: 21 })).status).toBe(400);
  const d = await riya.del(`/items/${id}`);
  expect(d.body).toMatchObject({ itemId: id, lineRemoved: true });
  expect(await line(riya, id)).toBeUndefined();
});

test('removing my part of a merged line keeps the others; retag blocked with several contributors', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  const { body } = await riya.add(MILK, 2);
  await arjun.add(MILK, 1);
  const { duplicateGroups: [g] } = (await riya.get('/state')).body;
  await riya.post(`/duplicates/${g.id}/resolve`, { action: 'merge' });
  const id = body.item.id;
  const retag = await riya.patch(`/items/${id}`, { type: 'personal' });
  expect(retag.status).toBe(409);
  expect(retag.body.error.code).toBe('LINE_HAS_MULTIPLE_CONTRIBUTORS');
  const d = await arjun.del(`/items/${id}`);
  expect(d.body.lineRemoved).toBe(false);
  expect((await line(riya, id)).contributions).toEqual([{ memberId: riya.id, quantity: 2 }]);
});

test('retag moves a line, or folds it into my existing line of the other type', async () => {
  const { members: [riya] } = await cartWith(app, ['Riya']);
  const shared = (await riya.add(PROTEIN, 2)).body.item;
  const p = await riya.patch(`/items/${shared.id}`, { type: 'personal' });
  expect(p.body.item).toMatchObject({ id: shared.id, type: 'personal' });
  const other = (await riya.add(PROTEIN, 1, 'shared')).body.item;
  const fold = await riya.patch(`/items/${other.id}`, { type: 'personal' });
  expect(fold.body.item).toMatchObject({ id: shared.id, quantity: 3 });
  expect((await riya.get('/state')).body.items).toHaveLength(1);
});

test('invariant: line quantity equals the sum of its contributions', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  await riya.add(MILK, 3);
  await arjun.add(MILK, 2);
  await arjun.add(PROTEIN, 1, 'personal');
  const { rows } = await query(
    `SELECT i.quantity, SUM(c.quantity)::int AS total FROM cart_items i
     JOIN cart_item_contributions c ON c.item_id = i.id WHERE i.status = 'active' GROUP BY i.id`);
  expect(rows.every((r) => r.quantity === r.total)).toBe(true);
});
