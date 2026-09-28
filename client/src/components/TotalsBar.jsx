/** Sticky footer: cart total, what I added, and the host-only Checkout button (FR-UI-04, WIREFRAME §3.3). */
import { formatPaise } from '../lib/format';

export default function TotalsBar({ totals, isHost, host, blockedReason, onCheckout }) {
  return (
    <footer className="totals">
      <span>Cart {formatPaise(totals.grand)} · Your share {formatPaise(totals.myShare)}</span>
      {isHost ? (
        <button className="primary" disabled={Boolean(blockedReason)} onClick={onCheckout}>
          {blockedReason ? `Checkout (${blockedReason})` : `Checkout · ${formatPaise(totals.grand)}`}
        </button>
      ) : (
        <span className="muted small">{host.displayName} (host) will check out</span>
      )}
    </footer>
  );
}
