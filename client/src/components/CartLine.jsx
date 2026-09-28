/** One cart line: contributors, my stepper / remove / tag when allowed, duplicate badge (FR-UI-05/06). */
import { useState } from 'react';
import { formatPaise } from '../lib/format';

const MAX_QTY = 20;
const FRESH_MS = 3000;

export default function CartLine({ item, meId, names, dupStatus, readOnly, actions }) {
  const [busy, setBusy] = useState(false);
  const mine = item.contributions.find((c) => c.memberId === meId);
  const several = item.contributions.length > 1;
  const editable = mine && !readOnly;
  const fresh = !mine && Date.now() - new Date(item.createdAt).getTime() < FRESH_MS;

  const run = async (fn) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const setQty = (quantity) => run(() => actions.updateItem(item.id, { quantity }));

  let who = `added by ${names.get(item.contributions[0]?.memberId)}`;
  if (several) who = item.contributions.map((c) => `${names.get(c.memberId)} ${c.quantity}`).join(' · ');
  else if (mine) who = 'you';

  return (
    <li className={['line', dupStatus === 'flagged' && 'dup', fresh && 'flash', busy && 'faded'].filter(Boolean).join(' ')}>
      <div className="row">
        <span className="name">{item.name} <span className="muted">· {item.unitLabel}</span></span>
        {dupStatus === 'flagged' && <span className="badge warn">⚠ Duplicate</span>}
        {dupStatus === 'kept' && <span className="badge muted">Kept separately</span>}
      </div>
      <div className="row muted small">
        <span>{who}</span>
        <span>{item.quantity} × {formatPaise(item.unitPricePaise)}</span>
        <span className="amount">{formatPaise(item.quantity * item.unitPricePaise)}</span>
      </div>
      {editable && (
        <div className="row">
          {several && <span className="muted small">your part</span>}
          <div className="stepper">
            <button disabled={busy || mine.quantity <= 1} onClick={() => setQty(mine.quantity - 1)}>−</button>
            <span>{mine.quantity}</span>
            <button disabled={busy || item.quantity >= MAX_QTY} title={item.quantity >= MAX_QTY ? 'Max 20' : ''}
              onClick={() => setQty(mine.quantity + 1)}>+</button>
          </div>
          {!several && (
            <select className={`tag ${item.type}`} value={item.type} disabled={busy}
              onChange={(e) => run(() => actions.updateItem(item.id, { type: e.target.value }))}>
              <option value="shared">◆ Shared</option>
              <option value="personal">◇ Personal</option>
            </select>
          )}
          <button className="icon danger" aria-label="Remove my part" disabled={busy} onClick={() => run(() => actions.removeItem(item.id))}>×</button>
        </div>
      )}
    </li>
  );
}
