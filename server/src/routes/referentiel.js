import { Router } from 'express';
import { all, get, run } from '../db.js';
import { bad, enfantDuFoyer, matiereVisible, notionVisible, str } from './common.js';
import { statutsEnfant } from '../services/statut.js';
import { boites } from '../services/leitner.js';
import { parseOptions } from '../services/answer.js';
import { derniereSync, notionConfig, synchroniser, syncEnCours } from '../services/notionSync.js';

const TYPES_EXERCICE = ['QCM', 'Reponse courte', 'Texte a trous', 'Calcul', 'Conjugaison a trous', 'Vrai/Faux'];

export default function referentielRoutes(db) {
  const r = Router();

  // ───── Matières ─────
  r.get('/matieres', (req, res) => {
    res.json(all(db, `SELECT m.*, (SELECT COUNT(*) FROM notion n WHERE n.matiere_id = m.id AND n.actif = 1 AND (n.foyer_id IS NULL OR n.foyer_id = ?)) AS nb_notions
                      FROM matiere m WHERE m.foyer_id IS NULL OR m.foyer_id = ? ORDER BY m.ordre, m.nom`, req.adulte.foyer_id, req.adulte.foyer_id));
  });

  r.post('/matieres', (req, res) => {
    const b = req.body || {};
    if (!str(b.nom)) throw bad('Nom obligatoire');
    const type = b.type === 'musique' ? 'musique' : 'libre';
    const code = `${str(b.nom, 40).normalize('NFD').replace(/[^\w]+/g, '_').toLowerCase()}_${Date.now().toString(36)}`;
    const id = run(db, 'INSERT INTO matiere (foyer_id, code, nom, type, couleur, ordre) VALUES (?, ?, ?, ?, ?, ?)',
      req.adulte.foyer_id, code, str(b.nom, 80), type, str(b.couleur, 20) || '#607d8b', 50).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  r.put('/matieres/:id', (req, res) => {
    const m = get(db, 'SELECT * FROM matiere WHERE id = ? AND foyer_id = ?', Number(req.params.id), req.adulte.foyer_id);
    if (!m) throw bad('Seules les matières créées par le foyer sont modifiables');
    run(db, 'UPDATE matiere SET nom = ?, couleur = ? WHERE id = ?', str(req.body?.nom, 80) || m.nom, str(req.body?.couleur, 20) || m.couleur, m.id);
    res.json({ ok: true });
  });

  r.delete('/matieres/:id', (req, res) => {
    const m = get(db, 'SELECT * FROM matiere WHERE id = ? AND foyer_id = ?', Number(req.params.id), req.adulte.foyer_id);
    if (!m) throw bad('Seules les matières créées par le foyer sont supprimables');
    run(db, 'DELETE FROM matiere WHERE id = ?', m.id);
    res.json({ ok: true });
  });

  // ───── Notions ─────
  r.get('/notions', (req, res) => {
    const { matiere_id, niveau, q, enfant_id } = req.query;
    const where = ['n.actif = 1', '(n.foyer_id IS NULL OR n.foyer_id = ?)'];
    const params = [req.adulte.foyer_id];
    if (matiere_id) { where.push('n.matiere_id = ?'); params.push(Number(matiere_id)); }
    if (niveau) { where.push('n.niveau_code = ?'); params.push(String(niveau)); }
    if (q) { where.push('(n.titre LIKE ? OR n.libelle_officiel LIKE ? OR n.domaine LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const rows = all(db, `SELECT n.id, n.foyer_id, n.source, n.matiere_id, n.niveau_code, n.cycle, n.domaine, n.sous_domaine, n.titre,
                            n.libelle_officiel, n.statut_type, n.millesime, n.source_bo, m.nom AS matiere_nom, m.couleur AS matiere_couleur,
                            (SELECT COUNT(*) FROM exercice e WHERE e.notion_id = n.id AND e.actif = 1) AS nb_exercices,
                            (n.cours_md IS NOT NULL AND n.cours_md <> '') AS a_cours
                          FROM notion n JOIN matiere m ON m.id = n.matiere_id
                          LEFT JOIN niveau nv ON nv.code = n.niveau_code AND nv.foyer_id IS NULL
                          WHERE ${where.join(' AND ')}
                          ORDER BY m.ordre, nv.ordre, n.domaine, n.sous_domaine, n.titre LIMIT 1000`, ...params);
    if (enfant_id) {
      const e = enfantDuFoyer(db, req, enfant_id);
      const st = statutsEnfant(db, e.id);
      for (const n of rows) Object.assign(n, { suivi: st.get(n.id) || { statut: 'non_vu' } });
    }
    res.json(rows);
  });

  r.get('/notions/:id', (req, res) => {
    const n = notionVisible(db, req, req.params.id);
    const m = get(db, 'SELECT nom, couleur, type FROM matiere WHERE id = ?', n.matiere_id);
    const exercices = all(db, 'SELECT * FROM exercice WHERE notion_id = ? AND actif = 1 ORDER BY difficulte, id', n.id)
      .map((e) => ({ ...e, options: JSON.parse(e.options_json) }));
    let suivi = null;
    if (req.query.enfant_id) {
      const e = enfantDuFoyer(db, req, req.query.enfant_id);
      suivi = {
        ...(statutsEnfant(db, e.id).get(n.id) || { statut: 'non_vu' }),
        observations: all(db, `SELECT o.*, a.nom AS adulte_nom FROM observation o LEFT JOIN adulte a ON a.id = o.adulte_id
                               WHERE o.enfant_id = ? AND o.notion_id = ? ORDER BY o.date DESC, o.id DESC`, e.id, n.id),
        tentatives: all(db, `SELECT t.*, x.titre AS exercice_titre, x.type AS exercice_type FROM tentative t JOIN exercice x ON x.id = t.exercice_id
                             WHERE t.enfant_id = ? AND t.notion_id = ? ORDER BY t.date DESC LIMIT 200`, e.id, n.id),
      };
    }
    res.json({ ...n, matiere_nom: m?.nom, matiere_couleur: m?.couleur, exercices, suivi, modifiable: n.foyer_id != null });
  });

  const lireNotion = (b) => ({
    titre: str(b.titre, 200), niveau_code: str(b.niveau_code, 20), domaine: str(b.domaine, 200), sous_domaine: str(b.sous_domaine, 200),
    libelle_officiel: str(b.libelle_officiel, 1000), cours_md: str(b.cours_md, 50000), notes: str(b.notes, 2000),
  });

  r.post('/notions', (req, res) => {
    const b = req.body || {};
    const m = matiereVisible(db, req, b.matiere_id);
    if (!m) throw bad('Matière obligatoire');
    const v = lireNotion(b);
    if (!v.titre) throw bad('Titre obligatoire');
    const id = run(db, `INSERT INTO notion (foyer_id, source, source_id, matiere_id, niveau_code, domaine, sous_domaine, titre, libelle_officiel, cours_md, notes)
                        VALUES (?, 'foyer', NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.adulte.foyer_id, m.id, v.niveau_code, v.domaine, v.sous_domaine, v.titre, v.libelle_officiel, v.cours_md, v.notes).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  const notionDuFoyer = (req) => {
    const n = get(db, 'SELECT * FROM notion WHERE id = ? AND foyer_id = ?', Number(req.params.id), req.adulte.foyer_id);
    if (!n) throw bad('Le socle officiel n’est pas modifiable dans l’application (il se met à jour depuis Notion).');
    return n;
  };

  r.put('/notions/:id', (req, res) => {
    const n = notionDuFoyer(req);
    const v = lireNotion({ ...n, ...req.body });
    run(db, 'UPDATE notion SET niveau_code = ?, domaine = ?, sous_domaine = ?, titre = ?, libelle_officiel = ?, cours_md = ?, notes = ? WHERE id = ?',
      v.niveau_code, v.domaine, v.sous_domaine, v.titre || n.titre, v.libelle_officiel, v.cours_md, v.notes, n.id);
    res.json({ ok: true });
  });

  r.delete('/notions/:id', (req, res) => {
    const n = notionDuFoyer(req);
    run(db, 'DELETE FROM notion WHERE id = ?', n.id);
    res.json({ ok: true });
  });

  const lireExercice = (b) => {
    const type = TYPES_EXERCICE.includes(b.type) ? b.type : 'Reponse courte';
    if (!str(b.enonce) || !str(b.reponse)) throw bad('Énoncé et réponse attendue obligatoires');
    return { type, titre: str(b.titre, 200) || str(b.enonce, 60), enonce: str(b.enonce, 5000), reponse: str(b.reponse, 500),
      options: JSON.stringify(parseOptions(b.options)), difficulte: ['Facile', 'Standard', 'Renforcement'].includes(b.difficulte) ? b.difficulte : 'Standard' };
  };

  r.post('/notions/:id/exercices', (req, res) => {
    const n = notionDuFoyer(req);
    const v = lireExercice(req.body || {});
    const id = run(db, `INSERT INTO exercice (foyer_id, source, notion_id, titre, type, enonce, options_json, reponse, difficulte)
                        VALUES (?, 'foyer', ?, ?, ?, ?, ?, ?, ?)`, req.adulte.foyer_id, n.id, v.titre, v.type, v.enonce, v.options, v.reponse, v.difficulte).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  const exerciceDuFoyer = (req) => {
    const e = get(db, 'SELECT * FROM exercice WHERE id = ? AND foyer_id = ?', Number(req.params.id), req.adulte.foyer_id);
    if (!e) throw bad('Les exercices du socle officiel se modifient dans Notion.');
    return e;
  };

  r.put('/exercices/:id', (req, res) => {
    const e = exerciceDuFoyer(req);
    const v = lireExercice({ ...e, options: JSON.parse(e.options_json), ...req.body });
    run(db, 'UPDATE exercice SET titre = ?, type = ?, enonce = ?, options_json = ?, reponse = ?, difficulte = ? WHERE id = ?',
      v.titre, v.type, v.enonce, v.options, v.reponse, v.difficulte, e.id);
    res.json({ ok: true });
  });

  r.delete('/exercices/:id', (req, res) => {
    const e = exerciceDuFoyer(req);
    run(db, 'DELETE FROM exercice WHERE id = ?', e.id);
    res.json({ ok: true });
  });

  // ───── Leitner, statistiques, export, synchronisation ─────
  r.get('/leitner', (_req, res) => res.json(boites(db)));

  r.get('/referentiel/stats', (req, res) => {
    res.json({
      par_matiere: all(db, `SELECT m.id, m.nom, m.couleur, n.niveau_code, COUNT(DISTINCT n.id) AS notions, COUNT(e.id) AS exercices
                            FROM notion n JOIN matiere m ON m.id = n.matiere_id LEFT JOIN exercice e ON e.notion_id = n.id AND e.actif = 1
                            WHERE n.actif = 1 AND (n.foyer_id IS NULL OR n.foyer_id = ?)
                            GROUP BY m.id, n.niveau_code ORDER BY m.ordre`, req.adulte.foyer_id),
      total: get(db, `SELECT (SELECT COUNT(*) FROM notion WHERE actif = 1 AND foyer_id IS NULL) AS notions,
                             (SELECT COUNT(*) FROM exercice WHERE actif = 1 AND foyer_id IS NULL) AS exercices,
                             (SELECT COUNT(*) FROM notion WHERE actif = 1 AND source = 'demo') AS demo`),
    });
  });

  r.get('/referentiel/export', (_req, res) => {
    const matieres = new Map(all(db, 'SELECT id, code FROM matiere').map((m) => [m.id, m.code]));
    const notions = all(db, 'SELECT * FROM notion WHERE foyer_id IS NULL AND actif = 1').map((n) => ({
      id: n.source_id, matiere: matieres.get(n.matiere_id), niveau: n.niveau_code, cycle: n.cycle, domaine: n.domaine,
      sous_domaine: n.sous_domaine, titre: n.titre, libelle_officiel: n.libelle_officiel, statut_type: n.statut_type,
      source_bo: n.source_bo, millesime: n.millesime, en_vigueur_depuis: n.en_vigueur_depuis, cours: n.cours_md,
      exercices: all(db, 'SELECT * FROM exercice WHERE notion_id = ? AND actif = 1', n.id).map((e) => ({
        id: e.source_id, titre: e.titre, type: e.type, enonce: e.enonce, options: JSON.parse(e.options_json), reponse: e.reponse, difficulte: e.difficulte,
      })),
    }));
    res.setHeader('Content-Disposition', 'attachment; filename="referentiel-scolario.json"');
    res.json({ exporte_le: new Date().toISOString(), leitner: boites(db), notions });
  });

  r.get('/referentiel/sync', (_req, res) => {
    const cfg = notionConfig();
    res.json({ configure: Boolean(cfg.token), intervalle_heures: cfg.intervalHeures, en_cours: syncEnCours(), derniere: derniereSync(db) });
  });

  r.post('/referentiel/sync', async (req, res) => {
    if (!notionConfig().token) throw bad('Synchronisation non configurée : définissez NOTION_TOKEN (voir README).');
    const promesse = synchroniser(db, { force: req.body?.force === true, declencheur: `manuel (${req.adulte.nom})` });
    promesse.catch((e) => console.error('[sync]', e.message));
    res.status(202).json({ ok: true, message: 'Synchronisation lancée' });
  });

  return r;
}

