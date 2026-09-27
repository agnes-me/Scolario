import { useApi } from '../../api.js';
import { ErrorBox, Loading, StatutBadge } from '../../components/ui.jsx';
import { STATUTS_MORCEAU, dateFr } from '../../util.js';

const ICONES = { observation: '👁️', tests: '✏️', point: '⭐', note: '📝', fluence: '📖', musique: '🎵' };

export default function Journal({ enfant }) {
  const { data, error } = useApi(`/enfants/${enfant.id}/journal`);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  let jour = null;
  return (
    <section className="carte">
      <h2>Historique</h2>
      <p className="small muted">Toutes les observations, tests, points, notes et mesures, sans écrasement : la progression (et les régressions) reste traçable.</p>
      {!data.length && <p className="muted">Aucun événement pour l’instant.</p>}
      <div className="journal">
        {data.map((it, k) => {
          const entete = it.date !== jour ? (jour = it.date) : null;
          return (
            <div key={k}>
              {entete && <h4 className="journal-jour">{dateFr(entete, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h4>}
              <div className="journal-ligne">
                <span className="journal-icone">{ICONES[it.type]}</span>
                <span>{it.libelle}</span>
                <span className="journal-detail">
                  {it.type === 'observation' ? <StatutBadge statut={it.detail} /> : it.type === 'musique' ? STATUTS_MORCEAU[it.detail] : it.detail}
                </span>
                {it.auteur && <span className="small muted">{it.auteur}</span>}
                {it.commentaire && <div className="small muted journal-commentaire">{it.commentaire}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
