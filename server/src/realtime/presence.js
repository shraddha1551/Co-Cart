/** Who is online per session: Redis hash of socket counts, or an in-process Map without Redis (FR-RT-08). */
const TTL_SECONDS = 86400;
const key = (sessionId) => `presence:${sessionId}`;

let redis = null;
const memory = new Map();

/** Choose the backing store: a connected node-redis client, or null for in-memory. */
function init(client) {
  redis = client;
}

/** Online member ids of a session. */
async function list(sessionId) {
  if (redis) return redis.hKeys(key(sessionId));
  return [...(memory.get(sessionId)?.keys() ?? [])];
}

/** Change a member's open-socket count by delta, dropping them at 0; returns the online list. */
async function change(sessionId, memberId, delta) {
  if (redis) {
    const count = await redis.hIncrBy(key(sessionId), memberId, delta);
    if (count <= 0) await redis.hDel(key(sessionId), memberId);
    await redis.expire(key(sessionId), TTL_SECONDS);
  } else {
    const counts = memory.get(sessionId) ?? new Map();
    const count = (counts.get(memberId) ?? 0) + delta;
    if (count > 0) counts.set(memberId, count);
    else counts.delete(memberId);
    if (counts.size) memory.set(sessionId, counts);
    else memory.delete(sessionId);
  }
  return list(sessionId);
}

const add = (sessionId, memberId) => change(sessionId, memberId, 1);
const remove = (sessionId, memberId) => change(sessionId, memberId, -1);

module.exports = { init, list, add, remove };
