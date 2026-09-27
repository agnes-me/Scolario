// Séance de vérification menée par le parent, assis à côté de l'enfant :
// le parent pose la question, voit la réponse attendue et note lui-même le résultat.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { post, useApi } from '../api.js';
import Markdown from '../components/Markdown.jsx';
import { Loading } from '../components/ui.jsx';

const TITRES = {
  revisions: 'Révisions du jour',
  notion: 'Vérification d’une notion',
  matiere: 'Vérification des notions non acquises',
};

export default function Session() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const mode = params.get('mode') || 'revisions';
  const { data: enfant } = useApi(`/enfants/${id}`);
  const [questions, setQuestions] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [i, setI] = useState(0);
  const [voirReponse, setVoirReponse] = useState(false);
  const [voirCours, setVoirCours] = useState(false);
  const [noteReponse, setNoteReponse] = useState('');
  const [resultats, setResultats] = useState([]);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    post(`/enfants/${id}/session`, { mode, notion_id: params.get('notion'), matiere_id: params.get('matiere'), limite: mode === 'notion' ? 6 : 15 })
      .then((r) => setQuestions(r.questions))
      .catch((e) => setErreur(e.message));
  }, [id, mode, params]);

  const q = questions?.[i];

  const suivante = () => {
    setVoirReponse(false);
    setVoirCours(false);
    setNoteReponse('');
    setI((x) => x + 1);
  };

  const noter = useCallback(async (reussite) => {
    if (!q || envoi) return;
    setEnvoi(true);
    try {
      const r = await post(`/enfants/${id}/reponses`, { exercice_id: q.exercice_id, reussite, reponse: noteReponse || null });
      setResultats((x) => [...x, { ...r, question: q }]);
      suivante();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  }, [q, envoi, id, noteReponse]);

  // Raccourcis clavier : R = réponse, O = réussi, N = raté, P = passer
  useEffect(() => {
    const k = (e) => {
      if (!q || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const t = e.key.toLowerCase();
      if (t === 'r') setVoirReponse((v) => !v);
      else if (t === 'o') noter(true);
      else if (t === 'n') noter(false);
      else if (t === 'p') suivante();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [q, noter]);

  const retour = `/enfants/${id}`;
  if (erreur) return <div><p className="alert alert-erreur">{erreur}</p><Link className="btn" to={retour}>Retour</Link></div>;
  if (!questions || !enfant) return <Loading />;

  const entete = (
    <div className="titre-page">
      <div>
        <h1>{TITRES[mode] || 'Vérification'} — {enfant.prenom}</h1>
        {questions.length > 0 && i < questions.length && <div className="muted small">Question {i + 1} sur {questions.length}</div>}
      </div>
      <Link to={retour} className="btn">{i >= questions.length ? 'Retour à la fiche' : 'Interrompre'}</Link>
    </div>
  );

  if (!questions.length) {
    return (
      <div>
        {entete}
        <div className="carte">
          <p>{mode === 'revisions' ? 'Aucune notion à réactiver aujourd’hui : tout est à jour.' : 'Pas d’exercice disponible pour cette sélection.'}</p>
          <Link className="btn btn-primaire" to={retour}>Retour</Link>
        </div>
      </div>
    );
  }

  if (i >= questions.length) {
    const faits = resultats.length;
    const ok = resultats.filter((r) => r.reussite).length;
    const alertes = resultats.filter((r) => r.alerte);
    return (
      <div>
        {entete}
        <section className="carte">
          <h2>Bilan : {ok} / {faits} réussie(s){faits < questions.length ? ` · ${questions.length - faits} passée(s)` : ''}</h2>
          {alertes.length > 0 && <div className="alert alert-orange">{alertes.length} notion(s) considérée(s) comme acquise(s) ont été ratée(s) : elles repartent en boîte 1.</div>}
          <table className="table">
            <thead><tr><th>Notion</th><th>Résultat</th><th>Boîte</th><th /></tr></thead>
            <tbody>
              {resultats.map((r, k) => (
                <tr key={k}>
                  <td>{r.question.notion_titre}<div className="small muted">{r.question.enonce}</div></td>
                  <td>{r.reussite ? '✅ Réussi' : '❌ Raté'}</td>
                  <td className="small muted">{r.compte ? `B${r.boiteAvant ?? '–'} → B${r.boiteApres}` : 'sans effet sur la boîte (échéance non atteinte)'}</td>
                  <td><Link className="btn btn-petit btn-lien" to={`${retour}/notions/${r.question.notion_id}`}>Fiche</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Les notions ratées reviennent dès demain dans les révisions ; les réussies sont espacées davantage.</p>
          <div className="actions"><Link className="btn btn-primaire" to={retour}>Terminer</Link></div>
        </section>
      </div>
    );
  }

  const precedent = resultats.at(-1);

  return (
    <div>
      {entete}
      <div className="session-progress"><span style={{ width: `${(100 * i) / questions.length}%` }} /></div>
      {precedent && (
        <p className="small muted">
          Question précédente : {precedent.reussite ? '✅ réussie' : '❌ ratée'}{precedent.compte ? ` (boîte ${precedent.boiteApres})` : ''}
        </p>
      )}
      <section className="carte verif">
        <div className="muted small">{q.notion_titre}{q.difficulte ? ` · ${q.difficulte}` : ''} · {q.type}</div>
        <p className="consigne-parent small muted">Posez la question à {enfant.prenom} :</p>
        <h2 className="enonce">{q.enonce}</h2>
        {q.options.length > 0 && (
          <ul className="options-verif">{q.options.map((o) => <li key={o}>{o}</li>)}</ul>
        )}

        <div className="reponse-attendue">
          {voirReponse
            ? <><span className="muted small">Réponse attendue</span><div className="reponse-texte">{q.reponse.split(/\s*\|\|\s*/).join(' / ')}</div></>
            : <button className="btn" onClick={() => setVoirReponse(true)}>Afficher la réponse attendue <kbd>R</kbd></button>}
        </div>

        <input className="note-reponse" value={noteReponse} onChange={(e) => setNoteReponse(e.target.value)}
          placeholder={`Réponse donnée par ${enfant.prenom} (facultatif, gardée dans l’historique)`} />

        <div className="verdict">
          <button className="btn btn-vert btn-grand" disabled={envoi} onClick={() => noter(true)}>✔ Réussi <kbd>O</kbd></button>
          <button className="btn btn-rouge btn-grand" disabled={envoi} onClick={() => noter(false)}>✘ Raté <kbd>N</kbd></button>
          <button className="btn btn-lien" disabled={envoi} onClick={suivante}>Passer <kbd>P</kbd></button>
        </div>

        {q.cours_md && (
          <div className="session-cours">
            <button className="btn btn-lien" onClick={() => setVoirCours(!voirCours)}>{voirCours ? 'Masquer' : '📘 Afficher'} la fiche de cours</button>
            {voirCours && <div className="carte"><Markdown source={q.cours_md} /></div>}
          </div>
        )}
      </section>
    </div>
  );
}
