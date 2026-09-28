/** Snapshot + event reducer with the revision rule (DESIGN §2.3.4, FR-RT-06). */
export const initialState = { data: null, revision: -1, loading: true, buffer: [], needsResync: false };

const byCreated = (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Apply one event payload: upsert/remove items, upsert members, merge session, replace duplicate groups. */
function applyPayload(data, p) {
  const items = new Map(data.items.map((i) => [i.id, i]));
  p.upsertItems?.forEach((it) => items.set(it.id, it));
  p.removedItemIds?.forEach((id) => items.delete(id));
  const members = new Map(data.members.map((m) => [m.id, m]));
  p.members?.forEach((m) => members.set(m.id, { ...members.get(m.id), ...m }));
  return {
    ...data,
    session: p.session ? { ...data.session, ...p.session } : data.session,
    items: [...items.values()].sort(byCreated),
    members: [...members.values()].sort((a, b) => a.joinOrder - b.joinOrder),
    duplicateGroups: p.duplicateGroups ?? data.duplicateGroups,
  };
}

/** Ignore stale events, apply the next one, and ask for a resync on any gap. */
function applyEvent(state, e) {
  if (e.revision <= state.revision) return state;
  if (e.revision !== state.revision + 1) return { ...state, needsResync: true };
  return { ...state, data: applyPayload(state.data, e.payload), revision: e.revision };
}

export function cartReducer(state, action) {
  switch (action.type) {
    case 'RESYNC_START':
      return { ...state, loading: true, needsResync: false };
    case 'SNAPSHOT': {
      const loaded = { ...state, data: action.data, revision: action.data.session.revision, loading: false, buffer: [] };
      return [...state.buffer].sort((a, b) => a.revision - b.revision).reduce(applyEvent, loaded);
    }
    case 'EVENT':
      return state.loading ? { ...state, buffer: [...state.buffer, action.event] } : applyEvent(state, action.event);
    default:
      return state;
  }
}
