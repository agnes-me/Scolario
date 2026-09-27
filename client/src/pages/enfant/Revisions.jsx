import { Link } from 'react-router-dom';
import { action, post, useApi } from '../../api.js';
import { ErrorBox, Loading } from '../../components/ui.jsx';
import { dateFr } from '../../util.js';

export default function Revisions({ enfant }) {
  const { data, error, reload } = useApi(`/enfants/${enfant.id}/revisions`);
  const alertes = useApi(`/enfants/${enfant.id}/alertes`);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const base = `/enfants/${enfant.id}`;
  const lire = (id) => action(() => post(`/alertes/${id}/lue`)).then(() => { alertes.reload(); reload(); });

  return (
    <div>
      <section className="carte">
        <div className="carte-titre">
          <h2>Réactivation espacée (Leitner)</h2>
          <Link className="btn btn-primaire" to={`${base}/session?mode=revisions`}>▶ Révisions du jour ({data.dues.length})</Link>
        </div>
        <p className="small muted">Chaque notion testée est rangée dans une boîte. Réussite : elle passe à la boîte suivante et revient plus tard ; échec : retour en boîte 1 (révision le lendemain). Un échec à partir d’une boîte « acquis solide » est signalé ci-dessous.</p>
        <div className="boites">
          {data.boites.map((b) => (
            <div key={b.numero} className="boite" title={b.description || ''}>
              <div className="boite-num">Boîte {b.numero}</div>
              <div className="boite-nb">{b.nb}</div>
              <div className="small muted">tous les {b.intervalle_jours} j</div>
            </div>
          ))}
        </div>
        <p className="small muted">{data.faites_aujourdhui} question(s) vérifiée(s) aujourd’hui.</p>
      </section>

      {alertes.data?.length > 0 && (
        <section className="carte">
          <h3>Alertes d’oubli</h3>
          <ul className="liste-simple">
            {alertes.data.map((a) => (
              <li key={a.id} className={a.lue ? 'muted' : ''}>
                {dateFr(a.date)} — {a.message}
                {a.notion_id && <> <Link to={`${base}/notions/${a.notion_id}`}>voir</Link></>}
                {!a.lue && <button className="btn btn-lien btn-petit" onClick={() => lire(a.id)}>marquer comme vue</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grille-2">
        <section className="carte">
          <h3>À réviser aujourd’hui</h3>
          {data.dues.length ? (
            <ul className="liste-simple">
              {data.dues.map((n) => <li key={n.notion_id}><span className="point-couleur" style={{ background: n.matiere_couleur }} /> <Link to={`${base}/notions/${n.notion_id}`}>{n.titre}</Link> <span className="muted small">{n.matiere_nom} · boîte {n.boite}</span></li>)}
            </ul>
          ) : <p className="muted">Rien à réviser aujourd’hui.</p>}
        </section>
        <section className="carte">
          <h3>Prochaines réactivations</h3>
          {data.a_venir.length ? (
            <table className="table">
              <tbody>
                {data.a_venir.map((n) => <tr key={n.notion_id}><td>{dateFr(n.prochaine_echeance, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td><Link to={`${base}/notions/${n.notion_id}`}>{n.titre}</Link></td><td className="small muted">B{n.boite}</td></tr>)}
              </tbody>
            </table>
          ) : <p className="muted">Aucune notion planifiée. Vérifiez une notion avec l’enfant (depuis une matière) pour l’inscrire.</p>}
        </section>
      </div>
    </div>
  );
}
