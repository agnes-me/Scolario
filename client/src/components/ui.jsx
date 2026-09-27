import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { STATUTS } from '../util.js';

export function Loading() {
  return <div className="loading">Chargement…</div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert alert-erreur">{error.message || String(error)}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Modal({ titre, onClose, children, large }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-fond" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${large ? 'modal-large' : ''}`} role="dialog" aria-modal="true" aria-label={titre}>
        <div className="modal-tete">
          <h3>{titre}</h3>
          <button className="btn-icone" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-corps">{children}</div>
      </div>
    </div>
  );
}

export function StatutBadge({ statut }) {
  const s = STATUTS[statut] || STATUTS.non_vu;
  return <span className="badge" style={{ background: s.couleur }}>{s.label}</span>;
}

export function Jauge({ jauge, compact }) {
  if (!jauge || !jauge.total) return <span className="muted small">Aucune notion au référentiel pour ce niveau</span>;
  const seg = (k) => `${(100 * jauge[k]) / jauge.total}%`;
  return (
    <div className="jauge-bloc">
      <div className="jauge" title={`${jauge.acquis} acquis, ${jauge.en_cours} en cours, ${jauge.a_consolider} à consolider, ${jauge.non_vu} non vus`}>
        <span style={{ width: seg('acquis'), background: 'var(--vert)' }} />
        <span style={{ width: seg('en_cours'), background: 'var(--bleu)' }} />
        <span style={{ width: seg('a_consolider'), background: 'var(--orange)' }} />
      </div>
      {!compact && (
        <div className="small muted">
          {jauge.acquis}/{jauge.total} acquises · {jauge.en_cours} en cours{jauge.a_consolider ? ` · ${jauge.a_consolider} à consolider` : ''}
        </div>
      )}
    </div>
  );
}

export function Progress({ value, couleur = 'var(--primaire)' }) {
  return (
    <div className="progress"><span style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: couleur }} /></div>
  );
}

export function Tabs({ items }) {
  return (
    <nav className="tabs">
      {items.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'tab actif' : 'tab')}>
          {t.label}{t.badge ? <span className="pastille">{t.badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}

export function Field({ label, children, aide }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {aide && <span className="field-aide">{aide}</span>}
    </label>
  );
}

export function Confirm({ message, onConfirm, children, className = 'btn btn-lien danger' }) {
  return (
    <button type="button" className={className} onClick={() => window.confirm(message) && onConfirm()}>
      {children}
    </button>
  );
}
