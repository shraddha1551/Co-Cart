/** Duplicate detection and resolution for shared lines (FR-DUP-01..06, DESIGN §2.3.2–2.3.3). */
const { AppError } = require('../lib/errors');
const { MAX_QTY } = require('../config');
const { mergeContributions, trimToCap } = require('../lib/contributions');

const LIVE_GROUPS_SQL = `
  SELECT g.id, g.product_id, p.name AS product_name, g.status,
         array_agg(i.id ORDER BY i.created_at, i.id) AS item_ids,
         SUM(i.quantity)::int AS total_quantity,
         (SELECT array_agg(DISTINCT c.member_id) FROM cart_item_contributions c
            JOIN cart_items x ON x.id = c.item_id
           WHERE x.session_id = g.session_id AND x.product_id = g.product_id
             AND x.type = 'shared' AND x.status = 'active') AS member_ids
  FROM duplicate_groups g
  JOIN products p ON p.id = g.product_id
  JOIN cart_items i ON i.session_id = g.session_id AND i.product_id = g.product_id
                   AND i.type = 'shared' AND i.status = 'active'
  WHERE g.session_id = $1 AND g.status IN ('flagged','kept')
  GROUP BY g.id, p.name
  ORDER BY g.created_at DESC`;

/** All live (flagged/kept) groups of a session, newest first. */
async function listLiveGroups(db, sessionId) {
  const { rows } = await db.query(LIVE_GROUPS_SQL, [sessionId]);
  return rows.map((r) => ({
    id: r.id, productId: r.product_id, productName: r.product_name, status: r.status,
    itemIds: r.item_ids, memberIds: r.member_ids, totalQuantity: r.total_quantity,
  }));
}

/** Recompute the live group for one product (FR-DUP-01). Caller holds the session lock. */
async function recompute(c, sessionId, productId) {
  const { rows: [s] } = await c.query(
    `SELECT count(DISTINCT i.id)::int AS lines, COALESCE(array_agg(DISTINCT co.member_id), '{}') AS members
     FROM cart_items i JOIN cart_item_contributions co ON co.item_id = i.id
     WHERE i.session_id = $1 AND i.product_id = $2 AND i.type = 'shared' AND i.status = 'active'`,
    [sessionId, productId]);
  const { rows: [g] } = await c.query(
    `SELECT id, status, kept_member_ids FROM duplicate_groups
     WHERE session_id = $1 AND product_id = $2 AND status IN ('flagged','kept')`, [sessionId, productId]);
  if (s.lines < 2 || s.members.length < 2) {
    if (g) await c.query(`UPDATE duplicate_groups SET status = 'dissolved' WHERE id = $1`, [g.id]);
  } else if (!g) {
    await c.query(`INSERT INTO duplicate_groups (session_id, product_id, status) VALUES ($1, $2, 'flagged')`, [sessionId, productId]);
  } else if (g.status === 'kept' && !s.members.every((m) => g.kept_member_ids.includes(m))) {
    await c.query(`UPDATE duplicate_groups SET status = 'flagged' WHERE id = $1`, [g.id]);
  }
}

/** Merge contributions of all lines onto the anchor (FR-DUP-02). Returns whether the 20 cap trimmed. */
async function mergeLines(c, anchorId, lineIds, restIds) {
  const { rows } = await c.query(
    'SELECT member_id, quantity, first_added_at FROM cart_item_contributions WHERE item_id = ANY($1::uuid[])', [lineIds]);
  const { kept, capped } = trimToCap(
    mergeContributions(rows.map((r) => ({ memberId: r.member_id, quantity: r.quantity, firstAddedAt: r.first_added_at }))), MAX_QTY);
  await c.query('DELETE FROM cart_item_contributions WHERE item_id = ANY($1::uuid[])', [lineIds]);
  await c.query(
    `INSERT INTO cart_item_contributions (item_id, member_id, quantity, first_added_at)
     SELECT $1::uuid, * FROM unnest($2::uuid[], $3::int[], $4::timestamptz[])`,
    [anchorId, kept.map((k) => k.memberId), kept.map((k) => k.quantity), kept.map((k) => k.firstAddedAt)]);
  await c.query('UPDATE cart_items SET quantity = $2, updated_at = now() WHERE id = $1',
    [anchorId, kept.reduce((sum, k) => sum + k.quantity, 0)]);
  await c.query(`UPDATE cart_items SET status = 'merged', merged_into = $2, updated_at = now() WHERE id = ANY($1::uuid[])`,
    [restIds, anchorId]);
  return capped;
}

/**
 * Resolve a flagged group with merge | keep_all | remove.
 * Caller holds the session lock and has checked the actor is the host.
 */
async function resolve(c, sessionId, groupId, action, actorId) {
  const { rows: [g] } = await c.query(
    'SELECT id, product_id, status FROM duplicate_groups WHERE id = $1 AND session_id = $2', [groupId, sessionId]);
  if (!g) throw new AppError(404, 'GROUP_NOT_FOUND', 'Duplicate not found.');
  if (g.status !== 'flagged') throw new AppError(409, 'DUPLICATE_ALREADY_RESOLVED', 'This duplicate was already resolved.');
  const { rows: lines } = await c.query(
    `SELECT id FROM cart_items WHERE session_id = $1 AND product_id = $2 AND type = 'shared' AND status = 'active'
     ORDER BY created_at, id`, [sessionId, g.product_id]);
  const lineIds = lines.map((l) => l.id);
  const [anchorId, ...restIds] = lineIds;
  let capped = false;
  if (action === 'merge') {
    capped = await mergeLines(c, anchorId, lineIds, restIds);
  } else if (action === 'remove') {
    await c.query(`UPDATE cart_items SET status = 'removed', updated_at = now() WHERE id = ANY($1::uuid[])`, [restIds]);
  }
  const status = { merge: 'merged', remove: 'removed', keep_all: 'kept' }[action];
  await c.query(
    `UPDATE duplicate_groups SET status = $2, resolved_by = $3, resolved_at = now(),
       kept_member_ids = CASE WHEN $2 = 'kept' THEN
         (SELECT array_agg(DISTINCT member_id) FROM cart_item_contributions WHERE item_id = ANY($4::uuid[]))
         ELSE kept_member_ids END
     WHERE id = $1`, [g.id, status, actorId, lineIds]);
  return { status, anchorId, affectedIds: lineIds, removedIds: action === 'keep_all' ? [] : restIds, capped };
}

module.exports = { listLiveGroups, recompute, resolve };
