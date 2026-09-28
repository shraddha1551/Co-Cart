/** Reads shared by every mutation: item rows, the locked session row, and the cart:event builder. */
const { AppError } = require('../lib/errors');
const { bumpRevision } = require('../db/pool');
const { listLiveGroups } = require('./duplicateService');

const ITEMS_SQL = `
  SELECT i.id, i.product_id, i.name, p.unit_label, i.unit_price_paise, i.quantity, i.type, i.status,
         i.added_by, i.created_at, g.id AS duplicate_group_id,
         COALESCE((SELECT json_agg(json_build_object('memberId', c.member_id, 'quantity', c.quantity)
                                   ORDER BY c.first_added_at)
                   FROM cart_item_contributions c WHERE c.item_id = i.id), '[]') AS contributions
  FROM cart_items i
  JOIN products p ON p.id = i.product_id
  LEFT JOIN duplicate_groups g
         ON g.session_id = i.session_id AND g.product_id = i.product_id
        AND g.status IN ('flagged','kept') AND i.type = 'shared'
  WHERE i.session_id = $1 AND i.status = 'active'
    AND ($2::uuid[] IS NULL OR i.id = ANY($2::uuid[]))
  ORDER BY i.created_at, i.id`;

const toItem = (r) => ({
  id: r.id, productId: r.product_id, name: r.name, unitLabel: r.unit_label, unitPricePaise: r.unit_price_paise,
  quantity: r.quantity, type: r.type, status: r.status, addedBy: r.added_by, contributions: r.contributions,
  duplicateGroupId: r.duplicate_group_id, createdAt: r.created_at,
});

/** Active items of a session with contributions; all of them when ids is null. */
async function loadItems(db, sessionId, ids = null) {
  const { rows } = await db.query(ITEMS_SQL, [sessionId, ids]);
  return rows.map(toItem);
}

/** Re-read the session inside the lock and require status 'open' (FR-SESS-07). */
async function openSession(c, sessionId) {
  const { rows: [s] } = await c.query('SELECT status, host_member_id FROM cart_sessions WHERE id = $1', [sessionId]);
  if (s.status !== 'open') throw new AppError(409, 'SESSION_LOCKED', 'This cart is locked.');
  return s;
}

/** Throw 403 HOST_ONLY unless memberId is the host of the (already locked) session row. */
function assertHost(session, memberId) {
  if (session.host_member_id !== memberId) throw new AppError(403, 'HOST_ONLY', 'Only the host can do this.');
}

/** Bump the revision and build one cart:event carrying changed lines and the full live duplicate list. */
async function itemEvent(c, sessionId, type, actorId, upsertIds, removedItemIds = []) {
  const revision = await bumpRevision(c, sessionId);
  const upsertItems = upsertIds.length ? await loadItems(c, sessionId, upsertIds) : [];
  const duplicateGroups = await listLiveGroups(c, sessionId);
  return { revision, upsertItems, event: { type, revision, actorId, payload: { upsertItems, removedItemIds, duplicateGroups } } };
}

module.exports = { loadItems, openSession, assertHost, itemEvent };
