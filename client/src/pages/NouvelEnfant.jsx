import { useNavigate } from 'react-router-dom';
import { action, post, useApi } from '../api.js';
import { Field } from '../components/ui.jsx';
import { formData } from '../util.js';

export const COULEURS = ['#2f5bd3', '#1a9a5b', '#d64f93', '#e07b18', '#8a4fd1', '#0f8b8d', '#c0392b', '#6b7785'];

export function ChampsEnfant({ enfant = {}, niveaux = [] }) {
  return (
    <>
      <div className="grille-2">
        <Field label="Prénom"><input name="prenom" defaultValue={enfant.prenom} required /></Field>
        <Field label="Nom (facultatif)"><input name="nom" defaultValue={enfant.nom || ''} /></Field>
        <Field label="Date de naissance"><input name="date_naissance" type="date" defaultValue={enfant.date_naissance || ''} /></Field>
        <Field label="Niveau scolaire actuel">
          <select name="niveau_id" defaultValue={enfant.niveau_id || ''}>
            <option value="">—</option>
            {niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}{n.foyer_id ? ' (perso)' : ''}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Filière, spécialités, section (lycée…)"><input name="filiere" defaultValue={enfant.filiere || ''} placeholder="ex. Générale — Maths, SVT, Physique" /></Field>
      <Field label="Couleur">
        <div className="couleurs">
          {COULEURS.map((c, i) => (
            <label key={c} className="couleur-choix" style={{ background: c }}>
              <input type="radio" name="couleur" value={c} defaultChecked={(enfant.couleur || COULEURS[0]) === c || (!enfant.couleur && i === 0)} />
            </label>
          ))}
        </div>
      </Field>
    </>
  );
}

export default function NouvelEnfant() {
  const navigate = useNavigate();
  const { data: niveaux } = useApi('/niveaux');
  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    const r = await action(() => post('/enfants', d), `${d.prenom} a été ajouté(e)`);
    navigate(`/enfants/${r.id}`);
  };
  return (
    <form className="carte formulaire" onSubmit={submit}>
      <h1>Ajouter un enfant</h1>
      <ChampsEnfant niveaux={niveaux || []} />
      <Field label="Établissement (facultatif)"><input name="etablissement" /></Field>
      <p className="small muted">Les matières du socle correspondant au niveau sont activées automatiquement ; vous pourrez ajouter les options (LV2, latin, grec…) et les matières libres ensuite.</p>
      <div className="actions"><button className="btn btn-primaire">Créer</button></div>
    </form>
  );
}
