import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { action, del, post, put, useApi } from '../api.js';
import { useAuth } from '../App.jsx';
import { Confirm, Field, Loading, Tabs } from '../components/ui.jsx';
import { dateFr, formData } from '../util.js';

function Foyer() {
  const { refresh } = useAuth();
  const { data, reload } = useApi('/foyer');
  if (!data) return <Loading />;
  const enregistrer = async (e) => {
    e.preventDefault();
    const d = formData(e);
    await action(() => put('/foyer', { nom: d.nom, options: { vue_comparative: d.vue_comparative === 'on' } }), 'Foyer mis à jour');
    reload(); refresh();
  };
  const ajouter = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    await action(() => post('/foyer/adultes', formData(e)), 'Compte créé');
    form.reset(); reload();
  };
  const mdp = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = formData(e);
    if (d.nouveau !== d.confirmation) return action(() => Promise.reject(new Error('Les mots de passe ne correspondent pas')));
    await action(() => put('/moi/password', d), 'Mot de passe modifié');
    form.reset();
  };
  return (
    <div className="grille-2">
      <form className="carte" onSubmit={enregistrer}>
        <h3>Foyer</h3>
        <Field label="Nom du foyer"><input name="nom" defaultValue={data.nom} /></Field>
        <label className="case"><input type="checkbox" name="vue_comparative" defaultChecked={data.options.vue_comparative} /> Afficher la vue comparative entre enfants (frise des niveaux) sur l’accueil</label>
        <p className="small muted">Option désactivée par défaut, pour ne pas en faire une compétition affichée en permanence.</p>
        <div className="actions"><button className="btn btn-primaire">Enregistrer</button></div>
      </form>
      <section className="carte">
        <h3>Adultes du foyer</h3>
        <p className="small muted">Tous les adultes ont les mêmes droits : chacun gère l’ensemble des enfants.</p>
        <ul className="liste-simple">
          {data.adultes.map((a) => (
            <li key={a.id}>{a.nom} <span className="muted small">{a.email}</span>
              {data.adultes.length > 1 && <Confirm message={`Supprimer le compte de ${a.nom} ?`} onConfirm={() => action(() => del(`/foyer/adultes/${a.id}`), 'Compte supprimé').then(reload)}>✕</Confirm>}
            </li>
          ))}
        </ul>
        <form onSubmit={ajouter}>
          <h4>Ajouter un adulte</h4>
          <div className="grille-3">
            <Field label="Prénom"><input name="nom" required /></Field>
            <Field label="Identifiant (e-mail)"><input name="email" type="email" required autoComplete="off" /></Field>
            <Field label="Mot de passe provisoire"><input name="password" type="text" minLength={8} required autoComplete="off" /></Field>
          </div>
          <button className="btn">Créer le compte</button>
        </form>
      </section>
      <form className="carte" onSubmit={mdp}>
        <h3>Mon mot de passe</h3>
        <Field label="Mot de passe actuel"><input name="ancien" type="password" required autoComplete="current-password" /></Field>
        <div className="grille-2">
          <Field label="Nouveau"><input name="nouveau" type="password" minLength={8} required autoComplete="new-password" /></Field>
          <Field label="Confirmation"><input name="confirmation" type="password" minLength={8} required autoComplete="new-password" /></Field>
        </div>
        <button className="btn">Changer</button>
      </form>
    </div>
  );
}

