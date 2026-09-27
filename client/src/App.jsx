import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { get, post, setUnauthorizedHandler, useToasts } from './api.js';
import { Loading } from './components/ui.jsx';
import Connexion from './pages/Connexion.jsx';
import Accueil from './pages/Accueil.jsx';
import NouvelEnfant from './pages/NouvelEnfant.jsx';
import Enfant from './pages/Enfant.jsx';
import Session from './pages/Session.jsx';
import Referentiel from './pages/Referentiel.jsx';
import NotionPage from './pages/NotionPage.jsx';
import Parametres from './pages/Parametres.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function Toasts() {
  const items = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>)}
    </div>
  );
}

function Layout({ children }) {
  const { status, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  return (
    <div className="app">
      <header className="entete">
        <Link to="/" className="logo"><img src="/favicon.svg" alt="" /> Scolario</Link>
        <button className="btn-icone menu-mobile" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
        <nav className={`nav ${menu ? 'ouvert' : ''}`} onClick={() => setMenu(false)}>
          <NavLink to="/" end>Enfants</NavLink>
          <NavLink to="/referentiel">Référentiel</NavLink>
          <NavLink to="/parametres">Paramètres</NavLink>
          <span className="nav-user" title={status.adulte.email}>{status.adulte.nom} · {status.foyer?.nom}</span>
          <button className="btn btn-lien" onClick={logout}>Déconnexion</button>
        </nav>
      </header>
      <main className="contenu">{children}</main>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  const refresh = useCallback(() => get('/auth/status').then(setStatus).catch(() => setStatus({ connecte: false })), []);
  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => setStatus((s) => ({ ...s, connecte: false })));
  }, [refresh]);

  const logout = async () => {
    await post('/auth/logout');
    await refresh();
    navigate('/');
  };

  if (!status) return <Loading />;
  const ctx = { status, refresh, logout };

  return (
    <AuthContext.Provider value={ctx}>
      <Toasts />
      {!status.connecte ? (
        <Connexion />
      ) : (
        <Routes>
          <Route path="*" element={
            <Layout>
              <Routes>
                <Route path="/" element={<Accueil />} />
                <Route path="/enfants/nouveau" element={<NouvelEnfant />} />
                <Route path="/enfants/:id/session" element={<Session />} />
                <Route path="/enfants/:id/*" element={<Enfant />} />
                <Route path="/referentiel" element={<Referentiel />} />
                <Route path="/referentiel/notions/:nid" element={<NotionPage />} />
                <Route path="/parametres/*" element={<Parametres />} />
                <Route path="*" element={<p>Page introuvable. <Link to="/">Retour à l’accueil</Link></p>} />
              </Routes>
            </Layout>
          } />
        </Routes>
      )}
    </AuthContext.Provider>
  );
}
