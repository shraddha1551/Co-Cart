/** Checkout, settlement and paid toggle endpoints (FR-API-12..14). */
const { Router } = require('express');
const { z } = require('zod');
const { h } = require('../lib/errors');
const { validate } = require('../middleware/validate');
const { memberAuth } = require('../middleware/memberAuth');
const settlement = require('../services/settlementService');

const paidBody = validate(z.object({ hasPaid: z.boolean() }));

module.exports = ({ emit }) => Router()
  .post('/sessions/:token/checkout', memberAuth, h(async (req, res) => {
    const { result, event } = await settlement.checkout(req.member.sessionId, req.member);
    res.json(result);
    emit(req.member.sessionId, event);
  }))
  .get('/sessions/:token/settlement', memberAuth, h(async (req, res) => {
    res.json(await settlement.getSettlement(req.member.sessionId));
  }))
  .patch('/sessions/:token/members/:memberId/paid', memberAuth, paidBody, h(async (req, res) => {
    const { result, event } = await settlement.setPaid(req.member.sessionId, req.member, req.params.memberId, req.body.hasPaid);
    res.json(result);
    emit(req.member.sessionId, event);
  }));
