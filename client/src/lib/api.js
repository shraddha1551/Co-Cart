/** fetch wrapper: JSON in/out, X-Member-Token from identity, server errors thrown as ApiError { code, message }. */
import { identity } from './identity';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const memberToken = token && identity.get(token);
  if (memberToken) headers['X-Member-Token'] = memberToken;
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: body && JSON.stringify(body) });
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the server.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error?.code ?? 'INTERNAL', data.error?.message ?? 'Something went wrong.');
  return data;
}

const at = (token, path = '') => `/sessions/${token}${path}`;

export const api = {
  catalog: () => call('GET', '/catalog'),
  create: (displayName) => call('POST', '/sessions', { body: { displayName } }),
  preview: (token) => call('GET', at(token, '/preview')),
  join: (token, displayName) => call('POST', at(token, '/join'), { body: { displayName } }),
  state: (token) => call('GET', at(token, '/state'), { token }),
  invite: (token) => call('GET', at(token, '/invite'), { token }),
  addItem: (token, body) => call('POST', at(token, '/items'), { token, body }),
  updateItem: (token, id, body) => call('PATCH', at(token, `/items/${id}`), { token, body }),
  removeItem: (token, id) => call('DELETE', at(token, `/items/${id}`), { token }),
  resolve: (token, groupId, action) => call('POST', at(token, `/duplicates/${groupId}/resolve`), { token, body: { action } }),
  checkout: (token) => call('POST', at(token, '/checkout'), { token }),
  settlement: (token) => call('GET', at(token, '/settlement'), { token }),
  setPaid: (token, memberId, hasPaid) => call('PATCH', at(token, `/members/${memberId}/paid`), { token, body: { hasPaid } }),
};