function Bareme() {
  const cats = useApi('/categories-points');
  const cat = useApi('/catalogue-recompenses');
  const ajoutCat = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    await action(() => post('/categories-points', formData(e)), 'Motif ajouté');
    form.reset(); cats.reload();
  };
  const ajoutRec = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    await action(() => post('/catalogue-recompenses', formData(e)), 'Récompense ajoutée');
    form.reset(); cat.reload();
  };
  return (
    <div className="grille-2">
      <section className="carte">
        <h3>Barème : motifs de points</h3>
        <table className="table">
          <tbody>
            {cats.data?.map((c) => (
              <tr key={c.id} className={c.actif ? '' : 'inactif'}>
                <td><input defaultValue={c.libelle} onBlur={(e) => e.target.value !== c.libelle && action(() => put(`/categories-points/${c.id}`, { libelle: e.target.value }), 'Enregistré')} aria-label="Libellé" /></td>
                <td><input type="number" className="input-court" defaultValue={c.valeur_defaut} onBlur={(e) => Number(e.target.value) !== c.valeur_defaut && action(() => put(`/categories-points/${c.id}`, { valeur_defaut: Number(e.target.value) }), 'Enregistré')} aria-label="Valeur" /></td>
                <td><label className="case small"><input type="checkbox" defaultChecked={!!c.actif} onChange={(e) => action(() => put(`/categories-points/${c.id}`, { actif: e.target.checked })).then(cats.reload)} /> actif</label></td>
                <td><Confirm message="Supprimer ce motif ?" onConfirm={() => action(() => del(`/categories-points/${c.id}`)).then(cats.reload)}>✕</Confirm></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={ajoutCat} className="ligne-form">
          <input name="libelle" placeholder="Nouveau motif" required />
          <input name="valeur_defaut" type="number" className="input-court" placeholder="±1" required />
          <button className="btn">Ajouter</button>
        </form>
        <p className="small muted">Valeur positive = bon point, négative = mauvais point.</p>
      </section>
      <section className="carte">
        <h3>Catalogue de récompenses</h3>
        <ul className="liste-simple">
          {cat.data?.map((c) => (
            <li key={c.id}><strong>{c.libelle}</strong>{c.description && <span className="small muted"> — {c.description}</span>}
              <Confirm message="Supprimer ?" onConfirm={() => action(() => del(`/catalogue-recompenses/${c.id}`)).then(cat.reload)}>✕</Confirm></li>
          ))}
        </ul>
        <form onSubmit={ajoutRec} className="ligne-form">
          <input name="libelle" placeholder="Récompense" required />
          <input name="description" placeholder="Description" />
          <button className="btn">Ajouter</button>
        </form>
        <p className="small muted">Les paliers (hebdomadaire, mensuel…) se règlent pour chaque enfant, onglet « Points & récompenses ».</p>
      </section>
    </div>
  );
}

function MatieresNiveaux() {
  const matieres = useApi('/matieres');
  const niveaux = useApi('/niveaux');
  const ajoutMat = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    await action(() => post('/matieres', formData(e)), 'Matière créée');
    form.reset(); matieres.reload();
  };
  const ajoutNiv = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    await action(() => post('/niveaux', formData(e)), 'Niveau ajouté');
    form.reset(); niveaux.reload();
  };
  const libres = matieres.data?.filter((m) => m.foyer_id) || [];
  return (
    <div className="grille-2">
      <section className="carte">
        <h3>Matières libres du foyer</h3>
        <p className="small muted">Matières non académiques (code, échecs, théâtre…) suivies comme les autres : ajoutez-leur des notions, cours et exercices depuis le Référentiel.</p>
        <ul className="liste-simple">
          {libres.map((m) => (
            <li key={m.id}><span className="point-couleur" style={{ background: m.couleur }} /> {m.nom} <span className="small muted">({m.type}, {m.nb_notions} notions)</span>
              <Confirm message={`Supprimer « ${m.nom} » et ses notions ?`} onConfirm={() => action(() => del(`/matieres/${m.id}`)).then(matieres.reload)}>✕</Confirm></li>
          ))}
        </ul>
        <form onSubmit={ajoutMat} className="ligne-form">
          <input name="nom" placeholder="Nom de la matière" required />
          <select name="type"><option value="libre">Libre</option><option value="musique">Musique</option></select>
          <input name="couleur" type="color" defaultValue="#607d8b" aria-label="Couleur" />
          <button className="btn">Créer</button>
        </form>
        <h4>Matières officielles</h4>
        <p className="small">{matieres.data?.filter((m) => !m.foyer_id).map((m) => m.nom).join(' · ')}</p>
      </section>
      <section className="carte">
        <h3>Niveaux scolaires</h3>
        <table className="table">
          <thead><tr><th>Code</th><th>Libellé</th><th>Cycle</th><th>Suivant</th><th /></tr></thead>
          <tbody>
            {niveaux.data?.map((n) => (
              <tr key={n.id}><td>{n.code}</td><td>{n.libelle}</td><td className="small">{n.cycle}</td><td className="small">{n.suivant_code || '—'}</td>
                <td>{n.foyer_id ? <Confirm message="Supprimer ce niveau ?" onConfirm={() => action(() => del(`/niveaux/${n.id}`)).then(niveaux.reload)}>✕</Confirm> : <span className="small muted">standard</span>}</td></tr>
            ))}
          </tbody>
        </table>
        <h4>Ajouter un niveau particulier</h4>
        <form onSubmit={ajoutNiv}>
          <div className="grille-3">
            <Field label="Code"><input name="code" required placeholder="1re-STMG" /></Field>
            <Field label="Libellé"><input name="libelle" required placeholder="Première STMG" /></Field>
            <Field label="Cycle"><input name="cycle" placeholder="Lycée" /></Field>
            <Field label="Ordre" aide="Standard : PS = 10 … Tle = 150"><input name="ordre" type="number" defaultValue={140} /></Field>
            <Field label="Niveau suivant (code)"><input name="suivant_code" placeholder="Tle" /></Field>
          </div>
          <button className="btn">Ajouter</button>
        </form>
      </section>
    </div>
  );
}

