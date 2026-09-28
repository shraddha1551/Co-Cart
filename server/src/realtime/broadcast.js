/** Emit one cart:event per committed mutation to the session room (FR-RT-04..07). */

/** Build emitCartEvent(sessionId, event); a null event (no change) is skipped, a failure never throws (NFR-REL-04). */
function makeBroadcaster(io, logger) {
  return function emitCartEvent(sessionId, event) {
    if (!event) return;
    try {
      io.to(`session:${sessionId}`).emit('cart:event', { ...event, sessionId, at: new Date().toISOString() });
    } catch (err) {
      logger.error({ err, sessionId }, 'broadcast failed');
    }
  };
}

module.exports = { makeBroadcaster };
