import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useApi } from '../api.js';
import { ErrorBox, Loading, Tabs } from '../components/ui.jsx';
import { age } from '../util.js';
import Synthese from './enfant/Synthese.jsx';
import Matiere from './enfant/Matiere.jsx';
import Revisions from './enfant/Revisions.jsx';
import Points from './enfant/Points.jsx';
import LectureEcrit from './enfant/LectureEcrit.jsx';
import Elements from './enfant/Elements.jsx';
import Musique from './enfant/Musique.jsx';
import Journal from './enfant/Journal.jsx';
import Reglages from './enfant/Reglages.jsx';
import NotionDetail from '../components/NotionDetail.jsx';

function NotionEnfant({ enfant }) {
  const { nid } = useParams();
  return <NotionDetail notionId={nid} enfant={enfant} />;
}

export default function Enfant() {
  const { id } = useParams();
  const { data: e, error, reload } = useApi(`/enfants/${id}`);
  if (error) return <ErrorBox error={error} />;
  if (!e) return <Loading />;
  const base = `/enfants/${id}`;
  const primaire = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', 'GS', '6e'].includes(e.niveau_code);

  return (
    <div>
      <div className="entete-enfant" style={{ borderLeftColor: e.couleur || 'var(--primaire)' }}>
        <div className="avatar avatar-grand" style={{ background: e.couleur || 'var(--primaire)' }}>{e.prenom[0]}</div>
        <div className="entete-enfant-info">
          <h1>{e.prenom} {e.nom || ''}</h1>
          <div className="muted">
            {e.niveau_libelle || 'Niveau non défini'}{e.filiere ? ` · ${e.filiere}` : ''}{e.date_naissance ? ` · ${age(e.date_naissance)} ans` : ''}
            {e.archive ? ' · archivé' : ''}
          </div>
        </div>
        <div className="actions">
          <Link className="btn btn-primaire" to={`${base}/session?mode=revisions`}>▶ Révisions du jour{e.revisions_dues ? ` (${e.revisions_dues})` : ''}</Link>
        </div>
      </div>
      <Tabs items={[
        { to: base, label: 'Synthèse', end: true },
        { to: `${base}/revisions`, label: 'Révisions', badge: e.alertes || null },
        { to: `${base}/points`, label: 'Points & récompenses', badge: e.recompenses_a_valider || null },
        { to: `${base}/lecture-ecrit`, label: primaire ? 'Fluence & écrit' : 'Écrit' },
        { to: `${base}/elements`, label: 'Livres & projets' },
        { to: `${base}/musique`, label: 'Musique' },
        { to: `${base}/journal`, label: 'Historique' },
        { to: `${base}/reglages`, label: 'Réglages' },
      ]} />
      <Routes>
        <Route index element={<Synthese enfant={e} />} />
        <Route path="matieres/:mid" element={<Matiere enfant={e} />} />
        <Route path="notions/:nid" element={<NotionEnfant enfant={e} />} />
        <Route path="revisions" element={<Revisions enfant={e} />} />
        <Route path="points" element={<Points enfant={e} onChange={reload} />} />
        <Route path="lecture-ecrit" element={<LectureEcrit enfant={e} />} />
        <Route path="elements" element={<Elements enfant={e} />} />
        <Route path="musique" element={<Musique enfant={e} />} />
        <Route path="journal" element={<Journal enfant={e} />} />
        <Route path="reglages" element={<Reglages enfant={e} onChange={reload} />} />
      </Routes>
    </div>
  );
}
