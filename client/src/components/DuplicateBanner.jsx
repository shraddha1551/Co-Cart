/** One banner per flagged group: host gets Merge / Keep all / Remove, others wait (FR-UI-05). */
import { useState } from 'react';

const ACTIONS = [['merge', 'Merge into one', 'Merging…'], ['keep_all', 'Keep all', 'Keeping…'], ['remove', 'Remove extra', 'Removing…']];

const joinNames = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]);

export default function DuplicateBanner({ group, names, isHost, host, hostOnline, onResolve }) {
  const [pending, setPending] = useState(null);
  const resolve = async (action) => {
    setPending(action);
    await onResolve(group.id, action);
    setPending(null);
  };

  return (
    <div className="banner">
      <p>⚠ {group.productName} was added by {joinNames(group.memberIds.map((id) => names.get(id)))} ({group.totalQuantity} total)</p>
      {isHost ? (
        <div className="row wrap">
          {ACTIONS.map(([action, label, busy]) => (
            <button key={action} className="warn-btn" disabled={Boolean(pending)} onClick={() => resolve(action)}>
              {pending === action ? `◌ ${busy}` : label}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted small">
          Waiting for {host.displayName} (host) to merge, keep or remove. {hostOnline ? '● online' : '○ offline'}
        </p>
      )}
    </div>
  );
}
