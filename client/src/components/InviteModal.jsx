/** Invite link, QR code, share sheet, WhatsApp and copy (FR-INV-01..04, WIREFRAME §3.6). */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const SHARE_TEXT = 'Add your items to our cart';

export default function InviteModal({ token, memberCount, maxMembers, onClose }) {
  const [invite, setInvite] = useState(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = invite?.url ?? `${window.location.origin}/join/${token}`;

  useEffect(() => {
    api.invite(token).then(setInvite).catch(() => setQrFailed(true));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [token, onClose]);

  const copy = async () => {
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const share = () => navigator.share({ title: 'Join my Sync Cart', text: SHARE_TEXT, url }).catch(() => {});

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h2>Invite people</h2><button className="icon" aria-label="Close" onClick={onClose}>×</button></div>
        {qrFailed && <p className="muted center">QR unavailable — share the link</p>}
        {!qrFailed && (invite ? <img className="qr" src={invite.qrDataUrl} alt="Invite QR code" /> : <div className="qr skeleton" />)}
        {!qrFailed && <p className="muted center small">Scan with your phone camera</p>}
        <div className="row">
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
          <button onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        {navigator.share && <button className="primary" onClick={share}>Invite via contacts</button>}
        <a className="button" href={`https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`} target="_blank" rel="noreferrer">
          Share on WhatsApp
        </a>
        <p className="muted small">{memberCount} of {maxMembers} joined</p>
      </div>
    </div>
  );
}
