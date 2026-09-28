/** Test helpers: DB reset, app factory, and a tiny client for one member of one cart. */
const request = require('supertest');
const { query } = require('../src/db/pool');
const { createApp } = require('../src/app');
const presence = require('../src/realtime/presence');

const MILK = 1; // ₹68, first product in catalog.json
const PROTEIN = 12; // Yoga Bar Protein, ₹125

const resetDb = () => query('TRUNCATE cart_sessions CASCADE');

const makeApp = () => createApp({ emit: jest.fn(), presence, redis: null });

/** Requests on /api/sessions/:token as one member. */
function as(app, token, member) {
  const url = (path) => `/api/sessions/${token}${path}`;
  const auth = (req) => req.set('X-Member-Token', member.memberToken);
  return {
    ...member,
    get: (path) => auth(request(app).get(url(path))),
    post: (path, body = {}) => auth(request(app).post(url(path)).send(body)),
    patch: (path, body) => auth(request(app).patch(url(path)).send(body)),
    del: (path) => auth(request(app).delete(url(path))),
    add: (productId, quantity = 1, type = 'shared') => auth(request(app).post(url('/items')).send({ productId, quantity, type })),
  };
}

/** Create a cart hosted by names[0] and join the rest; returns { token, members: [as(...)] }. */
async function cartWith(app, names) {
  const [hostName, ...others] = names;
  const c = await request(app).post('/api/sessions').send({ displayName: hostName });
  const { token } = c.body.session;
  const joined = [];
  for (const displayName of others) {
    joined.push((await request(app).post(`/api/sessions/${token}/join`).send({ displayName })).body);
  }
  return { token, members: [c.body, ...joined].map((b) => as(app, token, { id: b.member.id, memberToken: b.memberToken })) };
}

module.exports = { MILK, PROTEIN, resetDb, makeApp, cartWith };
