/** Per-member Shared / Personal / Owes with the Mark as Paid toggle (FR-UI-08, BR-12). */
import { useState } from 'react';
import { formatPaise } from '../lib/format';

function PaidCell({ row, editable, onToggle }) {
  const [busy, setBusy] = useState(false);
  if (row.isPayer) return <span className="ok">✓ Payer</span>;
  if (!editable) return <span className="muted">{row.hasPaid ? '✓ Paid' : 'Unpaid'}</span>;
  const toggle = async () => {
    setBusy(true);
    await onToggle(row.memberId, !row.hasPaid);
    setBusy(false);
  };
  return (
    <button className={row.hasPaid ? 'paid' : ''} disabled={busy} onClick={toggle}>
      {row.hasPaid ? '✓ Paid' : 'Mark as paid'}
    </button>
  );
}

export default function SettlementTable({ settlement, meId, isHost, onToggle }) {
  return (
    <table className="settle">
      <thead>
        <tr><th>Member</th><th>Shared (split)</th><th>Personal</th><th>Owes</th><th>Status</th></tr>
      </thead>
      <tbody>
        {settlement.rows.map((r) => (
          <tr key={r.memberId}>
            <td data-label="Member">{r.displayName}{r.isPayer && ' (host)'}{r.memberId === meId && ' (you)'}</td>
            <td data-label="Shared" className="amount">{formatPaise(r.sharedPaise)}</td>
            <td data-label="Personal" className="amount">{formatPaise(r.personalPaise)}</td>
            <td data-label="Owes" className="amount">{r.isPayer ? '—' : formatPaise(r.owedPaise)}</td>
            <td data-label="Status">
              <PaidCell row={r} editable={isHost || r.memberId === meId} onToggle={onToggle} />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          {settlement.status === 'settled'
            ? <td colSpan={5} className="settled">All settled 🎉</td>
            : <><td colSpan={3}>Still to collect</td><td colSpan={2} className="amount">{formatPaise(settlement.outstandingPaise)}</td></>}
        </tr>
      </tfoot>
    </table>
  );
}
