/** Member token per session in localStorage (FR-ID-04). Storage can be blocked, so every access is guarded. */
const PREFIX = 'synccart:member:';

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const identity = {
  get: (token) => safe(() => localStorage.getItem(PREFIX + token), null),
  set: (token, memberToken) => safe(() => localStorage.setItem(PREFIX + token, memberToken)),
  clear: (token) => safe(() => localStorage.removeItem(PREFIX + token)),
  sessions: () => safe(() => Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length)), []),
};
