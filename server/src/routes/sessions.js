/** Session endpoints: create, preview, join, state, invite (FR-API-03..07). */
const { Router } = require('express');
const { z } = require('zod');
const { DISPLAY_NAME_MAX } = require('../config');
const { h } = require('../lib/errors');
const { validate } = require('../middleware/validate');
const { memberAuth } = require('../middleware/memberAuth');
const sessions = require('../services/sessionService');

const nameBody = validate(z.object({ displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX) }));

module.exports = ({ emit, presence }) => Router()
  .post('/sessions', nameBody, h(async (req, res) => {
    res.status(201).json(await sessions.createSession(req.body.displayName));
  }))
  .get('/sessions/:token/preview', h(async (req, res) => {
    res.json(await sessions.previewSession(req.params.token));
  }))
  .post('/sessions/:token/join', nameBody, h(async (req, res) => {
    const { sessionId, result, event } = await sessions.joinSession(req.params.token, req.body.displayName);
    res.status(201).json(result);
    emit(sessionId, event);
  }))
  .get('/sessions/:token/state', memberAuth, h(async (req, res) => {
    const { sessionId, id } = req.member;
    res.json(await sessions.getSnapshot(sessionId, id, await presence.list(sessionId)));
  }))
  .get('/sessions/:token/invite', memberAuth, h(async (req, res) => {
    res.json(await sessions.getInvite(req.params.token));
  }));
