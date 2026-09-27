import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { addDays, today } from '../dates.js';
import { bad, day, enfantDuFoyer, ligneDuFoyer, matiereVisible, notFound, notionVisible, str } from './common.js';
import { STATUTS, jauge, statutsEnfant } from '../services/statut.js';
import { appliquerResultat, boites, choisirExercice, inscrire, notionsDues, requalifierEchecDuJour } from '../services/leitner.js';
import { checkAnswer } from '../services/answer.js';
import { etatRegle } from '../services/recompenses.js';

/** Notions actives d'une matière pour un niveau (ou tous niveaux si niveau = null). */
function notionsMatiere(db, foyerId, matiereId, niveauCode) {
  return all(db, `SELECT n.id, n.titre, n.niveau_code, n.domaine, n.sous_domaine, n.libelle_officiel, n.statut_type, n.foyer_id,
                    (SELECT COUNT(*) FROM exercice e WHERE e.notion_id = n.id AND e.actif = 1) AS nb_exercices,
                    (n.cours_md IS NOT NULL AND n.cours_md <> '') AS a_cours
                  FROM notion n LEFT JOIN niveau nv ON nv.code = n.niveau_code AND nv.foyer_id IS NULL
                  WHERE n.matiere_id = ? AND n.actif = 1 AND (n.foyer_id IS NULL OR n.foyer_id = ?)
                    ${niveauCode ? 'AND (n.niveau_code = ? OR n.niveau_code IS NULL)' : ''}
                  ORDER BY nv.ordre, n.domaine, n.sous_domaine, n.titre`, ...(niveauCode ? [matiereId, foyerId, niveauCode] : [matiereId, foyerId]));
}

/** Question présentée au parent qui fait réciter l'enfant (réponse attendue incluse). */
function question(db, ex) {
  const n = get(db, 'SELECT id, titre, cours_md, matiere_id FROM notion WHERE id = ?', ex.notion_id);
  return {
    exercice_id: ex.id, notion_id: n.id, notion_titre: n.titre, cours_md: n.cours_md, type: ex.type, enonce: ex.enonce,
    options: JSON.parse(ex.options_json), difficulte: ex.difficulte, reponse: ex.reponse,
  };
}

