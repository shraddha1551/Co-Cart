const { computeSettlement, splitShare } = require('../src/services/settlementService');
const { MILK, PROTEIN, resetDb, makeApp, cartWith } = require('./helpers');

test('host owes nothing, others owe exactly what they added', () => {
  const members = [
    { id: 'R', display_name: 'Riya', has_paid: true },
    { id: 'A', display_name: 'Arjun', has_paid: false },
    { id: 'K', display_name: 'Kabir', has_paid: false },
  ];
  const totals = [
    { member_id: 'R', type: 'shared', paise: '6800' },
    { member_id: 'A', type: 'shared', paise: '6800' },
    { member_id: 'K', type: 'shared', paise: '6800' },
    { member_id: 'A', type: 'personal', paise: '12500' },
  ];
  const s = computeSettlement({ members, totals, payerMemberId: 'R', status: 'checked_out' });
  expect(s.rows.map((r) => r.owedPaise)).toEqual([0, 19300, 6800]);
  expect(s.rows.map((r) => r.addedPaise)).toEqual([6800, 19300, 6800]);
  expect(s.outstandingPaise).toBe(26100);
  expect(s.grandPaise).toBe(32900);
  expect(s.sharedPaise).toBe(20400);
});

test('shared total is split equally no matter who added it; personal stays with its adder', () => {
  const members = [{ id: 'R', display_name: 'Riya', has_paid: true }, { id: 'A', display_name: 'Arjun', has_paid: false }];
  const totals = [
    { member_id: 'R', type: 'shared', paise: '13600' },
    { member_id: 'A', type: 'shared', paise: '6800' },
    { member_id: 'R', type: 'personal', paise: '4000' },
  ];
  const s = computeSettlement({ members, totals, payerMemberId: 'R', status: 'checked_out' });
  expect(s.rows.map((r) => [r.sharedPaise, r.personalPaise, r.owedPaise, r.addedPaise]))
    .toEqual([[10200, 4000, 0, 17600], [10200, 0, 10200, 6800]]);
  expect(s.grandPaise).toBe(24400);
  expect(s.outstandingPaise).toBe(10200);
});

test('leftover paise go to the host so shares always add up', () => {
  expect([0, 1, 2].map((i) => splitShare(100, 3, i))).toEqual([34, 33, 33]);
});

describe('API', () => {
  beforeEach(resetDb);
  const app = makeApp();

  test('worked example end to end: checkout rules, payer, paid toggles, settled', async () => {
    const { members: [riya, arjun, kabir] } = await cartWith(app, ['Riya', 'Arjun', 'Kabir']);
    expect((await riya.post('/checkout')).body.error.code).toBe('EMPTY_CART');
    await riya.add(MILK);
    await arjun.add(MILK);
    await kabir.add(MILK);
    await arjun.add(PROTEIN, 1, 'personal');
    expect((await riya.post('/checkout')).body.error.code).toBe('UNRESOLVED_DUPLICATES');
    const { duplicateGroups: [g] } = (await riya.get('/state')).body;
    await riya.post(`/duplicates/${g.id}/resolve`, { action: 'merge' });
    expect((await arjun.post('/checkout')).body.error.code).toBe('HOST_ONLY');
    expect((await arjun.patch(`/members/${arjun.id}/paid`, { hasPaid: true })).body.error.code).toBe('NOT_CHECKED_OUT');

    const co = await riya.post('/checkout');
    expect(co.body.session).toEqual({ status: 'checked_out', payerMemberId: riya.id });
    expect((await arjun.add(MILK)).body.error.code).toBe('SESSION_LOCKED');

    const s = (await arjun.get('/settlement')).body;
    expect(s).toMatchObject({ status: 'checked_out', payerMemberId: riya.id, grandPaise: 32900, sharedPaise: 20400, outstandingPaise: 26100 });
    expect(s.rows.map((r) => [r.owedPaise, r.isPayer, r.hasPaid])).toEqual([[0, true, true], [19300, false, false], [6800, false, false]]);

    expect((await arjun.patch(`/members/${arjun.id}/paid`, { hasPaid: true })).body.sessionStatus).toBe('checked_out');
    expect((await arjun.patch(`/members/${kabir.id}/paid`, { hasPaid: true })).body.error.code).toBe('NOT_ALLOWED');
    expect((await riya.patch(`/members/${riya.id}/paid`, { hasPaid: false })).status).toBe(400);
    expect((await riya.patch(`/members/${kabir.id}/paid`, { hasPaid: true })).body.sessionStatus).toBe('settled');
    expect((await riya.patch(`/members/${kabir.id}/paid`, { hasPaid: false })).body.sessionStatus).toBe('checked_out');
  });
});
