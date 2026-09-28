/** Sticky header: title, connection status, Invite, and presence chips (WIREFRAME §2, FR-UI-09). */
const MAX_CHIPS = 4;
const CONNECTION = {
  live: ['● Live', 'ok'],
  connecting: ['◌ Connecting', 'warn'],
  reconnecting: ['◌ Reconnecting…', 'warn pulse'],
};

export default function PresenceBar({ data, online, connection, onInvite }) {
  const me = data.me.memberId;
  const host = data.members.find((m) => m.isHost);
  const [label, tone] = CONNECTION[connection];
  const extra = data.members.length - MAX_CHIPS;

  return (
    <header className="header">
      <div className="row">
        <strong>🛒 Sync Cart</strong>
        <span className="title">{host.displayName}&apos;s cart</span>
        <span className={`status ${tone}`}>{label}</span>
        {onInvite && <button className="outline" onClick={onInvite}>Invite</button>}
      </div>
      <div className="presence">
        {data.members.slice(0, MAX_CHIPS).map((m) => (
          <span key={m.id} className="chip">
            <span className={online.has(m.id) ? 'dot on' : 'dot'} />
            {m.displayName}{m.isHost && ' (host)'}{m.id === me && ' (you)'}
          </span>
        ))}
        {extra > 0 && <span className="chip">+{extra}</span>}
      </div>
    </header>
  );
}
