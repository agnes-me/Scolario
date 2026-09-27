import { useState } from 'react';
import { action, del, post, put, useApi } from '../../api.js';
import { Confirm, ErrorBox, Field, Loading, Modal } from '../../components/ui.jsx';
import { STATUTS_ELEMENT, TYPES_ELEMENT, dateFr, formData } from '../../util.js';

function FormElement({ enfant, element, annees, onClose, onDone }) {
  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    if (element) await action(() => put(`/elements/${element.id}`, d), 'Élément modifié');
    else await action(() => post(`/enfants/${enfant.id}/elements`, d), 'Élément ajouté');
    onDone();
    onClose();
  };
  return (
    <Modal titre={element ? 'Modifier' : 'Ajouter un livre, une récitation, un projet…'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grille-2">
          <Field label="Type">
            <select name="type" defaultValue={element?.type || 'livre'}>{Object.entries(TYPES_ELEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Matière (facultatif)">
            <select name="matiere_id" defaultValue={element?.matiere_id || ''}><option value="">—</option>{enfant.matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select>
          </Field>
        </div>
        <Field label="Titre"><input name="titre" required defaultValue={element?.titre} placeholder="Le Petit Prince, Le Corbeau et le Renard…" /></Field>
        <Field label="Description / consignes de l’enseignant"><textarea name="description" rows={3} defaultValue={element?.description || ''} /></Field>
        <div className="grille-3">
          <Field label="Statut">
            <select name="statut" defaultValue={element?.statut || 'a_faire'}>{Object.entries(STATUTS_ELEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Échéance"><input name="echeance" type="date" defaultValue={element?.echeance || ''} /></Field>
          <Field label="Année scolaire">
            <select name="annee" defaultValue={element?.annee || annees[0]}>{annees.map((a) => <option key={a}>{a}</option>)}</select>
          </Field>
        </div>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

export default function Elements({ enfant }) {
  const { data, error, reload } = useApi(`/enfants/${enfant.id}/elements`);
  const [form, setForm] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const annees = enfant.annees.map((a) => a.annee);
  if (!annees.length) annees.push(new Date().getMonth() >= 7 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`);
  const parAnnee = {};
  for (const el of data) (parAnnee[el.annee] ||= []).push(el);
  const changerStatut = (el, statut) => action(() => put(`/elements/${el.id}`, { statut })).then(reload);

  return (
    <div>
      <div className="titre-page">
        <h2>Livres, récitations, projets, stages</h2>
        <button className="btn btn-primaire" onClick={() => setForm({})}>+ Ajouter</button>
      </div>
      <p className="muted small">Éléments donnés par l’enseignant, en plus du programme officiel. Chacun a son propre statut.</p>
      {!data.length && <p className="empty">Rien pour l’instant.</p>}
      {Object.entries(parAnnee).map(([annee, els]) => (
        <section key={annee} className="carte">
          <h3>{annee}</h3>
          <div className="liste-elements">
            {els.map((el) => (
              <div key={el.id} className={`element statut-${el.statut}`}>
                <div className="element-type">{TYPES_ELEMENT[el.type]}</div>
                <div className="element-corps">
                  <strong>{el.titre}</strong>
                  {el.description && <div className="small muted">{el.description}</div>}
                  <div className="small muted">
                    {el.echeance && `Échéance : ${dateFr(el.echeance)}`}{el.date_fait && ` · fait le ${dateFr(el.date_fait)}`}
                    {el.matiere_id && ` · ${enfant.matieres.find((m) => m.id === el.matiere_id)?.nom || ''}`}
                  </div>
                </div>
                <select value={el.statut} onChange={(e) => changerStatut(el, e.target.value)} aria-label="Statut">
                  {Object.entries(STATUTS_ELEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button className="btn btn-lien btn-petit" onClick={() => setForm(el)}>Modifier</button>
                <Confirm message="Supprimer cet élément ?" onConfirm={() => action(() => del(`/elements/${el.id}`)).then(reload)}>✕</Confirm>
              </div>
            ))}
          </div>
        </section>
      ))}
      {form && <FormElement enfant={enfant} element={form.id ? form : null} annees={annees} onClose={() => setForm(null)} onDone={reload} />}
    </div>
  );
}
