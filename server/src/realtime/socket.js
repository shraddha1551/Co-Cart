/** Socket.io server: Redis adapter when available, token handshake, one room per session, presence. */
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

/** Connect pub/sub Redis clients and return the pub client, or null (in-memory adapter) on failure. */
async function connectRedis(io, { config, logger }) {
  if (!config.redisUrl) {
    logger.warn('realtime: REDIS_URL empty, using in-memory adapter (single instance only)');
    return null;
  }
  let ready = false;
  // Give up after a few tries only on the first connect; afterwards keep reconnecting (NFR-REL-02).
  const reconnectStrategy = (n) => (!ready && n > 3 ? new Error('Redis unreachable') : Math.min(n * 200, 5000));
  const pub = createClient({ url: config.redisUrl, socket: { connectTimeout: 3000, reconnectStrategy } });
  const sub = pub.duplicate();
  pub.on('error', (err) => logger.error({ err }, 'redis pub error'));
  sub.on('error', (err) => logger.error({ err }, 'redis sub error'));
  try {
    await Promise.all([pub.connect(), sub.connect()]);
    ready = true;
    io.adapter(createAdapter(pub, sub));
    return pub;
  } catch (err) {
    logger.error({ err }, 'realtime: Redis unavailable, falling back to in-memory adapter');
    await Promise.allSettled([pub.disconnect(), sub.disconnect()]);
    return null;
  }
}

/** Create io on httpServer. Returns { io, redis } where redis is null in memory mode. */
async function createRealtime(httpServer, { config, logger, authenticate, presence }) {
  const io = new Server(httpServer, { cors: { origin: config.clientOrigin } });
  const redis = await connectRedis(io, { config, logger });
  presence.init(redis);

  io.use(async (socket, next) => {
    try {
      const { sessionToken, memberToken } = socket.handshake.auth || {};
      const member = await authenticate(sessionToken, memberToken);
      socket.data = { memberId: member.id, sessionId: member.sessionId };
      next();
    } catch {
      next(new Error('NOT_A_MEMBER'));
    }
  });

  io.on('connection', async (socket) => {
    const { sessionId, memberId } = socket.data;
    const room = `session:${sessionId}`;
    socket.join(room);
    socket.on('presence:hello', async () => socket.emit('presence:update', { online: await presence.list(sessionId) }));
    socket.on('disconnect', async () => io.to(room).emit('presence:update', { online: await presence.remove(sessionId, memberId) }));
    io.to(room).emit('presence:update', { online: await presence.add(sessionId, memberId) });
  });

  return { io, redis };
}

module.exports = { createRealtime };
