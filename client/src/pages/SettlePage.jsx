/** After checkout: who owes what, live paid toggles, and the order with contributors (FR-UI-08). */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatPaise } from '../lib/format';
import { identity } from '../lib/identity';
import { useCartSession } from '../state/useCartSession';
import { useToast } from '../components/Toast';
import PresenceBar from '../components/PresenceBar';
import SettlementTable from '../components/SettlementTable';

export default function SettlePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const onAuthFailed = useCallback(() => {
    identity.clear(token);
    toast('Please join again');
    navigate(`/join/${token}`, { replace: true });
  }, [token, toast, navigate]);
  const { data, revision, connection, online, actions } = useCartSession(token, onAuthFailed);
  const [settlement, setSettlement] = useState(null);
  const status = data?.session.status;

  useEffect(() => {
    if (status === 'open') navigate(`/cart/${token}`, { replace: true });
  }, [status, token, navigate]);

  useEffect(() => {
    if (revision >= 0) api.settlement(token).then(setSettlement).catch((e) => toast(e.message));
  }, [token, revision, toast]);

  if (!data || !settlement) return <main><div className="skeleton bar" /><div className="skeleton bar" /></main>;
  const meId = data.me.memberId;
  const host = data.members.find((m) => m.isHost);
  const names = new Map(data.members.map((m) => [m.id, m.id === meId ? 'you' : m.displayName]));

  return (
    <div className="page">
      <PresenceBar data={data} online={online} connection={connection} />
      <main className="narrow wide stack">
        <div>
          <h1>{host.displayName} (host) paid {formatPaise(settlement.grandPaise)}</h1>
          <p className="muted">
            Shared items ({formatPaise(settlement.sharedPaise)}) are split equally between {settlement.rows.length} people;
            personal items are paid by whoever added them.
          </p>
        </div>
        <SettlementTable settlement={settlement} meId={meId} isHost={host.id === meId} onToggle={actions.setPaid} />
        <details>
          <summary>View order ({data.items.length} items)</summary>
          <ul className="list">
            {data.items.map((i) => (
              <li key={i.id} className="line">
                <div className="row"><span>{i.name} × {i.quantity}</span><span className="amount">{formatPaise(i.quantity * i.unitPricePaise)}</span></div>
                <div className="muted small">{i.type} · {i.contributions.map((c) => `${names.get(c.memberId)} ${c.quantity}`).join(' · ')}</div>
              </li>
            ))}
          </ul>
        </details>
      </main>
    </div>
  );
}
