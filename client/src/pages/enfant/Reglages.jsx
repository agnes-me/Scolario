import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { action, del, get, post, put, useApi } from '../../api.js';
import { Field, Modal } from '../../components/ui.jsx';
import { ChampsEnfant } from '../NouvelEnfant.jsx';
import { formData } from '../../util.js';

const GROUPES = [
  ['coeur', 'Matières cœur de cible (suivi détaillé)'],
  ['allegee', 'Suivi allégé (attendus du programme)'],
  ['optionnelle', 'Options (langues vivantes, langues anciennes)'],
  ['musique', 'Musique'],
  ['libre', 'Matières libres du foyer'],
];

function Passage({ enfant, niveaux, onClose, onDone }) {
  const [prop, setProp] = useState(null);
  useEffect(() => { get(`/enfants/${enfant.id}/passage`).then(setProp); }, [enfant.id]);
  const submit = async (e) => {
    e.preventDefault();
    await action(() => post(`/enfants/${enfant.id}/passage`, formData(e)), 'Nouvelle année scolaire enregistrée');
    onDone();
    onClose();
  };
  return (
    <Modal titre="Passage de niveau / nouvelle année" onClose={onClose}>
      {!prop ? <p>…</p> : (
        <form onSubmit={submit}>
          <p className="small muted">L’historique de l’année {prop.annee_actuelle || 'précédente'} est conservé. Ajustez si redoublement, saut de classe ou changement de filière.</p>
          <div className="grille-2">
            <Field label="Année scolaire"><input name="annee" defaultValue={prop.annee_proposee} pattern="\d{4}-\d{4}" required /></Field>
            <Field label="Niveau">
              <select name="niveau_id" defaultValue={prop.niveau_propose?.id || prop.niveau_actuel?.id || ''} required>
                {niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Filière / spécialités"><input name="filiere" defaultValue={enfant.filiere || ''} /></Field>
          <Field label="Établissement"><input name="etablissement" /></Field>
          <Field label="Commentaire"><input name="commentaire" placeholder="ex. redoublement, changement d’école…" /></Field>
          <div className="actions"><button className="btn btn-primaire">Valider le passage</button></div>
        </form>
      )}
    </Modal>
  );
}

export default function Reglages({ enfant, onChange }) {
  const navigate = useNavigate();
  const niveaux = useApi('/niveaux').data || [];
  const matieres = useApi('/matieres').data || [];
  const [passage, setPassage] = useState(false);
  const actives = new Set(enfant.matieres.map((m) => m.id));

  const enregistrer = async (e) => {
    e.preventDefault();
    await action(() => put(`/enfants/${enfant.id}`, formData(e)), 'Modifications enregistrées');
    onChange();
  };
  const enregistrerMatieres = async (e) => {
    e.preventDefault();
    const ids = new FormData(e.currentTarget).getAll('matiere');
    await action(() => put(`/enfants/${enfant.id}/matieres`, { matiere_ids: ids }), 'Matières mises à jour');
    onChange();
  };
  const archiver = async () => {
    if (!window.confirm(enfant.archive ? 'Réactiver cet enfant ?' : `Archiver ${enfant.prenom} ? Ses données sont conservées.`)) return;
    await action(() => post(`/enfants/${enfant.id}/archive`, { archive: !enfant.archive }));
    navigate('/');
  };
  const supprimer = async () => {
    const c = window.prompt(`Suppression DÉFINITIVE de ${enfant.prenom} et de tout son historique.\nTapez « ${enfant.prenom} » pour confirmer :`);
    if (c == null) return;
    await action(() => del(`/enfants/${enfant.id}`, { confirmation: c }), 'Enfant supprimé');
    navigate('/');
  };

  return (
    <div className="grille-2">
      <form className="carte" onSubmit={enregistrer}>
        <h3>Profil</h3>
        <ChampsEnfant enfant={enfant} niveaux={niveaux} />
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>

      <section className="carte">
        <h3>Années scolaires</h3>
        <table className="table">
          <tbody>
            {enfant.annees.map((a) => (
              <tr key={a.id}>
                <td>{a.annee}</td><td><strong>{a.niveau_libelle || '—'}</strong>{a.filiere && <div className="small muted">{a.filiere}</div>}</td>
                <td className="small muted">{a.etablissement}{a.commentaire && ` · ${a.commentaire}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={() => setPassage(true)}>Passage de niveau (nouvelle année)…</button>
        <hr />
        <h3>Zone sensible</h3>
        <div className="actions">
          <button className="btn" onClick={archiver}>{enfant.archive ? 'Réactiver' : 'Archiver'}</button>
          <button className="btn btn-rouge" onClick={supprimer}>Supprimer définitivement</button>
        </div>
      </section>

      <form className="carte colonne-large" onSubmit={enregistrerMatieres}>
        <h3>Matières suivies</h3>
        {GROUPES.map(([type, titre]) => {
          const ms = matieres.filter((m) => m.type === type);
          if (!ms.length) return null;
          return (
            <fieldset key={type} className="groupe-cases">
              <legend>{titre}</legend>
              {ms.map((m) => (
                <label key={m.id} className="case">
                  <input type="checkbox" name="matiere" value={m.id} defaultChecked={actives.has(m.id)} />
                  <span className="point-couleur" style={{ background: m.couleur }} /> {m.nom} <span className="small muted">({m.nb_notions} notions)</span>
                </label>
              ))}
            </fieldset>
          );
        })}
        <p className="small muted">Pour créer une matière libre (code, échecs…), allez dans Paramètres › Matières.</p>
        <div className="actions"><button className="btn btn-primaire">Enregistrer les matières</button></div>
      </form>
      {passage && <Passage enfant={enfant} niveaux={niveaux} onClose={() => setPassage(false)} onDone={onChange} />}
    </div>
  );
}
