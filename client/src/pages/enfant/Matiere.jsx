import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { action, del, post, useApi } from '../../api.js';
import { Confirm, ErrorBox, Field, Jauge, Loading, Modal, StatutBadge } from '../../components/ui.jsx';
import LineChart from '../../components/LineChart.jsx';
import { STATUTS, aujourdhui, dateFr, formData } from '../../util.js';

export function ObservationForm({ enfant, notionIds, onClose, onDone, titre }) {
  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    await action(() => post(`/enfants/${enfant.id}/observations`, { ...d, notion_ids: notionIds }), 'Observation enregistrée');
    onDone?.();
    onClose();
  };
  return (
    <Modal titre={titre || (notionIds.length > 1 ? `Observer ${notionIds.length} notions` : 'Nouvelle observation')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Statut constaté">
          <div className="choix-statut">
            {Object.entries(STATUTS).map(([k, s]) => (
              <label key={k} className="radio-statut" style={{ '--c': s.couleur }}>
                <input type="radio" name="statut" value={k} required defaultChecked={k === 'acquis'} /> {s.label}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Date"><input type="date" name="date" defaultValue={aujourdhui()} /></Field>
        <Field label="Commentaire"><textarea name="commentaire" rows={3} placeholder="Contexte, difficultés, points forts…" /></Field>
        <p className="small muted">L’observation s’ajoute à l’historique (rien n’est écrasé). Une notion jugée « acquise » entre en réactivation espacée pour vérifier qu’elle n’est pas oubliée.</p>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

function NoteForm({ enfant, matiere, onClose, onDone }) {
  const submit = async (e) => {
    e.preventDefault();
    await action(() => post(`/enfants/${enfant.id}/notes`, { ...formData(e), matiere_id: matiere.id }), 'Note ajoutée');
    onDone();
    onClose();
  };
  return (
    <Modal titre={`Nouvelle évaluation — ${matiere.nom}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Intitulé"><input name="intitule" required placeholder="Contrôle sur les fractions" /></Field>
        <div className="grille-3">
          <Field label="Note"><input name="note" type="number" step="0.25" /></Field>
          <Field label="Sur"><input name="note_max" type="number" step="1" defaultValue={20} /></Field>
          <Field label="Date"><input name="date" type="date" defaultValue={aujourdhui()} /></Field>
        </div>
        <Field label="Appréciation"><textarea name="appreciation" rows={2} /></Field>
        <div className="actions"><button className="btn btn-primaire">Ajouter</button></div>
      </form>
    </Modal>
  );
}

export default function Matiere({ enfant }) {
  const { mid } = useParams();
  const [niveau, setNiveau] = useState('');
  const { data, error, reload } = useApi(`/enfants/${enfant.id}/matieres/${mid}${niveau ? `?niveau=${encodeURIComponent(niveau)}` : ''}`);
  const [selection, setSelection] = useState([]);
  const [obs, setObs] = useState(null);
  const [note, setNote] = useState(false);
  const [filtre, setFiltre] = useState('');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const base = `/enfants/${enfant.id}`;
  const notions = data.notions.filter((n) => !filtre || n.suivi.statut === filtre);
  const groupes = [];
  for (const n of notions) {
    const g = [data.niveau ? null : n.niveau_code, n.domaine, n.sous_domaine].filter(Boolean).join(' › ') || 'Général';
    if (groupes.at(-1)?.titre !== g) groupes.push({ titre: g, notions: [] });
    groupes.at(-1).notions.push(n);
  }
  const toggle = (id) => setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const testables = data.notions.some((n) => n.nb_exercices > 0 && n.suivi.statut !== 'acquis');

  return (
    <div>
      <div className="titre-page">
        <h2><span className="point-couleur" style={{ background: data.matiere.couleur }} /> {data.matiere.nom}</h2>
        <div className="actions">
          <select value={niveau || data.niveau || 'tous'} onChange={(e) => setNiveau(e.target.value)} aria-label="Niveau">
            {data.niveaux_disponibles.map((n) => <option key={n} value={n}>{n}{n === enfant.niveau_code ? ' (actuel)' : ''}</option>)}
            {enfant.niveau_code && !data.niveaux_disponibles.includes(enfant.niveau_code) && <option value={enfant.niveau_code}>{enfant.niveau_code} (actuel)</option>}
            <option value="tous">Tous niveaux</option>
          </select>
          {testables && <Link className="btn btn-primaire" to={`${base}/session?mode=matiere&matiere=${data.matiere.id}`}>▶ Vérifier les notions non acquises</Link>}
        </div>
      </div>

      <div className="grille-2">
        <section className="carte">
          <h3>Avancement {data.niveau ? `(${data.niveau})` : '(tous niveaux)'}</h3>
          <Jauge jauge={data.jauge} />
        </section>
        <section className="carte">
          <h3>Progression dans le temps</h3>
          <LineChart points={data.progression.map((p) => ({ x: p.mois, y: p.acquis }))} height={150} unite="notions acquises"
            labelX={(m) => new Date(`${m}-01`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })} />
        </section>
      </div>

      <section className="carte">
        <div className="carte-titre">
          <h3>Notions du référentiel ({notions.length})</h3>
          <div className="actions">
            <select value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer par statut">
              <option value="">Tous statuts</option>
              {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            {selection.length > 0 && <button className="btn" onClick={() => setObs(selection)}>Observer la sélection ({selection.length})</button>}
          </div>
        </div>
        {!data.notions.length && <p className="muted">Aucune notion pour ce niveau. Le référentiel se remplit via la synchronisation Notion (Paramètres › Référentiel), ou vous pouvez ajouter vos propres notions depuis le menu Référentiel.</p>}
        {groupes.map((g) => (
          <div key={g.titre} className="groupe-notions">
            <h4>{g.titre}</h4>
            {g.notions.map((n) => (
              <div key={n.id} className="ligne-notion">
                <input type="checkbox" checked={selection.includes(n.id)} onChange={() => toggle(n.id)} aria-label={`Sélectionner ${n.titre}`} />
                <Link to={`${base}/notions/${n.id}`} className="ligne-notion-titre">
                  <strong>{n.titre}</strong>
                  {n.libelle_officiel && <span className="small muted">{n.libelle_officiel}</span>}
                </Link>
                <span className="ligne-notion-meta small muted">
                  {n.suivi.boite ? `📦 B${n.suivi.boite}` : ''} {n.suivi.date ? dateFr(n.suivi.date, { day: 'numeric', month: 'short' }) : ''}
                </span>
                <StatutBadge statut={n.suivi.statut} />
                <button className="btn btn-petit" onClick={() => setObs([n.id])}>Observer</button>
                {n.nb_exercices > 0 && <Link className="btn btn-petit" to={`${base}/session?mode=notion&notion=${n.id}`}>Vérifier</Link>}
              </div>
            ))}
          </div>
        ))}
      </section>

      <div className="grille-2">
        <section className="carte">
          <div className="carte-titre">
            <h3>Évaluations</h3>
            <button className="btn btn-petit" onClick={() => setNote(true)}>+ Ajouter</button>
          </div>
          {data.notes.length ? (
            <table className="table">
              <tbody>
                {data.notes.map((n) => (
                  <tr key={n.id}>
                    <td>{dateFr(n.date)}</td><td>{n.intitule}{n.appreciation && <div className="small muted">{n.appreciation}</div>}</td>
                    <td><strong>{n.note ?? '—'}</strong>/{n.note_max}</td>
                    <td><Confirm message="Supprimer cette évaluation ?" onConfirm={() => action(() => del(`/notes/${n.id}`)).then(reload)}>✕</Confirm></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Aucune évaluation saisie.</p>}
        </section>
        <section className="carte">
          <h3>Dernières observations</h3>
          {data.dernieres_observations.length ? (
            <ul className="liste-simple">
              {data.dernieres_observations.map((o) => <li key={o.id}>{dateFr(o.date)} — {o.titre} : <StatutBadge statut={o.statut} />{o.commentaire && <div className="small muted">{o.commentaire}</div>}</li>)}
            </ul>
          ) : <p className="muted">Aucune observation.</p>}
        </section>
      </div>

      {obs && <ObservationForm enfant={enfant} notionIds={obs} onClose={() => setObs(null)} onDone={() => { setSelection([]); reload(); }} />}
      {note && <NoteForm enfant={enfant} matiere={data.matiere} onClose={() => setNote(false)} onDone={reload} />}
    </div>
  );
}
