/** Add, update and remove a member's contribution to cart lines (FR-ITEM-01..08). */
const { MAX_QTY } = require('../config');
const { withSessionLock } = require('../db/pool');
const { AppError } = require('../lib/errors');
const { recompute } = require('./duplicateService');
const { openSession, itemEvent } = require('./cartState');

/** Set line.quantity = Σ contributions, or mark the line removed when none are left. Returns the new quantity. */
async function syncLineQuantity(c, itemId) {
  const { rows: [r] } = await c.query(
    `UPDATE cart_items i
     SET quantity = COALESCE(s.q, i.quantity),
         status = CASE WHEN s.q IS NULL THEN 'removed' ELSE i.status END,
         updated_at = now()
     FROM (SELECT SUM(quantity)::int AS q FROM cart_item_contributions WHERE item_id = $1) s
     WHERE i.id = $1 RETURNING COALESCE(s.q, 0) AS q`, [itemId]);
  return r.q;
}

/** Add `quantity` units to my contribution on an active line; returns the units actually added (capped at 20). */
async function growContribution(c, line, memberId, quantity) {
  const added = Math.min(quantity, Math.max(MAX_QTY - line.quantity, 0));
  if (added > 0) {
    await c.query(
      'UPDATE cart_item_contributions SET quantity = quantity + $3 WHERE item_id = $1 AND member_id = $2',
      [line.id, memberId, added]);
    await syncLineQuantity(c, line.id);
  }
  return added;
}

/** The active line of this product+type that the member already contributes to (BR-05), if any. */
async function findMyLine(c, sessionId, memberId, productId, type, excludeId = null) {
  const { rows: [line] } = await c.query(
    `SELECT i.id, i.quantity FROM cart_items i
     JOIN cart_item_contributions co ON co.item_id = i.id AND co.member_id = $2
     WHERE i.session_id = $1 AND i.product_id = $3 AND i.type = $4 AND i.status = 'active'
       AND i.id IS DISTINCT FROM $5 LIMIT 1`, [sessionId, memberId, productId, type, excludeId]);
  return line;
}

/** Load an active line with my contribution and its contributor count; 404/403 when not allowed. */
async function myLine(c, sessionId, memberId, itemId) {
  const { rows: [line] } = await c.query(
    `SELECT i.id, i.product_id, i.type, i.quantity, co.quantity AS my_qty,
            (SELECT count(*)::int FROM cart_item_contributions x WHERE x.item_id = i.id) AS contributors
     FROM cart_items i LEFT JOIN cart_item_contributions co ON co.item_id = i.id AND co.member_id = $3
     WHERE i.id = $2 AND i.session_id = $1 AND i.status = 'active'`, [sessionId, itemId, memberId]);
  if (!line) throw new AppError(404, 'ITEM_NOT_FOUND', 'Item not found.');
  if (line.my_qty === null) throw new AppError(403, 'NOT_A_CONTRIBUTOR', 'You can only change your own items.');
  return line;
}

/** Add a product, growing my existing line of the same type instead of inserting a duplicate (BR-05). */
function addItem(sessionId, member, { productId, quantity, type }) {
  return withSessionLock(sessionId, async (c) => {
    await openSession(c, sessionId);
    const existing = await findMyLine(c, sessionId, member.id, productId, type);
    let itemId;
    let added;
    if (existing) {
      itemId = existing.id;
      added = await growContribution(c, existing, member.id, quantity);
    } else {
      added = Math.min(quantity, MAX_QTY);
      const { rows: [ins] } = await c.query(
        `INSERT INTO cart_items (session_id, added_by, product_id, name, unit_price_paise, quantity, type)
         SELECT $1::uuid, $2::uuid, id, name, price_paise, $4::int, $5::text FROM products WHERE id = $3 RETURNING id`,
        [sessionId, member.id, productId, added, type]);
      if (!ins) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
      itemId = ins.id;
      await c.query('INSERT INTO cart_item_contributions (item_id, member_id, quantity) VALUES ($1, $2, $3)', [itemId, member.id, added]);
    }
    const capped = added < quantity;
    if (added === 0) {
      const { rows: [s] } = await c.query('SELECT revision FROM cart_sessions WHERE id = $1', [sessionId]);
      return { status: 200, result: { itemId, mergedIntoExisting: true, capped, revision: Number(s.revision) }, event: null };
    }
    await recompute(c, sessionId, productId);
    const { revision, upsertItems, event } = await itemEvent(c, sessionId, 'item_added', member.id, [itemId]);
    return {
      status: existing ? 200 : 201,
      result: { item: upsertItems[0], mergedIntoExisting: Boolean(existing), capped, revision },
      event,
    };
  });
}

/** Change my contribution quantity and/or retag a line I solely contribute to (FR-ITEM-05/06). */
function updateItem(sessionId, member, itemId, { quantity, type }) {
  return withSessionLock(sessionId, async (c) => {
    await openSession(c, sessionId);
    const line = await myLine(c, sessionId, member.id, itemId);
    let myQty = line.my_qty;
    if (quantity !== undefined && quantity !== myQty) {
      if (line.quantity - myQty + quantity > MAX_QTY) throw new AppError(400, 'VALIDATION_ERROR', `Max ${MAX_QTY} per item.`);
      await c.query('UPDATE cart_item_contributions SET quantity = $3 WHERE item_id = $1 AND member_id = $2', [itemId, member.id, quantity]);
      await syncLineQuantity(c, itemId);
      myQty = quantity;
    }
    let upsertIds = [itemId];
    let removedIds = [];
    if (type && type !== line.type) {
      if (line.contributors > 1) {
        throw new AppError(409, 'LINE_HAS_MULTIPLE_CONTRIBUTORS', 'Only a line with just your items can change tag.');
      }
      const target = await findMyLine(c, sessionId, member.id, line.product_id, type, itemId);
      if (target) {
        await growContribution(c, target, member.id, myQty);
        await c.query(`UPDATE cart_items SET status = 'merged', merged_into = $2, updated_at = now() WHERE id = $1`, [itemId, target.id]);
        upsertIds = [target.id];
        removedIds = [itemId];
      } else {
        await c.query('UPDATE cart_items SET type = $2, updated_at = now() WHERE id = $1', [itemId, type]);
      }
    }
    await recompute(c, sessionId, line.product_id);
    const { revision, upsertItems, event } = await itemEvent(c, sessionId, 'item_updated', member.id, upsertIds, removedIds);
    return { status: 200, result: { item: upsertItems[0], revision }, event };
  });
}

/** Remove my contribution; the line is removed when nobody contributes any more (FR-ITEM-05). */
function removeItem(sessionId, member, itemId) {
  return withSessionLock(sessionId, async (c) => {
    await openSession(c, sessionId);
    const line = await myLine(c, sessionId, member.id, itemId);
    await c.query('DELETE FROM cart_item_contributions WHERE item_id = $1 AND member_id = $2', [itemId, member.id]);
    const lineRemoved = (await syncLineQuantity(c, itemId)) === 0;
    await recompute(c, sessionId, line.product_id);
    const { revision, event } = await itemEvent(
      c, sessionId, 'item_removed', member.id, lineRemoved ? [] : [itemId], lineRemoved ? [itemId] : []);
    return { status: 200, result: { itemId, lineRemoved, revision }, event };
  });
}

module.exports = { addItem, updateItem, removeItem };
