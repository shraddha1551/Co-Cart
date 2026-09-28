/** Checkout, settlement and the paid toggle: shared split equally, personal paid by its adder (FR-SET-01..06, DESIGN §2.3.5). */
const { withSessionLock, withSnapshot, bumpRevision } = require('../db/pool');
const { AppError } = require('../lib/errors');
const { openSession, assertHost } = require('./cartState');

/** Equal share of `total` paise for member `index` of `count`; the host (index 0) absorbs leftover paise. */
const splitShare = (total, count, index) => Math.floor(total / count) + (index === 0 ? total % count : 0);

/**
 * Pure settlement from members (ordered by join_order, host first) and per-member contribution totals
 * ({ member_id, type, paise }). Shared total is split equally across all members; personal items are
 * paid by whoever added them; the payer owes nothing (BR-10, BR-11).
 */
function computeSettlement({ members, totals, payerMemberId, status }) {
  const added = Object.fromEntries(members.map((m) => [m.id, { shared: 0, personal: 0 }]));
  for (const t of totals) added[t.member_id][t.type] += Number(t.paise);
  const sum = (list, key) => list.reduce((a, r) => a + r[key], 0);
  const sharedPaise = sum(Object.values(added), 'shared');
  const rows = members.map((m, i) => {
    const { shared, personal } = added[m.id];
    const share = splitShare(sharedPaise, members.length, i);
    const isPayer = m.id === payerMemberId;
    return {
      memberId: m.id, displayName: m.display_name, sharedPaise: share, personalPaise: personal,
      addedPaise: shared + personal, owedPaise: isPayer ? 0 : share + personal, isPayer, hasPaid: m.has_paid,
    };
  });
  return {
    status,
    payerMemberId: payerMemberId || null,
    grandPaise: sharedPaise + sum(rows, 'personalPaise'),
    sharedPaise,
    rows,
    outstandingPaise: sum(rows.filter((r) => !r.hasPaid), 'owedPaise'),
  };
}

/** Load members and contribution totals for a session and compute its settlement. */
async function getSettlement(sessionId) {
  return withSnapshot(async (c) => {
    const { rows: [s] } = await c.query('SELECT status, payer_member_id FROM cart_sessions WHERE id = $1', [sessionId]);
    const { rows: members } = await c.query(
      'SELECT id, display_name, has_paid FROM cart_members WHERE session_id = $1 ORDER BY join_order', [sessionId]);
    const { rows: totals } = await c.query(
      `SELECT c.member_id, i.type, SUM(c.quantity * i.unit_price_paise)::bigint AS paise
       FROM cart_items i JOIN cart_item_contributions c ON c.item_id = i.id
       WHERE i.session_id = $1 AND i.status = 'active' GROUP BY c.member_id, i.type`, [sessionId]);
    return computeSettlement({ members, totals, payerMemberId: s.payer_member_id, status: s.status });
  });
}

/** Host-only checkout: host becomes payer and is marked paid; cart locks (FR-SET-01, BR-07/08/11). */
function checkout(sessionId, member) {
  return withSessionLock(sessionId, async (c) => {
    const s = await openSession(c, sessionId);
    assertHost(s, member.id);
    const { rows: [n] } = await c.query(
      `SELECT (SELECT count(*)::int FROM duplicate_groups WHERE session_id = $1 AND status = 'flagged') AS flagged,
              (SELECT count(*)::int FROM cart_items WHERE session_id = $1 AND status = 'active') AS active`, [sessionId]);
    if (n.flagged) throw new AppError(409, 'UNRESOLVED_DUPLICATES', `Resolve ${n.flagged} duplicate(s) first.`);
    if (!n.active) throw new AppError(409, 'EMPTY_CART', 'The cart is empty.');
    await c.query(
      `UPDATE cart_sessions SET status = 'checked_out', payer_member_id = host_member_id, checked_out_at = now() WHERE id = $1`,
      [sessionId]);
    await c.query('UPDATE cart_members SET has_paid = true, paid_at = now() WHERE id = $1', [member.id]);
    const revision = await bumpRevision(c, sessionId);
    const session = { status: 'checked_out', payerMemberId: member.id };
    return {
      result: { session, revision },
      event: {
        type: 'checked_out', revision, actorId: member.id,
        payload: { upsertItems: [], removedItemIds: [], session, members: [{ id: member.id, hasPaid: true }] },
      },
    };
  });
}

/** Toggle paid: yourself, or anyone if you are the host; settles when everyone has paid (FR-SET-05, BR-12). */
function setPaid(sessionId, member, targetId, hasPaid) {
  return withSessionLock(sessionId, async (c) => {
    const { rows: [s] } = await c.query('SELECT status, host_member_id FROM cart_sessions WHERE id = $1', [sessionId]);
    if (!['checked_out', 'settled'].includes(s.status)) throw new AppError(409, 'NOT_CHECKED_OUT', 'The cart has not been checked out yet.');
    const isHost = member.id === s.host_member_id;
    if (targetId !== member.id && !isHost) throw new AppError(403, 'NOT_ALLOWED', 'You can only change your own paid status.');
    if (targetId === s.host_member_id && !hasPaid) throw new AppError(400, 'VALIDATION_ERROR', 'The payer is always paid.');
    const { rowCount } = await c.query(
      `UPDATE cart_members SET has_paid = $3, paid_at = CASE WHEN $3 THEN now() END WHERE id = $2 AND session_id = $1`,
      [sessionId, targetId, hasPaid]);
    if (!rowCount) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found.');
    const { rows: [u] } = await c.query(
      `UPDATE cart_sessions SET status = CASE WHEN EXISTS
         (SELECT 1 FROM cart_members WHERE session_id = $1 AND NOT has_paid) THEN 'checked_out' ELSE 'settled' END
       WHERE id = $1 RETURNING status`, [sessionId]);
    const revision = await bumpRevision(c, sessionId);
    return {
      result: { memberId: targetId, hasPaid, sessionStatus: u.status, revision },
      event: {
        type: 'paid_changed', revision, actorId: member.id,
        payload: { upsertItems: [], removedItemIds: [], members: [{ id: targetId, hasPaid }], session: { status: u.status } },
      },
    };
  });
}

module.exports = { splitShare, computeSettlement, getSettlement, checkout, setPaid };
