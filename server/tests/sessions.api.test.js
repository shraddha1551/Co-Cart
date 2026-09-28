const request = require('supertest');
const { resetDb, makeApp, cartWith } = require('./helpers');

beforeEach(resetDb);

const app = makeApp();

test('create returns session, host member, token and invite url', async () => {
  const r = await request(app).post('/api/sessions').send({ displayName: '  Riya ' });
  expect(r.status).toBe(201);
  expect(r.body.session).toMatchObject({ status: 'open', revision: 1 });
  expect(r.body.session.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(r.body.member).toMatchObject({ displayName: 'Riya', joinOrder: 1, isHost: true });
  expect(r.body.memberToken).toHaveLength(43);
  expect(r.body.invite.url).toBe(`http://localhost:5173/join/${r.body.session.token}`);
});

test('preview, join and name clash', async () => {
  const { token } = await cartWith(app, ['Riya']);
  expect((await request(app).get(`/api/sessions/${token}/preview`)).body)
    .toEqual({ status: 'open', hostName: 'Riya', memberCount: 1, maxMembers: 10 });
  const j = await request(app).post(`/api/sessions/${token}/join`).send({ displayName: 'Arjun' });
  expect(j.status).toBe(201);
  expect(j.body).toMatchObject({ member: { displayName: 'Arjun', joinOrder: 2, isHost: false }, revision: 2 });
  const clash = await request(app).post(`/api/sessions/${token}/join`).send({ displayName: 'arjun' });
  expect(clash.status).toBe(409);
  expect(clash.body.error.code).toBe('NAME_TAKEN');
  expect((await request(app).get('/api/sessions/nope/preview')).body.error.code).toBe('SESSION_NOT_FOUND');
});

test('11th member is rejected with SESSION_FULL', async () => {
  const { token } = await cartWith(app, Array.from({ length: 10 }, (_, i) => `M${i}`));
  const r = await request(app).post(`/api/sessions/${token}/join`).send({ displayName: 'Eleven' });
  expect(r.status).toBe(409);
  expect(r.body.error.code).toBe('SESSION_FULL');
});

test('auth errors: missing token, unknown token, token of another cart', async () => {
  const a = await cartWith(app, ['Riya']);
  const b = await cartWith(app, ['Kabir']);
  const state = (token, memberToken) => request(app).get(`/api/sessions/${token}/state`).set('X-Member-Token', memberToken ?? '');
  expect((await request(app).get(`/api/sessions/${a.token}/state`)).status).toBe(401);
  expect((await state(a.token, 'bogus')).body.error.code).toBe('NOT_A_MEMBER');
  expect((await state(a.token, b.members[0].memberToken)).body.error.code).toBe('NOT_A_MEMBER');
});

test('state snapshot and invite QR', async () => {
  const { members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  const st = (await arjun.get('/state')).body;
  expect(st.me.memberId).toBe(arjun.id);
  expect(st.session).toMatchObject({ revision: 2, hostMemberId: riya.id, payerMemberId: null });
  expect(st.members.map((m) => [m.displayName, m.isHost])).toEqual([['Riya', true], ['Arjun', false]]);
  expect(st.totals).toMatchObject({ grandPaise: 0, unresolvedDuplicates: 0, canCheckout: false });
  const inv = await riya.get('/invite');
  expect(inv.body.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
});
