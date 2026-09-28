/** Random tokens for sessions/members and SHA-256 hashing of member tokens. */
const crypto = require('crypto');

const newSessionToken = () => crypto.randomBytes(16).toString('base64url');
const newMemberToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

module.exports = { newSessionToken, newMemberToken, hashToken };
