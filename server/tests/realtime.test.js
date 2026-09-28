const http = require('http');
const { io: connect } = require('socket.io-client');
const config = require('../src/config');
const logger = require('../src/logger');
const presence = require('../src/realtime/presence');
const { createApp } = require('../src/app');
const { createRealtime } = require('../src/realtime/socket');
const { makeBroadcaster } = require('../src/realtime/broadcast');
const { authenticate } = require('../src/middleware/memberAuth');
const { MILK, resetDb, cartWith } = require('./helpers');

let server;
let io;
let app;
let url;
const sockets = [];

beforeAll(async () => {
  await resetDb();
  server = http.createServer();
  ({ io } = await createRealtime(server, { config, logger, authenticate, presence }));
  app = createApp({ emit: makeBroadcaster(io, logger), presence, redis: null });
  server.on('request', app);
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  io.close();
});

const open = (sessionToken, memberToken) => {
  const s = connect(url, { transports: ['websocket'], auth: { sessionToken, memberToken }, reconnection: false });
  sockets.push(s);
  return s;
};
const once = (s, name) => new Promise((resolve) => s.once(name, resolve));

test('both members receive item_added with the next revision', async () => {
  const { token, members: [riya, arjun] } = await cartWith(app, ['Riya', 'Arjun']);
  const [a, b] = [open(token, riya.memberToken), open(token, arjun.memberToken)];
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);
  const { revision } = (await riya.get('/state')).body.session;
  const events = Promise.all([once(a, 'cart:event'), once(b, 'cart:event')]);
  await riya.add(MILK);
  for (const e of await events) {
    expect(e).toMatchObject({ type: 'item_added', revision: revision + 1, actorId: riya.id });
    expect(e.payload.upsertItems[0].productId).toBe(MILK);
  }
});

test('invalid token is rejected with NOT_A_MEMBER', async () => {
  const { token } = await cartWith(app, ['Kabir']);
  const err = await once(open(token, 'bogus'), 'connect_error');
  expect(err.message).toBe('NOT_A_MEMBER');
});
