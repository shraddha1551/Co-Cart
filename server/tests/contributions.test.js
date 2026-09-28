const { mergeContributions, trimToCap } = require('../src/lib/contributions');

const t = (s) => new Date(`2026-09-22T10:0${s}:00Z`);

test('merge sums per member and keeps earliest time', () => {
  const out = mergeContributions([
    { memberId: 'R', quantity: 3, firstAddedAt: t(1) },
    { memberId: 'A', quantity: 2, firstAddedAt: t(2) },
    { memberId: 'R', quantity: 1, firstAddedAt: t(5) },
  ]);
  expect(out).toEqual([{ memberId: 'R', quantity: 4, firstAddedAt: t(1) }, { memberId: 'A', quantity: 2, firstAddedAt: t(2) }]);
});

test('cap trims the latest contributor first', () => {
  const { kept, capped } = trimToCap(
    [{ memberId: 'R', quantity: 12, firstAddedAt: t(1) }, { memberId: 'A', quantity: 10, firstAddedAt: t(2) }], 20);
  expect(capped).toBe(true);
  expect(kept.map((k) => [k.memberId, k.quantity])).toEqual([['R', 12], ['A', 8]]);
});

test('no trim under the cap', () => {
  expect(trimToCap([{ memberId: 'R', quantity: 5, firstAddedAt: t(1) }], 20))
    .toEqual({ kept: [{ memberId: 'R', quantity: 5, firstAddedAt: t(1) }], capped: false });
});
