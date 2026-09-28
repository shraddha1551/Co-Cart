/** Host confirms paying for the whole cart (FR-UI-07, WIREFRAME §3.7). */
import { useState } from 'react';
import { formatPaise } from '../lib/format';

export default function CheckoutModal({ totals, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    if (!(await onConfirm())) onClose();
  };
  const rows = [
    ['Shared items', totals.shared],
    ['Personal items', totals.personal],
    ['You pay now', totals.grand],
    ['Your share', totals.myShare],
    ['Others will owe you', totals.grand - totals.myShare],
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h2>Pay for the whole cart?</h2><button className="icon" aria-label="Close" onClick={onClose}>×</button></div>
        <dl className="summary">
          {rows.map(([label, paise]) => (
            <div key={label} className="row"><dt>{label}</dt><dd className="amount">{formatPaise(paise)}</dd></div>
          ))}
        </dl>
        <p className="muted small">
          After checkout the cart is locked and everyone pays you back their equal part of the shared items plus their own personal items. (Payment is simulated in this version.)
        </p>
        <div className="row">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={confirm}>{busy ? '◌ Paying…' : 'Confirm & pay'}</button>
        </div>
      </div>
    </div>
  );
}
