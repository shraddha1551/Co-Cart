const { MILK, resetDb, makeApp, cartWith } = require('./helpers');

beforeEach(resetDb);

const app = makeApp();
const flagged = async (m) => (await m.get('/state')).body.duplicateGroups.find((g) => g.status === 'flagged');
const milkLines = async (m) => (await m.get('/state')).body.items.filter((i) => i.productId === MILK && i.type === 'shared');
const added = async (m) => Object.fromEntries((await m.get('/settlement')).body.rows.map((r) => [r.memberId, r.addedPaise]));

test('personal lines and a single member never flag', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  await riya.add(MILK, 2);
  await riya.add(MILK, 1);
  await arjun.add(MILK, 1, 'personal');
  expect(await flagged(riya)).toBeUndefined();
});

test('merge keeps earliest line and preserves who pays for what', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  await riya.add(MILK, 2);
  await arjun.add(MILK, 1);
  const before = await added(riya);
  const [first] = await milkLines(riya);
  const g = await flagged(riya);
  const r = await riya.post(`/duplicates/${g.id}/resolve`, { action: 'merge' });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ group: { status: 'merged' }, survivingItemId: first.id, capped: false });
  const lines = await milkLines(riya);
  expect(lines).toHaveLength(1);
  expect(lines[0].quantity).toBe(3);
  expect(lines[0].contributions).toEqual([{ memberId: riya.id, quantity: 2 }, { memberId: arjun.id, quantity: 1 }]);
  expect(await added(riya)).toEqual(before);
  expect(before).toEqual({ [riya.id]: 13600, [arjun.id]: 6800 });
});

test('non-host resolve returns 403 HOST_ONLY', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  await riya.add(MILK);
  await arjun.add(MILK);
  const g = await flagged(riya);
  const r = await arjun.post(`/duplicates/${g.id}/resolve`, { action: 'merge' });
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('HOST_ONLY');
  expect((await flagged(riya)).id).toBe(g.id);
});

test('remove keeps only the earliest line', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  await riya.add(MILK, 3);
  await arjun.add(MILK, 2);
  const g = await flagged(riya);
  await riya.post(`/duplicates/${g.id}/resolve`, { action: 'remove' });
  const lines = await milkLines(riya);
  expect(lines.map((l) => [l.quantity, l.contributions])).toEqual([[3, [{ memberId: riya.id, quantity: 3 }]]]);
  expect((await riya.get('/state')).body.duplicateGroups).toEqual([]);
});

test('keep_all re-flags only when a new member adds the same product', async () => {
  const { members: [riya, arjun, kabir] } = await cartWith(app, ['Riya', 'Arjun', 'Kabir']);
  await riya.add(MILK);
  await arjun.add(MILK);
  const g = await flagged(riya);
  await riya.post(`/duplicates/${g.id}/resolve`, { action: 'keep_all' });
  const [, arjunLine] = await milkLines(riya);
  await arjun.patch(`/items/${arjunLine.id}`, { quantity: 2 });
  const st = (await riya.get('/state')).body;
  expect(st.duplicateGroups.map((x) => x.status)).toEqual(['kept']);
  expect(st.items.every((i) => i.duplicateGroupId === g.id)).toBe(true);
  await kabir.add(MILK);
  expect((await flagged(riya)).id).toBe(g.id);
});

test('after merge, a new member adding the product flags a new group; the merged contributor grows the merged line', async () => {
  const { members: [riya, arjun, kabir] } = await cartWith(app, ['Riya', 'Arjun', 'Kabir']);
  await riya.add(MILK);
  await arjun.add(MILK);
  const g = await flagged(riya);
  await riya.post(`/duplicates/${g.id}/resolve`, { action: 'merge' });
  const add = await arjun.add(MILK);
  expect(add.status).toBe(200);
  expect(add.body.mergedIntoExisting).toBe(true);
  expect(await flagged(riya)).toBeUndefined();
  await kabir.add(MILK);
  const again = await flagged(riya);
  expect(again.id).not.toBe(g.id);
  expect(again.memberIds.sort()).toEqual([riya.id, arjun.id, kabir.id].sort());
});

test('group dissolves when a duplicate line is removed', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  await riya.add(MILK);
  const { body } = await arjun.add(MILK);
  await arjun.del(`/items/${body.item.id}`);
  expect((await riya.get('/state')).body.duplicateGroups).toEqual([]);
});

test('second resolve returns 409 DUPLICATE_ALREADY_RESOLVED', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  await riya.add(MILK);
  await arjun.add(MILK);
  const g = await flagged(riya);
  await riya.post(`/duplicates/${g.id}/resolve`, { action: 'merge' });
  const r = await riya.post(`/duplicates/${g.id}/resolve`, { action: 'merge' });
  expect(r.status).toBe(409);
  expect(r.body.error.code).toBe('DUPLICATE_ALREADY_RESOLVED');
});

test('merge over 20 trims the latest contributor', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  await riya.add(MILK, 12);
  await arjun.add(MILK, 10);
  const g = await flagged(riya);
  const r = await riya.post(`/duplicates/${g.id}/resolve`, { action: 'merge' });
  expect(r.body.capped).toBe(true);
  const [line] = await milkLines(riya);
  expect(line.contributions).toEqual([{ memberId: riya.id, quantity: 12 }, { memberId: arjun.id, quantity: 8 }]);
});
