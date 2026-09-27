import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { NotionForm } from '../components/NotionDetail.jsx';

export default function Referentiel() {
  const navigate = useNavigate();
  const matieres = useApi('/matieres').data || [];
  const niveaux = useApi('/niveaux').data || [];
  const stats = useApi('/referentiel/stats').data;
  const [f, setF] = useState({ matiere_id: '', niveau: '', q: '' });
  const [creer, setCreer] = useState(false);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error, loading } = useApi(`/notions${qs ? `?${qs}` : ''}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div>
      <div className="titre-page">
        <h1>Référentiel</h1>
        <button className="btn" onClick={() => setCreer(true)}>+ Notion du foyer</button>
      </div>
      {stats && (
        <p className="muted small">
          Socle officiel : <strong>{stats.total.notions}</strong> notions, <strong>{stats.total.exercices}</strong> exercices.
          {stats.total.demo > 0 && <> Contenu de <strong>démonstration</strong> — lancez la synchronisation Notion dans <Link to="/parametres/referentiel">Paramètres › Référentiel</Link> pour importer le référentiel complet.</>}
        </p>
      )}
      <div className="filtres">
        <select value={f.matiere_id} onChange={set('matiere_id')} aria-label="Matière">
          <option value="">Toutes les matières</option>
          {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.nb_notions})</option>)}
        </select>
        <select value={f.niveau} onChange={set('niveau')} aria-label="Niveau">
          <option value="">Tous niveaux</option>
          {niveaux.map((n) => <option key={n.id} value={n.code}>{n.libelle}</option>)}
        </select>
        <input type="search" placeholder="Rechercher une notion…" value={f.q} onChange={set('q')} />
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : (
        <div className="carte">
          {!data?.length && <p className="muted">Aucune notion ne correspond.</p>}
          <table className="table table-notions">
            <tbody>
              {data?.map((n) => (
                <tr key={n.id} onClick={() => navigate(`/referentiel/notions/${n.id}`)} className="cliquable">
                  <td><span className="point-couleur" style={{ background: n.matiere_couleur }} /> {n.matiere_nom}</td>
                  <td>{n.niveau_code || '—'}</td>
                  <td><strong>{n.titre}</strong><div className="small muted">{[n.domaine, n.sous_domaine].filter(Boolean).join(' › ')}</div></td>
                  <td className="small muted">{n.a_cours ? '📘' : ''} {n.nb_exercices ? `✏️ ${n.nb_exercices}` : ''}</td>
                  <td className="small muted">{n.foyer_id ? 'foyer' : n.source === 'demo' ? 'démo' : n.millesime || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creer && <NotionForm matieres={matieres} niveaux={niveaux} onClose={() => setCreer(false)} onDone={(id) => navigate(`/referentiel/notions/${id}`)} />}
    </div>
  );
}
