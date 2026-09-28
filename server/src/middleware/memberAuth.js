/** Resolves a member token to a member of the session named in the URL (FR-ID-03); shared by REST and sockets. */
const { query } = require('../db/pool');
const { hashToken } = require('../lib/tokens');
const { AppError, h } = require('../lib/errors');

const MEMBER_SQL = `
  SELECT m.id, m.session_id, m.display_name, m.join_order, s.token, s.host_member_id
  FROM cart_members m JOIN cart_sessions s ON s.id = m.session_id
  WHERE m.member_token_hash = $1`;

/** Return { id, sessionId, displayName, joinOrder, isHost } or throw AUTH_REQUIRED / NOT_A_MEMBER. */
async function authenticate(sessionToken, memberToken) {
  if (!memberToken) throw new AppError(401, 'AUTH_REQUIRED', 'Member token required.');
  const { rows: [r] } = await query(MEMBER_SQL, [hashToken(memberToken)]);
  if (!r || r.token !== sessionToken) throw new AppError(403, 'NOT_A_MEMBER', 'You are not a member of this cart.');
  return { id: r.id, sessionId: r.session_id, displayName: r.display_name, joinOrder: r.join_order, isHost: r.id === r.host_member_id };
}

/** Express middleware: sets req.member from the X-Member-Token header. */
const memberAuth = h(async (req, res, next) => {
  req.member = await authenticate(req.params.token, req.get('X-Member-Token'));
  next();
});

module.exports = { authenticate, memberAuth };
