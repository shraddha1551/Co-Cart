const { MILK, resetDb, makeApp, cartWith } = require('./helpers');

beforeEach(resetDb);

test('parallel shared adds by two members create exactly one flagged group', async () => {
  const app = makeApp();
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? arjun : riya).add(MILK)));
  expect(res.every((r) => r.status === 201 || r.status === 200)).toBe(true);
  const revs = res.map((r) => r.body.revision).sort((a, b) => a - b);
  expect(new Set(revs).size).toBe(20);
  expect(revs[19] - revs[0]).toBe(19);
  const st = await riya.get('/state');
  expect(st.body.duplicateGroups.filter((g) => g.status === 'flagged')).toHaveLength(1);
  expect(st.body.items.reduce((s, i) => s + i.quantity, 0)).toBe(20);
});