export default function suiviRoutes(db) {
  const r = Router();

  // ───── Synthèse enfant (tableau de bord) ─────
  r.get('/enfants/:id/synthese', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const statuts = statutsEnfant(db, e.id);
    const matieres = all(db, `SELECT m.* FROM matiere m JOIN enfant_matiere em ON em.matiere_id = m.id WHERE em.enfant_id = ? ORDER BY m.ordre, m.nom`, e.id)
      .map((m) => {
        const notions = notionsMatiere(db, req.adulte.foyer_id, m.id, e.niveau_code);
        const derniere = get(db, 'SELECT note, note_max, intitule, date FROM note_scolaire WHERE enfant_id = ? AND matiere_id = ? ORDER BY date DESC LIMIT 1', e.id, m.id);
        return { ...m, jauge: jauge(notions, statuts), derniere_note: derniere };
      });
    const regles = all(db, 'SELECT * FROM regle_recompense WHERE enfant_id = ? AND actif = 1', e.id).map((rg) => etatRegle(db, rg));
    res.json({
      enfant: e,
      matieres,
      solde_points: get(db, 'SELECT COALESCE(SUM(valeur), 0) AS s FROM point WHERE enfant_id = ?', e.id).s,
      points_semaine: get(db, 'SELECT COALESCE(SUM(valeur), 0) AS s FROM point WHERE enfant_id = ? AND date >= ?', e.id, addDays(today(), -6)).s,
      regles,
      revisions_dues: notionsDues(db, e.id),
      alertes: all(db, 'SELECT * FROM alerte WHERE enfant_id = ? AND lue = 0 ORDER BY date DESC', e.id),
      recompenses_a_valider: all(db, `SELECT ro.*, rg.libelle, rg.recompense, rg.seuil FROM recompense_obtenue ro JOIN regle_recompense rg ON rg.id = ro.regle_id
                                      WHERE ro.enfant_id = ? AND ro.statut = 'a_valider' ORDER BY ro.periode_fin`, e.id),
      elements_en_cours: all(db, "SELECT * FROM element_libre WHERE enfant_id = ? AND statut <> 'fait' ORDER BY echeance IS NULL, echeance LIMIT 8", e.id),
      derniere_fluence: get(db, 'SELECT * FROM mesure_fluence WHERE enfant_id = ? ORDER BY date DESC LIMIT 1', e.id),
      leitner: all(db, 'SELECT boite, COUNT(*) AS nb FROM planification WHERE enfant_id = ? GROUP BY boite ORDER BY boite', e.id),
    });
  });

  // ───── Vue détaillée par matière ─────
  r.get('/enfants/:id/matieres/:matiereId', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const m = matiereVisible(db, req, req.params.matiereId);
    const niveau = req.query.niveau === 'tous' ? null : (req.query.niveau || e.niveau_code);
    const statuts = statutsEnfant(db, e.id);
    const notions = notionsMatiere(db, req.adulte.foyer_id, m.id, niveau).map((n) => ({ ...n, suivi: statuts.get(n.id) || { statut: 'non_vu' } }));
    const niveauxDispo = all(db, `SELECT DISTINCT n.niveau_code FROM notion n LEFT JOIN niveau nv ON nv.code = n.niveau_code AND nv.foyer_id IS NULL
                                  WHERE n.matiere_id = ? AND n.actif = 1 AND (n.foyer_id IS NULL OR n.foyer_id = ?) AND n.niveau_code IS NOT NULL
                                  ORDER BY nv.ordre`, m.id, req.adulte.foyer_id).map((x) => x.niveau_code);

    // Progression dans le temps : nombre de notions « acquises » (tous niveaux) à la fin de chaque mois.
    const evenements = [
      ...all(db, `SELECT o.notion_id, o.date AS d, o.statut FROM observation o JOIN notion n ON n.id = o.notion_id WHERE o.enfant_id = ? AND n.matiere_id = ?`, e.id, m.id),
      ...all(db, `SELECT t.notion_id, substr(t.date, 1, 10) AS d, CASE WHEN t.boite_apres >= 4 THEN 'acquis' WHEN t.reussite = 0 AND t.boite_avant >= 4 THEN 'a_consolider' ELSE 'en_cours' END AS statut
                  FROM tentative t JOIN notion n ON n.id = t.notion_id WHERE t.enfant_id = ? AND n.matiere_id = ? AND t.compte_leitner = 1`, e.id, m.id),
    ].sort((a, b) => a.d.localeCompare(b.d));
    const courant = new Map();
    const serie = [];
    for (const ev of evenements) {
      courant.set(ev.notion_id, ev.statut);
      const mois = ev.d.slice(0, 7);
      const acquis = [...courant.values()].filter((s) => s === 'acquis').length;
      if (serie.at(-1)?.mois === mois) serie.at(-1).acquis = acquis; else serie.push({ mois, acquis });
    }

    res.json({
      matiere: m,
      niveau,
      niveaux_disponibles: niveauxDispo,
      notions,
      jauge: jauge(notions, statuts),
      progression: serie,
      notes: all(db, 'SELECT * FROM note_scolaire WHERE enfant_id = ? AND matiere_id = ? ORDER BY date DESC LIMIT 20', e.id, m.id),
      elements: all(db, 'SELECT * FROM element_libre WHERE enfant_id = ? AND matiere_id = ? ORDER BY created_at DESC', e.id, m.id),
      dernieres_observations: all(db, `SELECT o.*, n.titre FROM observation o JOIN notion n ON n.id = o.notion_id
                                       WHERE o.enfant_id = ? AND n.matiere_id = ? ORDER BY o.date DESC, o.id DESC LIMIT 10`, e.id, m.id),
    });
  });

  // ───── Observations manuelles (historique, jamais écrasé) ─────
  r.post('/enfants/:id/observations', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const b = req.body || {};
    const ids = Array.isArray(b.notion_ids) ? b.notion_ids : [b.notion_id];
    if (!STATUTS.includes(b.statut)) throw bad('Statut invalide');
    const jour = day(b.date, today());
    tx(db, () => {
      for (const nid of ids) {
        const n = notionVisible(db, req, nid);
        run(db, 'INSERT INTO observation (enfant_id, notion_id, statut, date, commentaire, adulte_id) VALUES (?, ?, ?, ?, ?, ?)',
          e.id, n.id, b.statut, jour, str(b.commentaire, 2000), req.adulte.id);
        // Une notion jugée acquise entre en réactivation pour vérifier la rétention.
        if (b.statut === 'acquis' && get(db, 'SELECT 1 FROM exercice WHERE notion_id = ? AND actif = 1', n.id)) inscrire(db, e.id, n.id, 3, jour);
        if (b.statut === 'a_consolider') {
          run(db, `UPDATE planification SET boite = 1, prochaine_echeance = ? WHERE enfant_id = ? AND notion_id = ?`, addDays(jour, 1), e.id, n.id);
        }
      }
    });
    res.status(201).json({ ok: true });
  });

  r.delete('/observations/:id', (req, res) => {
    const o = ligneDuFoyer(db, req, 'observation', req.params.id);
    run(db, 'DELETE FROM observation WHERE id = ?', o.id);
    res.json({ ok: true });
  });

  // ───── Tests et révisions ─────
  r.get('/enfants/:id/revisions', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const jour = today();
    res.json({
      dues: notionsDues(db, e.id, jour),
      a_venir: all(db, `SELECT p.*, n.titre, m.nom AS matiere_nom FROM planification p JOIN notion n ON n.id = p.notion_id AND n.actif = 1
                        JOIN matiere m ON m.id = n.matiere_id WHERE p.enfant_id = ? AND p.prochaine_echeance > ?
                        ORDER BY p.prochaine_echeance LIMIT 30`, e.id, jour),
      boites: boites(db).map((b) => ({ ...b, nb: get(db, 'SELECT COUNT(*) AS c FROM planification WHERE enfant_id = ? AND boite = ?', e.id, b.numero).c })),
      faites_aujourdhui: get(db, 'SELECT COUNT(*) AS c FROM tentative WHERE enfant_id = ? AND substr(date, 1, 10) = ?', e.id, jour).c,
    });
  });

  /**
   * Prépare une série de questions (sans les réponses) :
   * - mode « revisions » : une question par notion arrivée à échéance ;
   * - mode « notion » : plusieurs exercices de formats variés sur une notion ;
   * - mode « matiere » : un exercice par notion du niveau non encore acquise.
   */
  r.post('/enfants/:id/session', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const { mode = 'revisions', notion_id, matiere_id, limite = 10 } = req.body || {};
    const max = Math.min(Math.max(Number(limite) || 10, 1), 30);
    const questions = [];
    if (mode === 'notion') {
      const n = notionVisible(db, req, notion_id);
      const vus = [];
      for (let i = 0; i < max; i++) {
        const ex = choisirExercice(db, e.id, n.id, vus);
        if (!ex) break;
        vus.push(ex.id);
        questions.push(question(db, ex));
      }
    } else if (mode === 'matiere') {
      const m = matiereVisible(db, req, matiere_id);
      const statuts = statutsEnfant(db, e.id);
      const notions = notionsMatiere(db, req.adulte.foyer_id, m.id, e.niveau_code).filter((n) => n.nb_exercices > 0 && statuts.get(n.id)?.statut !== 'acquis');
      for (const n of notions.slice(0, max)) {
        const ex = choisirExercice(db, e.id, n.id);
        if (ex) questions.push(question(db, ex));
      }
    } else {
      for (const n of notionsDues(db, e.id).slice(0, max)) {
        const ex = choisirExercice(db, e.id, n.notion_id);
        if (ex) questions.push(question(db, ex));
      }
    }
    res.json({ questions });
  });

  /** Enregistre une réponse : correction automatique, historique, évolution de la boîte Leitner. */
  r.post('/enfants/:id/reponses', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const ex = get(db, 'SELECT * FROM exercice WHERE id = ? AND (foyer_id IS NULL OR foyer_id = ?)', Number(req.body?.exercice_id), req.adulte.foyer_id);
    if (!ex) throw notFound('Exercice introuvable');
    const donnee = str(req.body?.reponse, 1000) ?? '';
    // Le parent qui fait réciter l'enfant juge lui-même (reussite: true/false) ;
    // sinon, correction automatique d'une réponse saisie.
    const reussite = typeof req.body?.reussite === 'boolean' ? req.body.reussite : checkAnswer(ex, donnee);
    const out = tx(db, () => {
      let lv = appliquerResultat(db, e.id, ex.notion_id, reussite);
      if (!lv.compte && !reussite) lv = requalifierEchecDuJour(db, e.id, ex.notion_id) || lv;
      const id = Number(run(db, `INSERT INTO tentative (enfant_id, exercice_id, notion_id, date, reussite, reponse_donnee, compte_leitner, boite_avant, boite_apres)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id, ex.id, ex.notion_id, new Date().toISOString(), reussite ? 1 : 0, donnee, lv.compte ? 1 : 0, lv.boiteAvant, lv.boiteApres).lastInsertRowid);
      return { tentative_id: id, ...lv };
    });
    res.json({ reussite, reponse_attendue: ex.reponse, ...out });
  });

  /** Le parent requalifie une réponse jugée fausse (faute de frappe, variante acceptable…). */
  r.post('/tentatives/:id/valider', (req, res) => {
    const t = ligneDuFoyer(db, req, 'tentative', req.params.id);
    if (t.reussite) return res.json({ ok: true });
    tx(db, () => {
      run(db, 'UPDATE tentative SET reussite = 1, corrigee_parent = 1 WHERE id = ?', t.id);
      if (t.compte_leitner) {
        const cfg = boites(db);
        const max = cfg.at(-1)?.numero ?? 5;
        const boite = t.boite_avant == null ? 2 : Math.min(t.boite_avant + 1, max);
        const jour = t.date.slice(0, 10);
        const intervalle = cfg.find((b) => b.numero === boite)?.intervalle_jours ?? 1;
        run(db, 'UPDATE tentative SET boite_apres = ? WHERE id = ?', boite, t.id);
        run(db, 'UPDATE planification SET boite = ?, prochaine_echeance = ? WHERE enfant_id = ? AND notion_id = ?', boite, addDays(jour, intervalle), t.enfant_id, t.notion_id);
        run(db, "DELETE FROM alerte WHERE enfant_id = ? AND notion_id = ? AND type = 'regression' AND date = ?", t.enfant_id, t.notion_id, jour);
      }
    });
    res.json({ ok: true });
  });

  r.post('/enfants/:id/planification/:notionId', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const n = notionVisible(db, req, req.params.notionId);
    if (req.body?.retirer) {
      run(db, 'DELETE FROM planification WHERE enfant_id = ? AND notion_id = ?', e.id, n.id);
    } else {
      run(db, `INSERT INTO planification (enfant_id, notion_id, boite, derniere_verif, prochaine_echeance) VALUES (?, ?, 1, NULL, ?)
               ON CONFLICT(enfant_id, notion_id) DO UPDATE SET prochaine_echeance = excluded.prochaine_echeance`, e.id, n.id, today());
    }
    res.json({ ok: true });
  });

  // ───── Alertes ─────
  r.get('/enfants/:id/alertes', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    res.json(all(db, 'SELECT * FROM alerte WHERE enfant_id = ? ORDER BY lue, date DESC, id DESC LIMIT 100', e.id));
  });

  r.post('/alertes/:id/lue', (req, res) => {
    const a = ligneDuFoyer(db, req, 'alerte', req.params.id);
    run(db, 'UPDATE alerte SET lue = 1 WHERE id = ?', a.id);
    res.json({ ok: true });
  });

  // ───── Journal (historique consolidé) ─────
  r.get('/enfants/:id/journal', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const lim = 150;
    const items = [
      ...all(db, `SELECT 'observation' AS type, o.date, n.titre AS libelle, o.statut AS detail, o.commentaire, a.nom AS auteur FROM observation o
                  JOIN notion n ON n.id = o.notion_id LEFT JOIN adulte a ON a.id = o.adulte_id WHERE o.enfant_id = ? ORDER BY o.date DESC LIMIT ?`, e.id, lim),
      ...all(db, `SELECT 'tests' AS type, substr(t.date, 1, 10) AS date, n.titre AS libelle,
                    SUM(t.reussite) || '/' || COUNT(*) || ' réussi(s)' AS detail, NULL AS commentaire, NULL AS auteur
                  FROM tentative t JOIN notion n ON n.id = t.notion_id WHERE t.enfant_id = ?
                  GROUP BY substr(t.date, 1, 10), t.notion_id ORDER BY date DESC LIMIT ?`, e.id, lim),
      ...all(db, `SELECT 'point' AS type, p.date, COALESCE(p.motif, c.libelle, 'Point') AS libelle, (CASE WHEN p.valeur > 0 THEN '+' ELSE '' END) || p.valeur AS detail,
                    NULL AS commentaire, a.nom AS auteur FROM point p LEFT JOIN categorie_point c ON c.id = p.categorie_id LEFT JOIN adulte a ON a.id = p.adulte_id
                  WHERE p.enfant_id = ? ORDER BY p.date DESC LIMIT ?`, e.id, lim),
      ...all(db, `SELECT 'note' AS type, date, intitule AS libelle, note || '/' || note_max AS detail, appreciation AS commentaire, NULL AS auteur
                  FROM note_scolaire WHERE enfant_id = ? ORDER BY date DESC LIMIT ?`, e.id, lim),
      ...all(db, `SELECT 'fluence' AS type, date, 'Fluence' AS libelle, mots_par_minute || ' mots/min' AS detail, commentaire, NULL AS auteur
                  FROM mesure_fluence WHERE enfant_id = ? ORDER BY date DESC LIMIT ?`, e.id, lim),
      ...all(db, `SELECT 'musique' AS type, pm.date, m.titre AS libelle, pm.statut AS detail, pm.commentaire, NULL AS auteur
                  FROM progression_morceau pm JOIN morceau m ON m.id = pm.morceau_id WHERE pm.enfant_id = ? ORDER BY pm.date DESC LIMIT ?`, e.id, lim),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, lim);
    res.json(items);
  });

  return r;
}
