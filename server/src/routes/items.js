/** Item endpoints: add, update my part, remove my part (FR-API-08..10). */
const { Router } = require('express');
const { z } = require('zod');
const { MAX_QTY } = require('../config');
const { h } = require('../lib/errors');
const { validate } = require('../middleware/validate');
const { memberAuth } = require('../middleware/memberAuth');
const items = require('../services/itemService');

const qty = z.number().int().min(1).max(MAX_QTY);
const type = z.enum(['personal', 'shared']);
const addBody = z.object({ productId: z.number().int().positive(), quantity: qty.default(1), type: type.default('shared') });
const patchBody = z.object({ quantity: qty.optional(), type: type.optional() })
  .refine((b) => b.quantity !== undefined || b.type !== undefined, 'quantity or type is required');

module.exports = ({ emit }) => {
  /** Run a service call, send its result, then broadcast its event (after commit, FR-RT-07). */
  const run = (call) => h(async (req, res) => {
    const { status, result, event } = await call(req);
    res.status(status).json(result);
    emit(req.member.sessionId, event);
  });

  return Router()
    .post('/sessions/:token/items', memberAuth, validate(addBody),
      run((req) => items.addItem(req.member.sessionId, req.member, req.body)))
    .patch('/sessions/:token/items/:itemId', memberAuth, validate(patchBody),
      run((req) => items.updateItem(req.member.sessionId, req.member, req.params.itemId, req.body)))
    .delete('/sessions/:token/items/:itemId', memberAuth,
      run((req) => items.removeItem(req.member.sessionId, req.member, req.params.itemId)));
};
