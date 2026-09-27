import { useState } from 'react';
import { action, del, post, put, useApi } from '../../api.js';
import { Confirm, ErrorBox, Field, Loading, Modal, Progress } from '../../components/ui.jsx';
import { aujourdhui, dateFr, formData, periodiciteLabel } from '../../util.js';

export function AjoutPoint({ enfant, sens, onClose, onDone }) {
  const cats = useApi('/categories-points').data || [];
  const matieres = useApi(`/enfants/${enfant.id}`).data?.matieres || [];
  const [cat, setCat] = useState('');
  const filtrees = cats.filter((c) => c.actif && Math.sign(c.valeur_defaut) === sens);
  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    if (d.valeur) d.valeur = sens * Math.abs(Number(d.valeur));
    await action(() => post(`/enfants/${enfant.id}/points`, d), sens > 0 ? 'Bon point attribué ⭐' : 'Mauvais point enregistré');
    onDone?.();
    onClose();
  };
  return (
    <Modal titre={`${sens > 0 ? 'Bon point' : 'Mauvais point'} pour ${enfant.prenom}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Motif prédéfini">
          <div className="choix-motifs">
            {filtrees.map((c) => (
              <label key={c.id} className={`chip ${String(cat) === String(c.id) ? 'actif' : ''}`}>
                <input type="radio" name="categorie_id" value={c.id} onChange={() => setCat(c.id)} /> {c.libelle} ({c.valeur_defaut > 0 ? '+' : ''}{c.valeur_defaut})
              </label>
            ))}
          </div>
        </Field>
        <Field label="Motif libre (précision)"><input name="motif" placeholder={cat ? 'Facultatif' : 'Obligatoire sans motif prédéfini'} /></Field>
        <div className="grille-3">
          <Field label="Valeur" aide="Vide = valeur du barème"><input name="valeur" type="number" min="1" step="1" /></Field>
          <Field label="Matière (facultatif)">
            <select name="matiere_id"><option value="">—</option>{matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select>
          </Field>
          <Field label="Date"><input name="date" type="date" defaultValue={aujourdhui()} /></Field>
        </div>
        <div className="actions"><button className={`btn ${sens > 0 ? 'btn-vert' : 'btn-rouge'}`}>Enregistrer</button></div>
      </form>
    </Modal>
  );
}

function RegleForm({ enfant, regle, onClose, onDone }) {
  const catalogue = useApi('/catalogue-recompenses').data || [];
  const [mode, setMode] = useState(regle?.mode_report || 'zero');
  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    d.actif = d.actif === 'on';
    if (regle) await action(() => put(`/regles/${regle.id}`, d), 'Règle modifiée');
    else await action(() => post(`/enfants/${enfant.id}/regles`, d), 'Règle créée');
    onDone();
    onClose();
  };
  return (
    <Modal titre={regle ? 'Modifier le palier' : 'Nouveau palier de récompense'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nom"><input name="libelle" defaultValue={regle?.libelle || ''} placeholder="Palier de la semaine" /></Field>
        <div className="grille-3">
          <Field label="Périodicité">
            <select name="periodicite" defaultValue={regle?.periodicite || 'semaine'}>
              <option value="semaine">Semaine (lun.–dim.)</option><option value="mois">Mois</option><option value="trimestre">Trimestre</option>
            </select>
          </Field>
          <Field label="Seuil de points"><input name="seuil" type="number" step="1" required defaultValue={regle?.seuil ?? 10} /></Field>
          <Field label="À partir du"><input name="date_debut" type="date" defaultValue={regle?.date_debut || aujourdhui()} /></Field>
        </div>
        <div className="grille-2">
          <Field label="Récompense du catalogue">
            <select name="catalogue_id" defaultValue={regle?.catalogue_id || ''}><option value="">—</option>{catalogue.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}</select>
          </Field>
          <Field label="…ou récompense libre"><input name="recompense" defaultValue={regle?.recompense || ''} /></Field>
        </div>
        <div className="grille-2">
          <Field label="À l’échéance, le compteur…">
            <select name="mode_report" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="zero">repart de zéro</option>
              <option value="surplus">reporte le surplus au-delà du seuil</option>
              <option value="pourcentage">reporte un pourcentage du total</option>
            </select>
          </Field>
          {mode === 'pourcentage' && <Field label="Pourcentage reporté"><input name="report_pourcent" type="number" min="0" max="100" defaultValue={regle?.report_pourcent ?? 20} /></Field>}
        </div>
        <label className="case"><input type="checkbox" name="actif" defaultChecked={regle ? !!regle.actif : true} /> Actif</label>
        <p className="small muted">À la fin de chaque période, l’application calcule automatiquement si le seuil est atteint ; un parent valide ensuite l’obtention.</p>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

const statutRecompense = { a_valider: '⏳ À valider', obtenue: '🎁 Obtenue', non_obtenue: '— Non obtenue' };

export default function Points({ enfant, onChange }) {
  const pts = useApi(`/enfants/${enfant.id}/points`);
  const regles = useApi(`/enfants/${enfant.id}/regles`);
  const [ajout, setAjout] = useState(null);
  const [regle, setRegle] = useState(null);
  const reload = () => { pts.reload(); regles.reload(); onChange?.(); };
  if (pts.error) return <ErrorBox error={pts.error} />;
  if (!pts.data || !regles.data) return <Loading />;

  return (
    <div>
      <div className="grille-2">
        <section className="carte">
          <h2>Solde : {pts.data.solde >= 0 ? '⭐' : '⚠️'} {pts.data.solde}</h2>
          <div className="boutons-points">
            <button className="btn btn-vert" onClick={() => setAjout(1)}>+ Bon point</button>
            <button className="btn btn-rouge" onClick={() => setAjout(-1)}>− Mauvais point</button>
          </div>
        </section>
        <section className="carte">
          <div className="carte-titre">
            <h2>Paliers de récompense</h2>
            <button className="btn btn-petit" onClick={() => setRegle({})}>+ Palier</button>
          </div>
          {!regles.data.regles.length && <p className="muted">Aucun palier. Créez par exemple un palier hebdomadaire et un palier mensuel.</p>}
          {regles.data.regles.map((r) => (
            <div key={r.id} className={`regle ${r.actif ? '' : 'inactif'}`}>
              <div className="carte-titre">
                <div><strong>{r.libelle}</strong> <span className="small muted">({periodiciteLabel[r.periodicite]}, seuil {r.seuil}{r.mode_report === 'surplus' ? ', report du surplus' : r.mode_report === 'pourcentage' ? `, report ${r.report_pourcent} %` : ''})</span></div>
                <div className="actions">
                  <button className="btn btn-lien btn-petit" onClick={() => setRegle(r)}>Modifier</button>
                  <Confirm message="Supprimer ce palier et son historique ?" onConfirm={() => action(() => del(`/regles/${r.id}`)).then(reload)}>✕</Confirm>
                </div>
              </div>
              {r.actif ? (
                <>
                  <Progress value={r.progression} couleur={r.atteint ? 'var(--vert)' : 'var(--primaire)'} />
                  <div className="small">{r.points}/{r.seuil} pts du {dateFr(r.periode_debut, { day: 'numeric', month: 'short' })} au {dateFr(r.periode_fin, { day: 'numeric', month: 'short' })}{r.report_entrant ? ` (dont ${r.report_entrant} reportés)` : ''}{r.recompense ? ` · 🎁 ${r.recompense}` : ''}</div>
                </>
              ) : <div className="small muted">Inactif</div>}
            </div>
          ))}
        </section>
      </div>

      <div className="grille-2">
        <section className="carte">
          <h3>Historique des points</h3>
          {pts.data.points.length ? (
            <table className="table">
              <tbody>
                {pts.data.points.map((p) => (
                  <tr key={p.id}>
                    <td className="small">{dateFr(p.date)}</td>
                    <td className={p.valeur > 0 ? 'positif' : 'negatif'}><strong>{p.valeur > 0 ? '+' : ''}{p.valeur}</strong></td>
                    <td>{p.categorie || ''}{p.categorie && p.motif ? ' — ' : ''}{p.motif}{p.matiere && <span className="small muted"> · {p.matiere}</span>}<div className="small muted">{p.adulte}</div></td>
                    <td><Confirm message="Supprimer ce point ?" onConfirm={() => action(() => del(`/points/${p.id}`)).then(reload)}>✕</Confirm></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Aucun point attribué.</p>}
        </section>
        <section className="carte">
          <h3>Récompenses (historique)</h3>
          {regles.data.historique.length ? (
            <table className="table">
              <tbody>
                {regles.data.historique.map((h) => (
                  <tr key={h.id}>
                    <td className="small">{dateFr(h.periode_debut, { day: 'numeric', month: 'short' })} → {dateFr(h.periode_fin)}</td>
                    <td>{h.libelle}<div className="small muted">{h.points}/{h.seuil} pts {h.atteint ? '✔' : '✘'}{h.recompense ? ` · ${h.recompense}` : ''}</div></td>
                    <td>
                      {statutRecompense[h.statut]}
                      {h.statut === 'a_valider' ? (
                        <div className="actions">
                          <button className="btn btn-petit btn-vert" onClick={() => action(() => post(`/recompenses/${h.id}/valider`, { statut: 'obtenue' })).then(reload)}>Accorder</button>
                          <button className="btn btn-petit" onClick={() => action(() => post(`/recompenses/${h.id}/valider`, { statut: 'non_obtenue' })).then(reload)}>Refuser</button>
                        </div>
                      ) : <div className="small muted">{h.valide_par_nom}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Aucune période clôturée pour l’instant.</p>}
        </section>
      </div>
      {ajout && <AjoutPoint enfant={enfant} sens={ajout} onClose={() => setAjout(null)} onDone={reload} />}
      {regle && <RegleForm enfant={enfant} regle={regle.id ? regle : null} onClose={() => setRegle(null)} onDone={reload} />}
    </div>
  );
}
