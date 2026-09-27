import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { action, del, post, put, useApi } from '../api.js';
import { Confirm, ErrorBox, Field, Loading, Modal, StatutBadge } from './ui.jsx';
import Markdown from './Markdown.jsx';
import { ObservationForm } from '../pages/enfant/Matiere.jsx';
import { TYPES_EXERCICE, dateFr, formData } from '../util.js';

function ExerciceForm({ notion, exercice, onClose, onDone }) {
  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    if (exercice) await action(() => put(`/exercices/${exercice.id}`, d), 'Exercice modifié');
    else await action(() => post(`/notions/${notion.id}/exercices`, d), 'Exercice ajouté');
    onDone();
    onClose();
  };
  return (
    <Modal titre={exercice ? 'Modifier l’exercice' : 'Nouvel exercice'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grille-2">
          <Field label="Type">
            <select name="type" defaultValue={exercice?.type || 'Reponse courte'}>{TYPES_EXERCICE.map((t) => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Difficulté">
            <select name="difficulte" defaultValue={exercice?.difficulte || 'Standard'}>{['Facile', 'Standard', 'Renforcement'].map((t) => <option key={t}>{t}</option>)}</select>
          </Field>
        </div>
        <Field label="Énoncé"><textarea name="enonce" rows={3} required defaultValue={exercice?.enonce} /></Field>
        <Field label="Options (QCM)" aide="Séparées par « | », ex. a) soit | b) est | c) sois">
          <input name="options" defaultValue={exercice?.options?.join(' | ')} />
        </Field>
        <Field label="Réponse attendue" aide="Plusieurs variantes acceptées : séparez-les par « || »"><input name="reponse" required defaultValue={exercice?.reponse} /></Field>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

export function NotionForm({ notion, matieres, niveaux, onClose, onDone }) {
  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    if (notion) {
      await action(() => put(`/notions/${notion.id}`, d), 'Notion modifiée');
      onDone(notion.id);
    } else {
      const r = await action(() => post('/notions', d), 'Notion créée');
      onDone(r.id);
    }
    onClose();
  };
  return (
    <Modal titre={notion ? 'Modifier la notion' : 'Nouvelle notion (ajout du foyer)'} onClose={onClose} large>
      <form onSubmit={submit}>
        <div className="grille-2">
          {!notion && (
            <Field label="Matière">
              <select name="matiere_id" required>{matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select>
            </Field>
          )}
          <Field label="Niveau">
            <select name="niveau_code" defaultValue={notion?.niveau_code || ''}>
              <option value="">Tous niveaux</option>
              {niveaux.map((n) => <option key={n.id} value={n.code}>{n.libelle}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Titre"><input name="titre" required defaultValue={notion?.titre} /></Field>
        <div className="grille-2">
          <Field label="Domaine"><input name="domaine" defaultValue={notion?.domaine || ''} /></Field>
          <Field label="Sous-domaine"><input name="sous_domaine" defaultValue={notion?.sous_domaine || ''} /></Field>
        </div>
        <Field label="Objectif / attendu"><input name="libelle_officiel" defaultValue={notion?.libelle_officiel || ''} /></Field>
        <Field label="Fiche de cours (markdown)" aide="**gras**, *italique*, listes « - », tableaux « | a | b | »">
          <textarea name="cours_md" rows={10} defaultValue={notion?.cours_md || ''} />
        </Field>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

export default function NotionDetail({ notionId, enfant }) {
  const navigate = useNavigate();
  const { data: n, error, reload } = useApi(`/notions/${notionId}${enfant ? `?enfant_id=${enfant.id}` : ''}`);
  const niveaux = useApi('/niveaux').data || [];
  const [obs, setObs] = useState(false);
  const [exo, setExo] = useState(null);
  const [edit, setEdit] = useState(false);
  const [reponses, setReponses] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (!n) return <Loading />;
  const s = n.suivi;

  return (
    <div>
      <button className="btn btn-lien" onClick={() => navigate(-1)}>← Retour</button>
      <div className="titre-page">
        <div>
          <h2>{n.titre}</h2>
          <div className="muted small">
            <span className="point-couleur" style={{ background: n.matiere_couleur }} /> {n.matiere_nom}
            {n.niveau_code && ` · ${n.niveau_code}`}{n.domaine && ` · ${n.domaine}`}{n.sous_domaine && ` › ${n.sous_domaine}`}
            {n.modifiable ? ' · ajout du foyer' : n.source === 'demo' ? ' · démonstration' : ''}
          </div>
        </div>
        <div className="actions">
          {enfant && <button className="btn" onClick={() => setObs(true)}>Observer</button>}
          {enfant && n.exercices.length > 0 && <Link className="btn btn-primaire" to={`/enfants/${enfant.id}/session?mode=notion&notion=${n.id}`}>▶ Vérifier avec l’enfant</Link>}
          {n.modifiable && <button className="btn" onClick={() => setEdit(true)}>Modifier</button>}
          {n.modifiable && <Confirm message="Supprimer cette notion et tout son historique ?" onConfirm={() => action(() => del(`/notions/${n.id}`), 'Notion supprimée').then(() => navigate(-1))}>Supprimer</Confirm>}
        </div>
      </div>

      {s && (
        <section className="carte suivi-notion">
          <div><span className="muted small">Statut</span><br /><StatutBadge statut={s.statut} /></div>
          <div><span className="muted small">Boîte Leitner</span><br /><strong>{s.boite ? `Boîte ${s.boite}` : 'Non inscrite'}</strong></div>
          <div><span className="muted small">Dernière vérification</span><br /><strong>{dateFr(s.derniere_verif || s.date)}</strong></div>
          <div><span className="muted small">Prochaine réactivation</span><br /><strong>{s.prochaine_echeance ? dateFr(s.prochaine_echeance) : '—'}</strong></div>
          <div className="actions">
            {n.exercices.length > 0 && (
              s.boite
                ? <button className="btn btn-petit btn-lien" onClick={() => action(() => post(`/enfants/${enfant.id}/planification/${n.id}`, { retirer: true }), 'Retirée des révisions').then(reload)}>Retirer des révisions</button>
                : <button className="btn btn-petit" onClick={() => action(() => post(`/enfants/${enfant.id}/planification/${n.id}`, {}), 'Ajoutée aux révisions du jour').then(reload)}>Ajouter aux révisions</button>
            )}
          </div>
        </section>
      )}

      <div className="grille-2">
        <section className="carte">
          <h3>📘 Fiche de cours</h3>
          {n.libelle_officiel && <p className="attendu"><strong>Attendu :</strong> {n.libelle_officiel}</p>}
          <Markdown source={n.cours_md} />
          {(n.source_bo || n.millesime) && <p className="small muted">Source : {n.source_bo || '—'}{n.millesime && ` · programme ${n.millesime}`}{n.en_vigueur_depuis && ` · en vigueur depuis ${n.en_vigueur_depuis}`}</p>}
          {n.remplace_par && <p className="small alert alert-info">Remplacement prévu : {n.remplace_par}</p>}
        </section>
        <section className="carte">
          <div className="carte-titre">
            <h3>✏️ Exercices ({n.exercices.length})</h3>
            <div className="actions">
              <button className="btn btn-petit btn-lien" onClick={() => setReponses(!reponses)}>{reponses ? 'Masquer' : 'Voir'} les réponses</button>
              {n.modifiable && <button className="btn btn-petit" onClick={() => setExo({})}>+ Exercice</button>}
            </div>
          </div>
          {!n.exercices.length && <p className="muted">Aucun exercice pour cette notion.</p>}
          <ol className="liste-exercices">
            {n.exercices.map((e) => (
              <li key={e.id}>
                <div><span className="tag">{e.type}</span> <span className="tag tag-clair">{e.difficulte}</span></div>
                <div>{e.enonce}</div>
                {e.options.length > 0 && <div className="small muted">{e.options.join(' · ')}</div>}
                {reponses && <div className="small">✔ <strong>{e.reponse}</strong></div>}
                {n.modifiable && (
                  <div className="actions">
                    <button className="btn btn-lien btn-petit" onClick={() => setExo(e)}>Modifier</button>
                    <Confirm message="Supprimer cet exercice ?" onConfirm={() => action(() => del(`/exercices/${e.id}`)).then(reload)}>Supprimer</Confirm>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {s && (
        <div className="grille-2">
          <section className="carte">
            <h3>Historique des observations</h3>
            {s.observations.length ? (
              <ul className="liste-simple">
                {s.observations.map((o) => (
                  <li key={o.id}>
                    {dateFr(o.date)} <StatutBadge statut={o.statut} /> <span className="small muted">{o.adulte_nom}</span>
                    {o.commentaire && <div className="small">{o.commentaire}</div>}
                    <Confirm message="Supprimer cette observation ?" onConfirm={() => action(() => del(`/observations/${o.id}`)).then(reload)}>✕</Confirm>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Aucune observation.</p>}
          </section>
          <section className="carte">
            <h3>Historique des tests</h3>
            {s.tentatives.length ? (
              <table className="table">
                <tbody>
                  {s.tentatives.map((t) => (
                    <tr key={t.id}>
                      <td className="small">{new Date(t.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{t.reussite ? '✅' : '❌'} <span className="small">{t.reponse_donnee}</span>{t.corrigee_parent ? <span className="small muted"> (validée par un parent)</span> : ''}</td>
                      <td className="small muted">{t.compte_leitner ? `B${t.boite_avant ?? '–'} → B${t.boite_apres}` : 'entraînement'}</td>
                      <td>{!t.reussite && <button className="btn btn-lien btn-petit" title="Compter comme juste (faute de frappe, variante acceptable…)" onClick={() => action(() => post(`/tentatives/${t.id}/valider`), 'Réponse validée').then(reload)}>Valider</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">Aucun test passé.</p>}
          </section>
        </div>
      )}

      {obs && <ObservationForm enfant={enfant} notionIds={[n.id]} titre={`Observer « ${n.titre} »`} onClose={() => setObs(false)} onDone={reload} />}
      {exo && <ExerciceForm notion={n} exercice={exo.id ? exo : null} onClose={() => setExo(null)} onDone={reload} />}
      {edit && <NotionForm notion={n} matieres={[]} niveaux={niveaux} onClose={() => setEdit(false)} onDone={reload} />}
    </div>
  );
}