function MusiqueParam() {
  const { data, reload } = useApi('/instruments');
  const [ouvert, setOuvert] = useState(null);
  const soumettre = (url, msg) => async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    await action(() => post(url, formData(e)), msg);
    form.reset(); reload();
  };
  if (!data) return <Loading />;
  return (
    <div>
      <section className="carte">
        <h3>Instruments</h3>
        <p className="small muted">Chaque instrument a sa progression par niveaux, avec des morceaux types servant de jalons (« capable de jouer tel type de morceau »).</p>
        <form onSubmit={soumettre('/instruments', 'Instrument ajouté')} className="ligne-form">
          <input name="nom" placeholder="Nouvel instrument (violon, batterie…)" required />
          <button className="btn">Ajouter</button>
        </form>
      </section>
      {data.map((i) => (
        <section key={i.id} className="carte">
          <div className="carte-titre">
            <h3>{i.nom} <span className="small muted">({i.niveaux.length} niveaux, {i.morceaux.length} morceaux)</span></h3>
            <div className="actions">
              <button className="btn btn-petit" onClick={() => setOuvert(ouvert === i.id ? null : i.id)}>{ouvert === i.id ? 'Fermer' : 'Gérer'}</button>
              <Confirm message={`Supprimer ${i.nom} et tout son suivi ?`} onConfirm={() => action(() => del(`/instruments/${i.id}`)).then(reload)}>✕</Confirm>
            </div>
          </div>
          {ouvert === i.id && (
            <div className="grille-2">
              <div>
                <h4>Niveaux</h4>
                <ol>{i.niveaux.map((n) => <li key={n.id}>{n.libelle} <Confirm message="Supprimer ce niveau ?" onConfirm={() => action(() => del(`/niveaux-instrument/${n.id}`)).then(reload)}>✕</Confirm></li>)}</ol>
                <form onSubmit={soumettre(`/instruments/${i.id}/niveaux`, 'Niveau ajouté')} className="ligne-form">
                  <input name="libelle" placeholder="Nouveau niveau" required />
                  <button className="btn btn-petit">Ajouter</button>
                </form>
              </div>
              <div>
                <h4>Morceaux types</h4>
                <ul className="liste-simple">
                  {i.morceaux.map((m) => (
                    <li key={m.id}>{m.titre} <span className="small muted">{m.compositeur} · {i.niveaux.find((n) => n.id === m.niveau_id)?.libelle || 'sans niveau'}</span>
                      <Confirm message="Supprimer ce morceau ?" onConfirm={() => action(() => del(`/morceaux/${m.id}`)).then(reload)}>✕</Confirm></li>
                  ))}
                </ul>
                <form onSubmit={soumettre(`/instruments/${i.id}/morceaux`, 'Morceau ajouté')}>
                  <div className="grille-2">
                    <Field label="Titre"><input name="titre" required /></Field>
                    <Field label="Niveau"><select name="niveau_id"><option value="">—</option>{i.niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}</select></Field>
                    <Field label="Compositeur"><input name="compositeur" /></Field>
                    <Field label="Style"><input name="style" /></Field>
                  </div>
                  <Field label="Lien (partition, vidéo de référence)"><input name="lien" type="url" placeholder="https://" /></Field>
                  <button className="btn btn-petit">Ajouter le morceau</button>
                </form>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Fluence() {
  const { data, reload } = useApi('/paliers-fluence');
  const niveaux = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e'];
  const periodes = ['debut', 'milieu', 'fin'];
  if (!data) return <Loading />;
  const val = (n, p) => data.find((x) => x.niveau_code === n && x.periode === p);
  const enregistrer = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const paliers = [];
    for (const n of niveaux) for (const p of periodes) {
      const v = fd.get(`${n}|${p}`);
      const actuel = val(n, p);
      if (String(actuel?.mcm ?? '') !== v) paliers.push({ niveau_code: n, periode: p, mcm: v === '' ? null : Number(v) });
    }
    await action(() => put('/paliers-fluence', { paliers }), 'Paliers enregistrés');
    reload();
  };
  return (
    <form className="carte" onSubmit={enregistrer}>
      <h3>Paliers de fluence (mots correctement lus par minute)</h3>
      <p className="small muted">Repères volontairement exigeants, affichés sur la courbe de chaque enfant. Ajustez-les librement.</p>
      <table className="table">
        <thead><tr><th>Niveau</th><th>Début d’année</th><th>Mi-année</th><th>Fin d’année</th></tr></thead>
        <tbody>
          {niveaux.map((n) => (
            <tr key={n}><th>{n}</th>{periodes.map((p) => <td key={p}><input type="number" className="input-court" name={`${n}|${p}`} defaultValue={val(n, p)?.mcm ?? ''} min="0" /></td>)}</tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-primaire">Enregistrer</button>
    </form>
  );
}

function ReferentielParam() {
  const sync = useApi('/referentiel/sync');
  const leitner = useApi('/leitner').data || [];
  const stats = useApi('/referentiel/stats');
  useEffect(() => {
    if (!sync.data?.en_cours) return undefined;
    const t = setInterval(() => { sync.reload(); stats.reload(); }, 3000);
    return () => clearInterval(t);
  }, [sync.data?.en_cours]); // eslint-disable-line react-hooks/exhaustive-deps
  const lancer = async (force) => {
    await action(() => post('/referentiel/sync', { force }), 'Synchronisation lancée');
    sync.reload();
  };
  const d = sync.data?.derniere;
  return (
    <div className="grille-2">
      <section className="carte">
        <h3>Synchronisation Notion</h3>
        <p className="small muted">Notion reste l’outil d’édition du référentiel (notions, fiches de cours, exercices, paramètres Leitner). L’application en garde une copie locale et fonctionne sans Notion au quotidien.</p>
        {!sync.data ? <Loading /> : !sync.data.configure ? (
          <div className="alert alert-info">
            Synchronisation non configurée. Créez une intégration Notion interne (gratuite), partagez-lui les 3 bases, puis définissez la variable d’environnement <code>NOTION_TOKEN</code> et redémarrez l’application. Détails dans le README.
          </div>
        ) : (
          <>
            <p>Planification : {sync.data.intervalle_heures ? `toutes les ${sync.data.intervalle_heures} h` : 'manuelle uniquement'}.</p>
            <div className="actions">
              <button className="btn btn-primaire" disabled={sync.data.en_cours} onClick={() => lancer(false)}>{sync.data.en_cours ? 'Synchronisation en cours…' : 'Synchroniser maintenant'}</button>
              <button className="btn" disabled={sync.data.en_cours} onClick={() => lancer(true)} title="Re-télécharge toutes les fiches de cours">Tout re-télécharger</button>
            </div>
          </>
        )}
        {d && (
          <div className={`alert ${d.statut === 'ok' ? 'alert-ok' : d.statut === 'erreur' ? 'alert-erreur' : 'alert-info'}`}>
            <div>Dernière synchronisation : {new Date(d.started_at).toLocaleString('fr-FR')} ({d.declencheur}) — <strong>{d.statut}</strong></div>
            {d.resume?.erreur && <div>{d.resume.erreur}</div>}
            {d.resume && d.statut === 'ok' && <div className="small">{d.resume.notions} notions, {d.resume.exercices} exercices, {d.resume.cours_telecharges} fiches de cours mises à jour, {d.resume.boites} boîtes Leitner, {d.resume.desactives} éléments désactivés.</div>}
            {d.resume?.ignores?.length > 0 && <details className="small"><summary>{d.resume.ignores.length} élément(s) ignoré(s)</summary><ul>{d.resume.ignores.map((x, k) => <li key={k}>{x}</li>)}</ul></details>}
          </div>
        )}
        {stats.data && (
          <>
            <h4>Contenu importé</h4>
            <p className="small">{stats.data.total.notions} notions · {stats.data.total.exercices} exercices{stats.data.total.demo ? ' (démonstration)' : ''}</p>
            <a className="btn btn-petit" href="/api/referentiel/export">Exporter le référentiel (JSON)</a>
          </>
        )}
      </section>
      <section className="carte">
        <h3>Paramètres de réactivation (Leitner)</h3>
        <table className="table">
          <thead><tr><th>Boîte</th><th>Intervalle</th><th>Règles</th></tr></thead>
          <tbody>
            {leitner.map((b) => (
              <tr key={b.numero}>
                <td><strong>{b.libelle}</strong><div className="small muted">{b.description}</div></td>
                <td>{b.intervalle_jours} j</td>
                <td className="small">✔ {b.regle_succes}<br />✘ {b.regle_echec}{b.alerte_parent ? ' 🔔' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Ces paramètres sont lus depuis la base Notion « Paramètres de réactivation (Leitner) » à chaque synchronisation.</p>
      </section>
    </div>
  );
}

function Export() {
  const { data } = useApi('/export/tables');
  return (
    <section className="carte">
      <h3>Export des données</h3>
      <p>Toutes les données du foyer vous appartiennent. Export complet :</p>
      <a className="btn btn-primaire" href="/api/export/json">Télécharger l’export complet (JSON)</a>
      <h4>Export CSV par table</h4>
      <p className="small muted">Séparateur « ; », encodage UTF-8 : s’ouvre directement dans LibreOffice ou Excel.</p>
      <div className="liens-csv">
        {data?.map((t) => <a key={t} className="btn btn-petit" href={`/api/export/csv/${t}`}>{t.replace(/_/g, ' ')}</a>)}
      </div>
      <p className="small muted">Sauvegarde complète : copiez le fichier <code>data/scolario.db</code> (voir README).</p>
      <p className="small muted">Date du jour côté serveur : {dateFr(new Date().toISOString())}</p>
    </section>
  );
}

export default function Parametres() {
  return (
    <div>
      <h1>Paramètres</h1>
      <Tabs items={[
        { to: '/parametres', label: 'Foyer & adultes', end: true },
        { to: '/parametres/bareme', label: 'Points & récompenses' },
        { to: '/parametres/matieres', label: 'Matières & niveaux' },
        { to: '/parametres/musique', label: 'Musique' },
        { to: '/parametres/fluence', label: 'Fluence' },
        { to: '/parametres/referentiel', label: 'Référentiel & Notion' },
        { to: '/parametres/export', label: 'Export' },
      ]} />
      <Routes>
        <Route index element={<Foyer />} />
        <Route path="bareme" element={<Bareme />} />
        <Route path="matieres" element={<MatieresNiveaux />} />
        <Route path="musique" element={<MusiqueParam />} />
        <Route path="fluence" element={<Fluence />} />
        <Route path="referentiel" element={<ReferentielParam />} />
        <Route path="export" element={<Export />} />
      </Routes>
    </div>
  );
}
