/** POST /duplicates/:groupId/resolve — host-only Merge / Keep all / Remove (FR-API-11, FR-DUP-02..06). */
const { Router } = require('express');
const { z } = require('zod');
const { withSessionLock } = require('../db/pool');
const { h } = require('../lib/errors');
const { validate } = require('../middleware/validate');
const { memberAuth } = require('../middleware/memberAuth');
const { resolve } = require('../services/duplicateService');
const { openSession, assertHost, itemEvent } = require('../services/cartState');

const body = validate(z.object({ action: z.enum(['merge', 'keep_all', 'remove']) }));

module.exports = ({ emit }) => Router().post('/sessions/:token/duplicates/:groupId/resolve', memberAuth, body, h(async (req, res) => {
  const { sessionId, id: memberId } = req.member;
  const { result, event } = await withSessionLock(sessionId, async (c) => {
    assertHost(await openSession(c, sessionId), memberId);
    const r = await resolve(c, sessionId, req.params.groupId, req.body.action, memberId);
    const out = await itemEvent(c, sessionId, 'duplicate_resolved', memberId, [r.anchorId], r.removedIds);
    return {
      result: {
        group: { id: req.params.groupId, status: r.status }, survivingItemId: r.anchorId,
        affectedItemIds: r.affectedIds, capped: r.capped, revision: out.revision,
      },
      event: out.event,
    };
  });
  res.json(result);
  emit(sessionId, event);
}));
