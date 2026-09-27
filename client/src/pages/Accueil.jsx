import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post, useApi, action } from '../api.js';
import { useAuth } from '../App.jsx';
import { Empty, ErrorBox, Loading, Progress } from '../components/ui.jsx';
import { age, dateFr, periodiciteLabel } from '../util.js';

function CarteEnfant({ e }) {
  const r = e.prochaine_recompense;
  return (
    <Link to={`/enfants/${e.id}`} className="carte carte-enfant" style={{ borderTopColor: e.couleur || 'var(--primaire)' }}>
      <div className="carte-enfant-tete">
        <div className="avatar" style={{ background: e.couleur || 'var(--primaire)' }}>{e.prenom[0]}</div>
        <div>
          <h3>{e.prenom}</h3>
          <div className="muted small">{e.niveau_libelle || 'Niveau non défini'}{e.date_naissance ? ` · ${age(e.date_naissance)} ans` : ''}</div>
        </div>
        <div className="solde" title="Solde de points">{e.solde_points >= 0 ? '⭐' : '⚠️'} {e.solde_points}</div>
      </div>
      <div className="indicateurs">
        <span className={e.revisions_dues ? 'ind ind-bleu' : 'ind'}>🔁 {e.revisions_dues} révision{e.revisions_dues > 1 ? 's' : ''} du jour</span>
        {e.alertes > 0 && <span className="ind ind-orange">⚠️ {e.alertes} alerte{e.alertes > 1 ? 's' : ''}</span>}
        {e.recompenses_a_valider > 0 && <span className="ind ind-vert">🎁 {e.recompenses_a_valider} à valider</span>}
      </div>
      {r && (
        <div className="prochaine-recompense">
          <div className="small">Palier {periodiciteLabel[r.periodicite]} : <strong>{r.points}/{r.seuil}</strong> pts — fin le {dateFr(r.periode_fin, { day: 'numeric', month: 'short' })}</div>
          <Progress value={r.progression} couleur={r.atteint ? 'var(--vert)' : 'var(--primaire)'} />
          {r.recompense && <div className="small muted">🎁 {r.recompense}</div>}
        </div>
      )}
    </Link>
  );
}

function Frise() {
  const { data } = useApi('/comparatif');
  const niveaux = useApi('/niveaux').data;
  if (!data || !niveaux) return null;
  const annees = [...new Set(data.flatMap((e) => e.annees.map((a) => a.annee)))].sort();
  if (!annees.length) return null;
  return (
    <section className="carte">
      <h3>Frise des niveaux</h3>
      <div className="table-wrap">
        <table className="table frise">
          <thead><tr><th />{annees.map((a) => <th key={a}>{a}</th>)}</tr></thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <th><span className="point-couleur" style={{ background: e.couleur || 'var(--primaire)' }} /> {e.prenom}</th>
                {annees.map((a) => <td key={a}>{e.annees.find((x) => x.annee === a)?.niveau_code || ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Accueil() {
  const { status } = useAuth();
  const [archives, setArchives] = useState(false);
  const { data, error, loading, reload } = useApi(`/enfants${archives ? '?archives=1' : ''}`);

  return (
    <div>
      <div className="titre-page">
        <h1>{archives ? 'Enfants archivés' : 'Les enfants'}</h1>
        <div className="actions">
          <button className="btn btn-lien" onClick={() => setArchives(!archives)}>{archives ? '← Enfants actifs' : 'Voir les archivés'}</button>
          {!archives && <Link className="btn btn-primaire" to="/enfants/nouveau">+ Ajouter un enfant</Link>}
        </div>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data?.length ? (
        <div className="grille-cartes">
          {data.map((e) => archives ? (
            <div key={e.id} className="carte">
              <h3>{e.prenom}</h3>
              <p className="muted">{e.niveau_libelle}</p>
              <button className="btn" onClick={() => action(() => post(`/enfants/${e.id}/archive`, { archive: false }), 'Enfant réactivé').then(reload)}>Réactiver</button>
            </div>
          ) : <CarteEnfant key={e.id} e={e} />)}
        </div>
      ) : (
        <Empty>
          {archives ? 'Aucun enfant archivé.' : <>Aucun enfant pour l’instant. <Link to="/enfants/nouveau">Ajoutez le premier</Link> pour commencer le suivi.</>}
        </Empty>
      )}
      {!archives && status.foyer?.options?.vue_comparative && data?.length > 1 && <Frise />}
    </div>
  );
}
