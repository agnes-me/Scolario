import { useState } from 'react';
import { action, del, post, useApi } from '../../api.js';
import { Confirm, ErrorBox, Field, Loading, Modal } from '../../components/ui.jsx';
import LineChart from '../../components/LineChart.jsx';
import { aujourdhui, dateFr, formData } from '../../util.js';

const QUALITE = { soigne: '✨ Soigné', correct: '👌 Correct', a_travailler: '✍️ À travailler' };
const PERIODE = { debut: 'début d’année', milieu: 'mi-année', fin: 'fin d’année' };

function FormFluence({ enfant, onClose, onDone }) {
  const submit = async (e) => {
    e.preventDefault();
    await action(() => post(`/enfants/${enfant.id}/fluence`, formData(e)), 'Mesure enregistrée');
    onDone();
    onClose();
  };
  return (
    <Modal titre="Nouvelle mesure de fluence" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="small muted">Faites lire un texte adapté pendant 1 minute ; comptez les mots correctement lus (mots lus − erreurs).</p>
        <div className="grille-3">
          <Field label="Mots correctement lus / min"><input name="mots_par_minute" type="number" min="0" max="400" required autoFocus /></Field>
          <Field label="Erreurs"><input name="erreurs" type="number" min="0" /></Field>
          <Field label="Date"><input name="date" type="date" defaultValue={aujourdhui()} /></Field>
        </div>
        <Field label="Texte support"><input name="texte_support" placeholder="Titre du texte, manuel, page…" /></Field>
        <Field label="Commentaire"><textarea name="commentaire" rows={2} placeholder="Prosodie, hésitations…" /></Field>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

function FormEcrit({ enfant, type, onClose, onDone }) {
  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    d.type = type;
    if (type === 'production') d.consignes_respectees = d.consignes_respectees === 'oui' ? 1 : d.consignes_respectees === 'non' ? 0 : '';
    await action(() => post(`/enfants/${enfant.id}/ecrit`, d), 'Évaluation enregistrée');
    onDone();
    onClose();
  };
  const titres = { dictee: 'Nouvelle dictée', ecriture: 'Qualité de l’écriture', production: 'Production d’écrit' };
  return (
    <Modal titre={titres[type]} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grille-2">
          <Field label="Titre / sujet"><input name="titre" /></Field>
          <Field label="Date"><input name="date" type="date" defaultValue={aujourdhui()} /></Field>
        </div>
        {type === 'dictee' && (
          <>
            <div className="grille-3">
              <Field label="Erreurs d’usage (lexicales)"><input name="erreurs_usage" type="number" min="0" defaultValue={0} /></Field>
              <Field label="Erreurs de grammaire (accords…)"><input name="erreurs_grammaire" type="number" min="0" defaultValue={0} /></Field>
              <Field label="Erreurs de conjugaison"><input name="erreurs_conjugaison" type="number" min="0" defaultValue={0} /></Field>
            </div>
            <div className="grille-3">
              <Field label="Nombre de mots"><input name="nb_mots" type="number" min="0" /></Field>
              <Field label="Note"><input name="note" type="number" step="0.5" /></Field>
              <Field label="Sur"><input name="note_max" type="number" defaultValue={10} /></Field>
            </div>
          </>
        )}
        {type === 'ecriture' && (
          <Field label="Qualité graphique">
            <div className="choix-statut">
              {Object.entries(QUALITE).map(([k, l]) => <label key={k} className="radio-statut"><input type="radio" name="qualite" value={k} required /> {l}</label>)}
            </div>
          </Field>
        )}
        {type === 'production' && (
          <>
            <div className="grille-3">
              <Field label="Consignes respectées ?">
                <select name="consignes_respectees"><option value="">—</option><option value="oui">Oui</option><option value="non">Non</option></select>
              </Field>
              <Field label="Longueur (mots)"><input name="nb_mots" type="number" min="0" /></Field>
              <Field label="Note"><input name="note" type="number" step="0.5" /></Field>
            </div>
            <Field label="Structure"><input name="structure" placeholder="Introduction, paragraphes, connecteurs…" /></Field>
          </>
        )}
        <Field label="Commentaire"><textarea name="commentaire" rows={2} /></Field>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

export default function LectureEcrit({ enfant }) {
  const fluence = useApi(`/enfants/${enfant.id}/fluence`);
  const ecrit = useApi(`/enfants/${enfant.id}/ecrit`);
  const paliers = useApi('/paliers-fluence').data || [];
  const [form, setForm] = useState(null);
  if (fluence.error) return <ErrorBox error={fluence.error} />;
  if (!fluence.data || !ecrit.data) return <Loading />;
  const cibles = paliers.filter((p) => p.niveau_code === enfant.niveau_code).map((p) => ({ label: `Objectif ${PERIODE[p.periode]}`, y: p.mcm }));
  const dictees = ecrit.data.filter((x) => x.type === 'dictee');
  const ecritures = ecrit.data.filter((x) => x.type === 'ecriture');
  const productions = ecrit.data.filter((x) => x.type === 'production');
  const supprimer = (url, api) => action(() => del(url)).then(api.reload);

  return (
    <div>
      <section className="carte">
        <div className="carte-titre">
          <h2>📖 Fluence de lecture</h2>
          <button className="btn btn-primaire" onClick={() => setForm('fluence')}>+ Mesure</button>
        </div>
        {cibles.length > 0 && <p className="small muted">Repères {enfant.niveau_code} : {cibles.map((c) => `${c.y} mots/min (${c.label.replace('Objectif ', '')})`).join(' · ')}</p>}
        <LineChart points={fluence.data.map((m) => ({ x: m.date, y: m.mots_par_minute }))} cible={cibles} unite="mots/min"
          labelX={(d) => dateFr(d, { day: 'numeric', month: 'short' })} />
        {fluence.data.length > 0 && (
          <table className="table">
            <thead><tr><th>Date</th><th>Mots/min</th><th>Erreurs</th><th>Texte</th><th /></tr></thead>
            <tbody>
              {[...fluence.data].reverse().map((m) => (
                <tr key={m.id}><td>{dateFr(m.date)}</td><td><strong>{m.mots_par_minute}</strong></td><td>{m.erreurs ?? '—'}</td>
                  <td>{m.texte_support}{m.commentaire && <div className="small muted">{m.commentaire}</div>}</td>
                  <td><Confirm message="Supprimer cette mesure ?" onConfirm={() => supprimer(`/fluence/${m.id}`, fluence)}>✕</Confirm></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="carte">
        <div className="carte-titre">
          <h2>✍️ Dictées</h2>
          <button className="btn" onClick={() => setForm('dictee')}>+ Dictée</button>
        </div>
        {dictees.length ? (
          <>
            <LineChart points={[...dictees].reverse().map((d) => ({ x: d.date, y: (d.erreurs_usage || 0) + (d.erreurs_grammaire || 0) + (d.erreurs_conjugaison || 0) }))}
              height={150} unite="erreurs" labelX={(d) => dateFr(d, { day: 'numeric', month: 'short' })} />
            <table className="table">
              <thead><tr><th>Date</th><th>Dictée</th><th>Usage</th><th>Grammaire</th><th>Conjugaison</th><th>Note</th><th /></tr></thead>
              <tbody>
                {dictees.map((d) => (
                  <tr key={d.id}><td>{dateFr(d.date)}</td><td>{d.titre}{d.commentaire && <div className="small muted">{d.commentaire}</div>}</td>
                    <td>{d.erreurs_usage ?? '—'}</td><td>{d.erreurs_grammaire ?? '—'}</td><td>{d.erreurs_conjugaison ?? '—'}</td>
                    <td>{d.note != null ? `${d.note}/${d.note_max ?? ''}` : '—'}</td>
                    <td><Confirm message="Supprimer ?" onConfirm={() => supprimer(`/ecrit/${d.id}`, ecrit)}>✕</Confirm></td></tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <p className="muted">Aucune dictée enregistrée. Le détail des erreurs par type (usage, grammaire, conjugaison) permet de cibler le travail.</p>}
      </section>

      <div className="grille-2">
        <section className="carte">
          <div className="carte-titre">
            <h3>Qualité graphique</h3>
            <button className="btn btn-petit" onClick={() => setForm('ecriture')}>+ Évaluer</button>
          </div>
          {ecritures.length ? (
            <ul className="liste-simple">{ecritures.map((x) => <li key={x.id}>{dateFr(x.date)} — {QUALITE[x.qualite]} {x.titre && `· ${x.titre}`}{x.commentaire && <div className="small muted">{x.commentaire}</div>} <Confirm message="Supprimer ?" onConfirm={() => supprimer(`/ecrit/${x.id}`, ecrit)}>✕</Confirm></li>)}</ul>
          ) : <p className="muted">Aucune évaluation.</p>}
        </section>
        <section className="carte">
          <div className="carte-titre">
            <h3>Productions d’écrit</h3>
            <button className="btn btn-petit" onClick={() => setForm('production')}>+ Évaluer</button>
          </div>
          {productions.length ? (
            <ul className="liste-simple">{productions.map((x) => (
              <li key={x.id}>{dateFr(x.date)} — <strong>{x.titre || 'Production'}</strong>
                <div className="small">{x.consignes_respectees == null ? '' : x.consignes_respectees ? '✔ consignes respectées' : '✘ consignes non respectées'}{x.nb_mots ? ` · ${x.nb_mots} mots` : ''}{x.note != null ? ` · ${x.note}` : ''}{x.structure ? ` · ${x.structure}` : ''}</div>
                {x.commentaire && <div className="small muted">{x.commentaire}</div>}
                <Confirm message="Supprimer ?" onConfirm={() => supprimer(`/ecrit/${x.id}`, ecrit)}>✕</Confirm>
              </li>
            ))}</ul>
          ) : <p className="muted">Aucune production évaluée.</p>}
        </section>
      </div>

      {form === 'fluence' && <FormFluence enfant={enfant} onClose={() => setForm(null)} onDone={fluence.reload} />}
      {['dictee', 'ecriture', 'production'].includes(form) && <FormEcrit enfant={enfant} type={form} onClose={() => setForm(null)} onDone={ecrit.reload} />}
    </div>
  );
}
