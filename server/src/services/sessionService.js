/** Session lifecycle: create, preview, join, snapshot, invite and expiry (FR-SESS-*, FR-INV-*). */
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('../config');
const { query, withSessionLock, withSnapshot, bumpRevision } = require('../db/pool');
const { AppError } = require('../lib/errors');
const { newSessionToken, newMemberToken, hashToken } = require('../lib/tokens');
const { loadItems } = require('./cartState');
const { listLiveGroups } = require('./duplicateService');

const inviteUrl = (token) => `${config.clientOrigin}/join/${token}`;

/** Find a session by its invite token or throw 404 SESSION_NOT_FOUND. */
async function findSessionByToken(token) {
  const { rows: [s] } = await query('SELECT id, status FROM cart_sessions WHERE token = $1', [token]);
  if (!s) throw new AppError(404, 'SESSION_NOT_FOUND', 'Cart not found.');
  return s;
}

/** Create a session and its host member in one transaction (FR-SESS-01). */
async function createSession(displayName) {
  const id = crypto.randomUUID();
  const hostId = crypto.randomUUID();
  const token = newSessionToken();
  const memberToken = newMemberToken();
  const s = await withSessionLock(id, async (c) => {
    const { rows: [row] } = await c.query(
      `INSERT INTO cart_sessions (id, token, host_member_id, revision, expires_at)
       VALUES ($1, $2, $3, 1, now() + make_interval(hours => $4)) RETURNING status, revision, expires_at`,
      [id, token, hostId, config.SESSION_TTL_HOURS]);
    await c.query(
      `INSERT INTO cart_members (id, session_id, display_name, member_token_hash, join_order) VALUES ($1, $2, $3, $4, 1)`,
      [hostId, id, displayName, hashToken(memberToken)]);
    return row;
  });
  return {
    session: { id, token, status: s.status, revision: Number(s.revision), expiresAt: s.expires_at },
    member: { id: hostId, displayName, joinOrder: 1, isHost: true },
    memberToken,
    invite: { url: inviteUrl(token) },
  };
}

/** Public info for the Join screen (FR-SESS-03). */
async function previewSession(token) {
  const { rows: [r] } = await query(
    `SELECT s.status, h.display_name AS host_name,
            (SELECT count(*)::int FROM cart_members m WHERE m.session_id = s.id) AS member_count
     FROM cart_sessions s JOIN cart_members h ON h.id = s.host_member_id WHERE s.token = $1`, [token]);
  if (!r) throw new AppError(404, 'SESSION_NOT_FOUND', 'Cart not found.');
  return { status: r.status, hostName: r.host_name, memberCount: r.member_count, maxMembers: config.MAX_MEMBERS };
}

/** Join as a new member, re-checking status, capacity and name inside the lock (FR-SESS-04). */
async function joinSession(token, displayName) {
  const { id: sessionId } = await findSessionByToken(token);
  return withSessionLock(sessionId, async (c) => {
    const { rows: [s] } = await c.query('SELECT status FROM cart_sessions WHERE id = $1', [sessionId]);
    if (s.status !== 'open') throw new AppError(409, 'SESSION_CLOSED', 'This cart is no longer open.');
    const { rows: [n] } = await c.query(
      `SELECT count(*)::int AS count, max(join_order) AS last,
              bool_or(lower(display_name) = lower($2)) AS taken
       FROM cart_members WHERE session_id = $1`, [sessionId, displayName]);
    if (n.count >= config.MAX_MEMBERS) throw new AppError(409, 'SESSION_FULL', `This cart already has ${config.MAX_MEMBERS} members.`);
    if (n.taken) throw new AppError(409, 'NAME_TAKEN', `Someone here is already called ${displayName}.`);
    const memberToken = newMemberToken();
    const { rows: [m] } = await c.query(
      `INSERT INTO cart_members (session_id, display_name, member_token_hash, join_order)
       VALUES ($1, $2, $3, $4) RETURNING id, join_order`,
      [sessionId, displayName, hashToken(memberToken), n.last + 1]);
    const revision = await bumpRevision(c, sessionId);
    const member = { id: m.id, displayName, joinOrder: m.join_order, isHost: false, hasPaid: false, online: false };
    return {
      sessionId,
      result: { member: { id: m.id, displayName, joinOrder: m.join_order, isHost: false }, memberToken, revision },
      event: { type: 'member_joined', revision, actorId: m.id, payload: { upsertItems: [], removedItemIds: [], members: [member] } },
    };
  });
}

