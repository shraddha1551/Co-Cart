/** Start a cart, paste an invite link, or reopen a recent cart (FR-UI-02, WIREFRAME §3.1). */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { identity } from '../lib/identity';

const TOKEN_IN_LINK = /join\/([A-Za-z0-9_-]{22})/;
const BARE_TOKEN = /^[A-Za-z0-9_-]{22}$/;
const MAX_RECENT = 5;

export default function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    const tokens = identity.sessions().slice(0, MAX_RECENT);
    Promise.allSettled(tokens.map((t) => api.preview(t))).then((results) => setRecent(
      results.flatMap((r, i) => (r.status === 'fulfilled' ? [{ token: tokens[i], ...r.value }] : []))));
  }, []);

  const start = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.create(name.trim());
      identity.set(res.session.token, res.memberToken);
      navigate(`/cart/${res.session.token}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const go = (e) => {
    e.preventDefault();
    const value = link.trim();
    const token = value.match(TOKEN_IN_LINK)?.[1] ?? (BARE_TOKEN.test(value) ? value : null);
    if (token) navigate(`/join/${token}`);
    else setLinkError("That doesn't look like a Sync Cart link");
  };

  return (
    <main className="narrow">
      <h1 className="hero">🛒 Sync Cart</h1>
      <p className="muted center">Shop together. Split fairly. No double milk.</p>

      <form onSubmit={start} className="stack">
        <label htmlFor="name">Your name</label>
        <input id="name" value={name} maxLength={30} autoFocus onChange={(e) => setName(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Start Sync Cart'}</button>
      </form>

      <p className="divider">or</p>

      <form onSubmit={go} className="stack">
        <label htmlFor="link">Got an invite link?</label>
        <div className="row">
          <input id="link" value={link} placeholder="https://…/join/…" onChange={(e) => { setLink(e.target.value); setLinkError(''); }} />
          <button disabled={!link.trim()}>Go</button>
        </div>
        {linkError && <p className="error">{linkError}</p>}
      </form>

      {recent.length > 0 && (
        <section className="stack">
          <h2 className="section">Your recent carts</h2>
          {recent.map((c) => (
            <div key={c.token} className="row card">
              <span>{c.hostName}&apos;s cart · {c.status.replace('_', ' ')} · {c.memberCount} members</span>
              <Link className="button" to={`/cart/${c.token}`}>Open</Link>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
