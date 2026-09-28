/** Duplicate banners, then the Shared section and one Personal section per member (FR-UI-04). */
import { formatPaise } from '../lib/format';
import CartLine from './CartLine';
import DuplicateBanner from './DuplicateBanner';

const lineTotal = (lines) => lines.reduce((sum, i) => sum + i.quantity * i.unitPricePaise, 0);

function Section({ title, lines, ...lineProps }) {
  return (
    <section>
      <h2 className="section row"><span>{title}</span><span className="amount">{formatPaise(lineTotal(lines))}</span></h2>
      <ul className="list">
        {lines.map((item) => (
          <CartLine key={item.id} item={item} dupStatus={lineProps.groupStatus.get(item.duplicateGroupId)} {...lineProps} />
        ))}
      </ul>
    </section>
  );
}

export default function CartList({ data, view, online, readOnly, actions, onAddItems, onInvite }) {
  const { meId, isHost, host, names, groupStatus } = view;
  if (data.items.length === 0) {
    return (
      <div className="empty stack center">
        <h2>🧺 Cart is empty</h2>
        <p className="muted">Add items — everyone sees them instantly.</p>
        {onAddItems && <button className="primary" onClick={onAddItems}>Add items</button>}
        <p className="muted">Invite people so they can add theirs too.</p>
        <button onClick={onInvite}>Invite</button>
      </div>
    );
  }
  const lineProps = { meId, names, groupStatus, readOnly, actions };
  const personal = data.members
    .map((m) => ({ m, lines: data.items.filter((i) => i.type === 'personal' && i.contributions[0]?.memberId === m.id) }))
    .filter(({ lines }) => lines.length);

  return (
    <div className="stack">
      {data.duplicateGroups.filter((g) => g.status === 'flagged').map((g) => (
        <DuplicateBanner key={g.id} group={g} names={names} isHost={isHost && !readOnly} host={host}
          hostOnline={online.has(host.id)} onResolve={actions.resolveDuplicate} />
      ))}
      <Section title={`Shared · split ${data.members.length} ways`} lines={data.items.filter((i) => i.type === 'shared')} {...lineProps} />
      {personal.map(({ m, lines }) => (
        <Section key={m.id} title={`Personal · ${m.displayName}${m.id === meId ? ' (you)' : ''}`} lines={lines} {...lineProps} />
      ))}
    </div>
  );
}
