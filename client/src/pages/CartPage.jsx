/** The live collaborative cart: catalog + cart list + totals, with invite and checkout (FR-UI-04..07). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { splitShare } from '../lib/format';
import { identity } from '../lib/identity';
import { useCartSession } from '../state/useCartSession';
import { useToast } from '../components/Toast';
import PresenceBar from '../components/PresenceBar';
import InviteModal from '../components/InviteModal';
import CatalogPanel from '../components/CatalogPanel';
import CartList from '../components/CartList';
import TotalsBar from '../components/TotalsBar';
import CheckoutModal from '../components/CheckoutModal';

const MAX_MEMBERS = 10;

/** Derived, never stored: who I am, names, group statuses and money totals (DESIGN §5.3). */
function describe(data) {
  const meId = data.me.memberId;
  const host = data.members.find((m) => m.isHost);
  const names = new Map(data.members.map((m) => [m.id, m.id === meId ? 'you' : m.displayName]));
  const groupStatus = new Map(data.duplicateGroups.map((g) => [g.id, g.status]));
  const totals = { grand: 0, shared: 0, personal: 0, myPersonal: 0 };
  for (const i of data.items) {
    const cost = i.quantity * i.unitPricePaise;
    totals.grand += cost;
    totals[i.type] += cost;
    if (i.type === 'personal') totals.myPersonal += (i.contributions.find((c) => c.memberId === meId)?.quantity ?? 0) * i.unitPricePaise;
  }
  totals.myShare = splitShare(totals.shared, data.members.length, data.members.findIndex((m) => m.id === meId)) + totals.myPersonal;
  const flagged = data.duplicateGroups.filter((g) => g.status === 'flagged').length;
  let blockedReason = null;
  if (flagged) blockedReason = `resolve ${flagged} duplicate(s) first`;
  else if (!data.items.length) blockedReason = 'cart is empty';
  return { meId, host, isHost: host.id === meId, names, groupStatus, totals, blockedReason };
}

export default function CartPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const onAuthFailed = useCallback(() => {
    identity.clear(token);
    toast('Please join again');
    navigate(`/join/${token}`, { replace: true });
  }, [token, toast, navigate]);
  const { data, connection, online, actions } = useCartSession(token, onAuthFailed);
  const [tab, setTab] = useState('cart');
  const [modal, setModal] = useState(null);
  const closeModal = useCallback(() => setModal(null), []);
  const view = useMemo(() => data && describe(data), [data]);
  const status = data?.session.status;

  useEffect(() => {
    if (status === 'checked_out' || status === 'settled') navigate(`/cart/${token}/settle`, { replace: true });
  }, [status, token, navigate]);

  if (!data) {
    return <main><div className="skeleton bar" /><div className="skeleton bar" /><div className="skeleton bar" /></main>;
  }
  const readOnly = status !== 'open';

  return (
    <div className="page">
      <PresenceBar data={data} online={online} connection={connection} onInvite={() => setModal('invite')} />
      {connection === 'reconnecting' && <div className="notice">◌ Reconnecting… changes you see may be out of date</div>}
      {status === 'expired' && (
        <div className="notice row">⏰ This cart expired after 24 hours. Items are read-only. <Link className="button" to="/">Start a new cart</Link></div>
      )}
      <nav className="tabs">
        <button className={tab === 'cart' ? 'active' : ''} onClick={() => setTab('cart')}>Cart ({data.items.length})</button>
        <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>Add items</button>
      </nav>
      <main className={`cart-grid show-${tab}`}>
        <div className="col-add">
          {!readOnly && <CatalogPanel items={data.items} meId={view.meId} names={view.names} onAdd={actions.addItem} />}
        </div>
        <div className="col-cart">
          <CartList data={data} view={view} online={online} readOnly={readOnly} actions={actions}
            onAddItems={readOnly ? null : () => setTab('add')} onInvite={() => setModal('invite')} />
        </div>
      </main>
      <TotalsBar totals={view.totals} isHost={view.isHost && !readOnly} host={view.host}
        blockedReason={view.blockedReason} onCheckout={() => setModal('checkout')} />
      {modal === 'invite' && <InviteModal token={token} memberCount={data.members.length} maxMembers={MAX_MEMBERS} onClose={closeModal} />}
      {modal === 'checkout' && <CheckoutModal totals={view.totals} onConfirm={actions.checkout} onClose={closeModal} />}
    </div>
  );
}
