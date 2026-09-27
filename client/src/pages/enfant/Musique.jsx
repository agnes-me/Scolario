import { useState } from 'react';
import { Link } from 'react-router-dom';
import { action, post, put, useApi } from '../../api.js';
import { ErrorBox, Field, Loading, Modal } from '../../components/ui.jsx';
import { STATUTS_MORCEAU, aujourdhui, dateFr, formData } from '../../util.js';

const COULEUR = { non_travaille: 'var(--gris)', en_cours: 'var(--bleu)', acquis: 'var(--vert)', a_revoir: 'var(--orange)' };

function FormStatut({ enfant, morceau, onClose, onDone }) {
  const submit = async (e) => {
    e.preventDefault();
    await action(() => post(`/enfants/${enfant.id}/morceaux/${morceau.id}`, formData(e)), 'Progression enregistrée');
    onDone();
    onClose();
  };
  return (
    <Modal titre={morceau.titre} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Statut">
          <div className="choix-statut">
            {Object.entries(STATUTS_MORCEAU).map(([k, l]) => <label key={k} className="radio-statut" style={{ '--c': COULEUR[k] }}><input type="radio" name="statut" value={k} required defaultChecked={k === (morceau.statut === 'en_cours' ? 'acquis' : 'en_cours')} /> {l}</label>)}
          </div>
        </Field>
        <Field label="Date"><input type="date" name="date" defaultValue={aujourdhui()} /></Field>
        <Field label="Commentaire"><textarea name="commentaire" rows={2} /></Field>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

export default function Musique({ enfant }) {
  const { data, error, reload } = useApi(`/enfants/${enfant.id}/musique`);
  const tous = useApi('/instruments').data || [];
  const [morceau, setMorceau] = useState(null);
  const [choix, setChoix] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const solfege = enfant.matieres.find((m) => m.type === 'musique');

  const enregistrerInstruments = async (e) => {
    e.preventDefault();
    const ids = [...new FormData(e.currentTarget).getAll('instrument')];
    await action(() => put(`/enfants/${enfant.id}/instruments`, { instrument_ids: ids }), 'Instruments mis à jour');
    setChoix(false);
    reload();
  };

  return (
    <div>
      <div className="titre-page">
        <h2>🎵 Musique</h2>
        <div className="actions">
          {solfege && <Link className="btn" to={`/enfants/${enfant.id}/matieres/${solfege.id}`}>Solfège</Link>}
          <button className="btn" onClick={() => setChoix(true)}>Instruments pratiqués</button>
        </div>
      </div>
      {!data.instruments.length && (
        <p className="empty">Aucun instrument suivi. Cliquez sur « Instruments pratiqués » pour en choisir (les instruments, niveaux et morceaux types se paramètrent dans Paramètres › Musique).</p>
      )}
      {data.instruments.map((inst) => (
        <section key={inst.id} className="carte">
          <div className="carte-titre">
            <h3>{inst.nom}</h3>
            <span className="tag">{inst.niveau_atteint ? `Niveau atteint : ${inst.niveau_atteint.libelle}` : 'Niveau en cours d’acquisition'}</span>
          </div>
          {[...inst.niveaux, { id: null, libelle: 'Sans niveau' }].map((n) => {
            const ms = inst.morceaux.filter((m) => m.niveau_id === n.id);
            if (!ms.length) return null;
            return (
              <div key={n.id ?? "sans"} className="groupe-notions">
                <h4>{n.libelle} <span className="small muted">({ms.filter((m) => m.statut === 'acquis').length}/{ms.length} acquis)</span></h4>
                {ms.map((m) => (
                  <div key={m.id} className="ligne-notion">
                    <div className="ligne-notion-titre">
                      <strong>{m.titre}</strong>
                      <span className="small muted">{[m.compositeur, m.style].filter(Boolean).join(' · ')}{m.lien && <> · <a href={m.lien} target="_blank" rel="noreferrer">partition / vidéo</a></>}</span>
                    </div>
                    <span className="small muted">{m.date_statut ? dateFr(m.date_statut) : ''}</span>
                    <span className="badge" style={{ background: COULEUR[m.statut || 'non_travaille'] }}>{STATUTS_MORCEAU[m.statut || 'non_travaille']}</span>
                    <button className="btn btn-petit" onClick={() => setMorceau(m)}>Mettre à jour</button>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      ))}
      {data.historique.length > 0 && (
        <section className="carte">
          <h3>Historique</h3>
          <ul className="liste-simple">
            {data.historique.map((h) => <li key={h.id}>{dateFr(h.date)} — {h.instrument} · {h.titre} : <strong>{STATUTS_MORCEAU[h.statut]}</strong>{h.commentaire && <span className="small muted"> — {h.commentaire}</span>}</li>)}
          </ul>
        </section>
      )}
      {morceau && <FormStatut enfant={enfant} morceau={morceau} onClose={() => setMorceau(null)} onDone={reload} />}
      {choix && (
        <Modal titre="Instruments pratiqués" onClose={() => setChoix(false)}>
          <form onSubmit={enregistrerInstruments}>
            {tous.map((i) => <label key={i.id} className="case"><input type="checkbox" name="instrument" value={i.id} defaultChecked={data.instruments.some((x) => x.id === i.id)} /> {i.nom}</label>)}
            {!tous.length && <p className="muted">Aucun instrument paramétré.</p>}
            <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