/** Per-member shared/personal paise and cart totals computed from item contributions. */
function sumTotals(members, items) {
  const byMember = Object.fromEntries(members.map((m) => [m.id, { sharedPaise: 0, personalPaise: 0 }]));
  let sharedPaise = 0;
  let grandPaise = 0;
  for (const i of items) {
    for (const c of i.contributions) {
      const cost = c.quantity * i.unitPricePaise;
      byMember[c.memberId][i.type === 'shared' ? 'sharedPaise' : 'personalPaise'] += cost;
      grandPaise += cost;
      if (i.type === 'shared') sharedPaise += cost;
    }
  }
  return { sharedPaise, grandPaise, byMember };
}

/** Full, consistent snapshot of a session for one member (FR-SESS-05, SRS §3.6.2). */
async function getSnapshot(sessionId, memberId, onlineIds) {
  const { s, members, items, duplicateGroups } = await withSnapshot(async (c) => ({
    s: (await c.query(
      `SELECT id, token, status, revision, host_member_id, payer_member_id, created_at, expires_at
       FROM cart_sessions WHERE id = $1`, [sessionId])).rows[0],
    members: (await c.query(
      'SELECT id, display_name, join_order, has_paid FROM cart_members WHERE session_id = $1 ORDER BY join_order',
      [sessionId])).rows,
    items: await loadItems(c, sessionId),
    duplicateGroups: await listLiveGroups(c, sessionId),
  }));
  const online = new Set(onlineIds);
  const unresolvedDuplicates = duplicateGroups.filter((g) => g.status === 'flagged').length;
  return {
    session: {
      id: s.id, token: s.token, status: s.status, revision: Number(s.revision), hostMemberId: s.host_member_id,
      payerMemberId: s.payer_member_id, createdAt: s.created_at, expiresAt: s.expires_at,
    },
    me: { memberId },
    members: members.map((m) => ({
      id: m.id, displayName: m.display_name, joinOrder: m.join_order, isHost: m.id === s.host_member_id,
      hasPaid: m.has_paid, online: online.has(m.id),
    })),
    items,
    duplicateGroups,
    totals: {
      ...sumTotals(members, items),
      unresolvedDuplicates,
      canCheckout: memberId === s.host_member_id && s.status === 'open' && unresolvedDuplicates === 0 && items.length > 0,
    },
  };
}

/** Invite link plus QR PNG data URL (FR-INV-01/02). */
async function getInvite(token) {
  const url = inviteUrl(token);
  try {
    return { url, qrDataUrl: await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 256 }) };
  } catch {
    throw new AppError(500, 'QR_FAILED', 'Could not generate the QR code.');
  }
}

/** Expire open sessions past expires_at, each under its own lock, and broadcast session_expired (FR-SESS-06). */
async function expireDueSessions(emit) {
  const { rows } = await query(`SELECT id FROM cart_sessions WHERE status = 'open' AND expires_at < now()`);
  for (const { id } of rows) {
    const event = await withSessionLock(id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE cart_sessions SET status = 'expired' WHERE id = $1 AND status = 'open' AND expires_at < now()`, [id]);
      if (!rowCount) return null;
      const revision = await bumpRevision(c, id);
      return { type: 'session_expired', revision, actorId: null, payload: { upsertItems: [], removedItemIds: [], session: { status: 'expired' } } };
    });
    emit(id, event);
  }
}

module.exports = { findSessionByToken, createSession, previewSession, joinSession, getSnapshot, getInvite, expireDueSessions };
