import { useState } from 'react';
import { Link } from 'react-router-dom';
import { action, post, useApi } from '../../api.js';
import { ErrorBox, Jauge, Loading, Progress } from '../../components/ui.jsx';
import { STATUTS_ELEMENT, TYPES_ELEMENT, dateFr, periodiciteLabel } from '../../util.js';
import { AjoutPoint } from './Points.jsx';

export default function Synthese({ enfant }) {
  const { data, error, reload } = useApi(`/enfants/${enfant.id}/synthese`);
  const [ajoutPoint, setAjoutPoint] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const base = `/enfants/${enfant.id}`;
  const typeLabel = { coeur: 'Suivi détaillé', allegee: 'Suivi allégé', optionnelle: 'Option', musique: 'Musique', libre: 'Matière libre' };

  return (
    <div className="grille-synthese">
      <section className="carte colonne-large">
        <div className="carte-titre">
          <h2>Matières</h2>
          <Link to={`${base}/reglages`} className="btn btn-lien">Gérer les matières</Link>
        </div>
        {data.matieres.length === 0 && <p className="muted">Aucune matière active. Activez-en dans les réglages.</p>}
        <div className="liste-matieres">
          {data.matieres.map((m) => (
            <Link key={m.id} to={`${base}/matieres/${m.id}`} className="ligne-matiere">
              <span className="point-couleur" style={{ background: m.couleur }} />
              <div className="ligne-matiere-nom">
                <strong>{m.nom}</strong>
                <span className="small muted">{typeLabel[m.type]}</span>
              </div>
              <div className="ligne-matiere-jauge"><Jauge jauge={m.jauge} /></div>
              {m.derniere_note && <span className="small muted note-recente" title={m.derniere_note.intitule}>{m.derniere_note.note}/{m.derniere_note.note_max}</span>}
            </Link>
          ))}
        </div>
      </section>

      <section className="carte">
        <div className="carte-titre">
          <h2>Points</h2>
          <Link to={`${base}/points`} className="btn btn-lien">Historique</Link>
        </div>
        <div className="gros-chiffre">{data.solde_points >= 0 ? '⭐' : '⚠️'} {data.solde_points}</div>
        <div className="muted small centre">solde total · {data.points_semaine >= 0 ? '+' : ''}{data.points_semaine} sur 7 jours</div>
        <div className="boutons-points">
          <button className="btn btn-vert" onClick={() => setAjoutPoint(1)}>+ Bon point</button>
          <button className="btn btn-rouge" onClick={() => setAjoutPoint(-1)}>− Mauvais point</button>
        </div>
        {data.regles.map((r) => (
          <div key={r.id} className="regle-mini">
            <div className="small"><strong>{r.libelle}</strong>{r.libelle.includes(periodiciteLabel[r.periodicite]) ? '' : ` (${periodiciteLabel[r.periodicite]})`} : {r.points}/{r.seuil} — jusqu’au {dateFr(r.periode_fin, { day: 'numeric', month: 'short' })}</div>
            <Progress value={r.progression} couleur={r.atteint ? 'var(--vert)' : 'var(--primaire)'} />
            {r.recompense && <div className="small muted">🎁 {r.recompense}</div>}
          </div>
        ))}
        {data.recompenses_a_valider.map((ro) => (
          <div key={ro.id} className="alert alert-info">
            <div><strong>{ro.libelle}</strong> — période du {dateFr(ro.periode_debut)} au {dateFr(ro.periode_fin)} : {ro.points}/{ro.seuil} pts, {ro.atteint ? 'seuil atteint 🎉' : 'seuil non atteint'}.</div>
            <div className="actions">
              <button className="btn btn-vert btn-petit" onClick={() => action(() => post(`/recompenses/${ro.id}/valider`, { statut: 'obtenue' }), 'Récompense accordée').then(reload)}>Accorder {ro.recompense ? `« ${ro.recompense} »` : ''}</button>
              <button className="btn btn-petit" onClick={() => action(() => post(`/recompenses/${ro.id}/valider`, { statut: 'non_obtenue' }), 'Enregistré').then(reload)}>Non obtenue</button>
            </div>
          </div>
        ))}
      </section>

      <section className="carte">
        <div className="carte-titre">
          <h2>Révisions</h2>
          <Link to={`${base}/revisions`} className="btn btn-lien">Détail</Link>
        </div>
        {data.alertes.map((a) => (
          <div key={a.id} className="alert alert-orange">
            {a.message}
            <div className="actions">
              {a.notion_id && <Link className="btn btn-petit" to={`${base}/notions/${a.notion_id}`}>Revoir la notion</Link>}
              <button className="btn btn-petit btn-lien" onClick={() => action(() => post(`/alertes/${a.id}/lue`)).then(reload)}>Marquer comme vue</button>
            </div>
          </div>
        ))}
        {data.revisions_dues.length ? (
          <>
            <p><strong>{data.revisions_dues.length}</strong> notion(s) à réactiver aujourd’hui.</p>
            <ul className="liste-simple">
              {data.revisions_dues.slice(0, 6).map((n) => <li key={n.notion_id}><span className="point-couleur" style={{ background: n.matiere_couleur }} /> {n.titre} <span className="muted small">boîte {n.boite}</span></li>)}
            </ul>
            <Link className="btn btn-primaire btn-bloc" to={`${base}/session?mode=revisions`}>▶ Lancer les révisions avec l’enfant</Link>
          </>
        ) : <p className="muted">Rien à réviser aujourd’hui. 👍</p>}
        {data.leitner.length > 0 && (
          <div className="leitner-mini">
            {data.leitner.map((b) => <span key={b.boite} className="boite-mini" title={`Boîte ${b.boite}`}>B{b.boite}<strong>{b.nb}</strong></span>)}
          </div>
        )}
      </section>

      <section className="carte">
        <div className="carte-titre">
          <h2>À faire cette année</h2>
          <Link to={`${base}/elements`} className="btn btn-lien">Tout voir</Link>
        </div>
        {data.elements_en_cours.length ? (
          <ul className="liste-simple">
            {data.elements_en_cours.map((el) => (
              <li key={el.id}>{TYPES_ELEMENT[el.type]?.split(' ')[0]} {el.titre} <span className="muted small">— {STATUTS_ELEMENT[el.statut]}{el.echeance ? `, pour le ${dateFr(el.echeance, { day: 'numeric', month: 'short' })}` : ''}</span></li>
            ))}
          </ul>
        ) : <p className="muted">Aucun livre, récitation ou projet en attente.</p>}
        {data.derniere_fluence && (
          <p className="small">📖 Dernière fluence : <strong>{data.derniere_fluence.mots_par_minute} mots/min</strong> ({dateFr(data.derniere_fluence.date)})</p>
        )}
      </section>

      {ajoutPoint && <AjoutPoint enfant={enfant} sens={ajoutPoint} onClose={() => setAjoutPoint(null)} onDone={reload} />}
    </div>
  );
}
