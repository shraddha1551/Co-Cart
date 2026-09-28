/** Invitation screen: preview the cart, pick a name, join (FR-UI-03, WIREFRAME §3.2). */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { identity } from '../lib/identity';

const PROBLEMS = {
  SESSION_NOT_FOUND: ['😕 Cart not found', 'Check the link and retry.'],
  SESSION_FULL: ['🚫 This cart is full (10/10)', 'Ask the host to start a new one.'],
  SESSION_CLOSED: ['🔒 This cart is closed', 'It was checked out or expired.'],
};

export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const joined = Boolean(identity.get(token));

  useEffect(() => {
    if (joined) return;
    api.preview(token).then((p) => {
      setPreview(p);
      if (p.status !== 'open') setProblem('SESSION_CLOSED');
      else if (p.memberCount >= p.maxMembers) setProblem('SESSION_FULL');
    }).catch((e) => setProblem(PROBLEMS[e.code] ? e.code : 'SESSION_NOT_FOUND'));
  }, [token, joined]);

  if (joined) return <Navigate to={`/cart/${token}`} replace />;

  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.join(token, name.trim());
      identity.set(token, res.memberToken);
      navigate(`/cart/${token}`, { replace: true });
    } catch (err) {
      if (PROBLEMS[err.code]) setProblem(err.code);
      else setError(err.code === 'NAME_TAKEN' ? `Someone here is already called ${name.trim()}` : err.message);
      setBusy(false);
    }
  };

  return (
    <main className="narrow">
      <Link to="/">← Home</Link>
      {problem ? (
        <div className="card stack">
          <h2>{PROBLEMS[problem][0]}</h2>
          <p className="muted">{PROBLEMS[problem][1]}</p>
          <Link className="button" to="/">Go home</Link>
        </div>
      ) : (
        <>
          <div className="center">
            <p className="muted">You&apos;re invited to</p>
            <h1>{preview ? `${preview.hostName}'s cart` : '…'}</h1>
            {preview && <p className="muted">{preview.memberCount} of {preview.maxMembers} people · open</p>}
          </div>
          <form onSubmit={join} className="stack">
            <label htmlFor="name">Your name</label>
            <input id="name" value={name} maxLength={30} autoFocus className={error ? 'invalid' : ''}
              onChange={(e) => { setName(e.target.value); setError(''); }} />
            {error ? <p className="error">{error}</p> : <p className="muted small">Names must be unique in this cart.</p>}
            <button className="primary" disabled={busy || !preview || !name.trim()}>{busy ? 'Joining…' : 'Join cart'}</button>
          </form>
        </>
      )}
    </main>
  );
}
