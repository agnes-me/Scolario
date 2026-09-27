import { Router } from 'express';
import { all, get, run } from '../db.js';
import { today } from '../dates.js';
import { bad, day, enfantDuFoyer, ligneDuFoyer, matiereVisible, notFound, str } from './common.js';
import { cloturerRegle, etatRegle } from '../services/recompenses.js';

export default function pointsRoutes(db) {
  const r = Router();
  const fid = (req) => req.adulte.foyer_id;

  // ───── Barème : catégories de motifs ─────
  r.get('/categories-points', (req, res) => res.json(all(db, 'SELECT * FROM categorie_point WHERE foyer_id = ? ORDER BY valeur_defaut DESC, libelle', fid(req))));

  r.post('/categories-points', (req, res) => {
    const { libelle, valeur_defaut } = req.body || {};
    if (!str(libelle) || !Number.isInteger(Number(valeur_defaut)) || Number(valeur_defaut) === 0) throw bad('Libellé et valeur (entier non nul) obligatoires');
    const id = run(db, 'INSERT INTO categorie_point (foyer_id, libelle, valeur_defaut) VALUES (?, ?, ?)', fid(req), str(libelle, 100), Number(valeur_defaut)).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  r.put('/categories-points/:id', (req, res) => {
    const c = get(db, 'SELECT * FROM categorie_point WHERE id = ? AND foyer_id = ?', Number(req.params.id), fid(req));
    if (!c) throw notFound();
    const b = req.body || {};
    run(db, 'UPDATE categorie_point SET libelle = ?, valeur_defaut = ?, actif = ? WHERE id = ?',
      str(b.libelle, 100) || c.libelle, Number(b.valeur_defaut) || c.valeur_defaut, b.actif === false ? 0 : 1, c.id);
    res.json({ ok: true });
  });

  r.delete('/categories-points/:id', (req, res) => {
    run(db, 'DELETE FROM categorie_point WHERE id = ? AND foyer_id = ?', Number(req.params.id), fid(req));
    res.json({ ok: true });
  });

  // ───── Catalogue de récompenses ─────
  r.get('/catalogue-recompenses', (req, res) => res.json(all(db, 'SELECT * FROM recompense_catalogue WHERE foyer_id = ? ORDER BY libelle', fid(req))));

  r.post('/catalogue-recompenses', (req, res) => {
    if (!str(req.body?.libelle)) throw bad('Libellé obligatoire');
    const id = run(db, 'INSERT INTO recompense_catalogue (foyer_id, libelle, description) VALUES (?, ?, ?)', fid(req), str(req.body.libelle, 100), str(req.body.description, 500)).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  r.put('/catalogue-recompenses/:id', (req, res) => {
    const c = get(db, 'SELECT * FROM recompense_catalogue WHERE id = ? AND foyer_id = ?', Number(req.params.id), fid(req));
    if (!c) throw notFound();
    run(db, 'UPDATE recompense_catalogue SET libelle = ?, description = ? WHERE id = ?', str(req.body?.libelle, 100) || c.libelle, str(req.body?.description, 500), c.id);
    res.json({ ok: true });
  });

  r.delete('/catalogue-recompenses/:id', (req, res) => {
    run(db, 'DELETE FROM recompense_catalogue WHERE id = ? AND foyer_id = ?', Number(req.params.id), fid(req));
    res.json({ ok: true });
  });

  // ───── Points ─────
  r.get('/enfants/:id/points', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    res.json({
      solde: get(db, 'SELECT COALESCE(SUM(valeur), 0) AS s FROM point WHERE enfant_id = ?', e.id).s,
      points: all(db, `SELECT p.*, c.libelle AS categorie, m.nom AS matiere, a.nom AS adulte FROM point p
                       LEFT JOIN categorie_point c ON c.id = p.categorie_id LEFT JOIN matiere m ON m.id = p.matiere_id
                       LEFT JOIN adulte a ON a.id = p.adulte_id WHERE p.enfant_id = ? ORDER BY p.date DESC, p.id DESC LIMIT ?`, e.id, Number(req.query.limite) || 300),
    });
  });

  r.post('/enfants/:id/points', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const b = req.body || {};
    const cat = b.categorie_id ? get(db, 'SELECT * FROM categorie_point WHERE id = ? AND foyer_id = ?', Number(b.categorie_id), fid(req)) : null;
    const valeur = b.valeur != null && b.valeur !== '' ? Number(b.valeur) : cat?.valeur_defaut;
    if (!Number.isInteger(valeur) || valeur === 0) throw bad('Valeur de point invalide');
    if (!cat && !str(b.motif)) throw bad('Indiquez un motif ou une catégorie');
    const m = matiereVisible(db, req, b.matiere_id);
    const id = run(db, 'INSERT INTO point (enfant_id, date, valeur, motif, categorie_id, matiere_id, adulte_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      e.id, day(b.date, today()), valeur, str(b.motif, 300), cat?.id ?? null, m?.id ?? null, req.adulte.id).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  r.delete('/points/:id', (req, res) => {
    const p = ligneDuFoyer(db, req, 'point', req.params.id);
    run(db, 'DELETE FROM point WHERE id = ?', p.id);
    res.json({ ok: true });
  });

  // ───── Règles de récompense périodiques ─────
  const lireRegle = (req, b, prev = {}) => {
    const v = { ...prev, ...b };
    if (!['semaine', 'mois', 'trimestre'].includes(v.periodicite)) throw bad('Périodicité invalide');
    if (!Number.isInteger(Number(v.seuil))) throw bad('Seuil invalide');
    if (!['zero', 'surplus', 'pourcentage'].includes(v.mode_report)) v.mode_report = 'zero';
    const cat = v.catalogue_id ? get(db, 'SELECT * FROM recompense_catalogue WHERE id = ? AND foyer_id = ?', Number(v.catalogue_id), fid(req)) : null;
    return {
      libelle: str(v.libelle, 100) || `Palier ${v.periodicite === 'semaine' ? 'hebdomadaire' : v.periodicite === 'mois' ? 'mensuel' : 'trimestriel'}`,
      periodicite: v.periodicite, seuil: Number(v.seuil), recompense: str(v.recompense, 300) || cat?.libelle || null, catalogue_id: cat?.id ?? null,
      mode_report: v.mode_report, report_pourcent: Math.min(100, Math.max(0, Number(v.report_pourcent) || 0)),
      date_debut: day(v.date_debut, today()), actif: v.actif === false || v.actif === 0 ? 0 : 1,
    };
  };

  r.get('/enfants/:id/regles', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    res.json({
      regles: all(db, 'SELECT * FROM regle_recompense WHERE enfant_id = ? ORDER BY actif DESC, periodicite, id', e.id).map((rg) => etatRegle(db, rg)),
      historique: all(db, `SELECT ro.*, rg.libelle, rg.recompense, rg.seuil, a.nom AS valide_par_nom FROM recompense_obtenue ro
                           JOIN regle_recompense rg ON rg.id = ro.regle_id LEFT JOIN adulte a ON a.id = ro.valide_par
                           WHERE ro.enfant_id = ? ORDER BY ro.periode_fin DESC LIMIT 200`, e.id),
    });
  });

  r.post('/enfants/:id/regles', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const v = lireRegle(req, req.body || {});
    const id = run(db, `INSERT INTO regle_recompense (enfant_id, libelle, periodicite, seuil, recompense, catalogue_id, mode_report, report_pourcent, date_debut, actif)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, e.id, v.libelle, v.periodicite, v.seuil, v.recompense, v.catalogue_id, v.mode_report, v.report_pourcent, v.date_debut, v.actif).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  r.put('/regles/:id', (req, res) => {
    const rg = ligneDuFoyer(db, req, 'regle_recompense', req.params.id);
    const v = lireRegle(req, req.body || {}, rg);
    run(db, `UPDATE regle_recompense SET libelle = ?, periodicite = ?, seuil = ?, recompense = ?, catalogue_id = ?, mode_report = ?, report_pourcent = ?, date_debut = ?, actif = ? WHERE id = ?`,
      v.libelle, v.periodicite, v.seuil, v.recompense, v.catalogue_id, v.mode_report, v.report_pourcent, v.date_debut, v.actif, rg.id);
    if (v.actif) cloturerRegle(db, { ...rg, ...v });
    res.json({ ok: true });
  });

  r.delete('/regles/:id', (req, res) => {
    const rg = ligneDuFoyer(db, req, 'regle_recompense', req.params.id);
    run(db, 'DELETE FROM regle_recompense WHERE id = ?', rg.id);
    res.json({ ok: true });
  });

  /** Validation par le parent du calcul automatique de fin de période. */
  r.post('/recompenses/:id/valider', (req, res) => {
    const ro = ligneDuFoyer(db, req, 'recompense_obtenue', req.params.id);
    const statut = req.body?.statut;
    if (!['obtenue', 'non_obtenue', 'a_valider'].includes(statut)) throw bad('Statut invalide');
    run(db, 'UPDATE recompense_obtenue SET statut = ?, valide_par = ?, date_validation = ? WHERE id = ?',
      statut, statut === 'a_valider' ? null : req.adulte.id, statut === 'a_valider' ? null : new Date().toISOString(), ro.id);
    res.json({ ok: true });
  });

  return r;
}
