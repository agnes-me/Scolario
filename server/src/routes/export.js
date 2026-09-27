// Export des données du foyer (JSON complet, ou CSV table par table).
import { Router } from 'express';
import { all } from '../db.js';
import { bad } from './common.js';

// table → requête limitée au foyer (paramètre : foyer_id)
const TABLES = {
  enfants: 'SELECT e.*, n.code AS niveau FROM enfant e LEFT JOIN niveau n ON n.id = e.niveau_id WHERE e.foyer_id = ?',
  annees_scolaires: 'SELECT a.*, e.prenom, n.code AS niveau FROM annee_scolaire a JOIN enfant e ON e.id = a.enfant_id LEFT JOIN niveau n ON n.id = a.niveau_id WHERE e.foyer_id = ?',
  matieres_actives: 'SELECT em.enfant_id, e.prenom, m.nom AS matiere FROM enfant_matiere em JOIN enfant e ON e.id = em.enfant_id JOIN matiere m ON m.id = em.matiere_id WHERE e.foyer_id = ?',
  observations: `SELECT o.id, o.enfant_id, e.prenom, o.notion_id, n.titre AS notion, n.niveau_code, m.nom AS matiere, o.statut, o.date, o.commentaire, a.nom AS adulte
                 FROM observation o JOIN enfant e ON e.id = o.enfant_id JOIN notion n ON n.id = o.notion_id JOIN matiere m ON m.id = n.matiere_id
                 LEFT JOIN adulte a ON a.id = o.adulte_id WHERE e.foyer_id = ?`,
  tentatives: `SELECT t.id, t.enfant_id, e.prenom, t.notion_id, n.titre AS notion, t.exercice_id, x.titre AS exercice, t.date, t.reussite, t.reponse_donnee,
                 t.compte_leitner, t.boite_avant, t.boite_apres, t.corrigee_parent
               FROM tentative t JOIN enfant e ON e.id = t.enfant_id JOIN notion n ON n.id = t.notion_id JOIN exercice x ON x.id = t.exercice_id WHERE e.foyer_id = ?`,
  planification: `SELECT p.*, e.prenom, n.titre AS notion FROM planification p JOIN enfant e ON e.id = p.enfant_id JOIN notion n ON n.id = p.notion_id WHERE e.foyer_id = ?`,
  alertes: 'SELECT al.*, e.prenom FROM alerte al JOIN enfant e ON e.id = al.enfant_id WHERE e.foyer_id = ?',
  elements_libres: 'SELECT el.*, e.prenom, m.nom AS matiere FROM element_libre el JOIN enfant e ON e.id = el.enfant_id LEFT JOIN matiere m ON m.id = el.matiere_id WHERE e.foyer_id = ?',
  notes: 'SELECT ns.*, e.prenom, m.nom AS matiere FROM note_scolaire ns JOIN enfant e ON e.id = ns.enfant_id LEFT JOIN matiere m ON m.id = ns.matiere_id WHERE e.foyer_id = ?',
  fluence: 'SELECT f.*, e.prenom FROM mesure_fluence f JOIN enfant e ON e.id = f.enfant_id WHERE e.foyer_id = ?',
  ecrit: 'SELECT ev.*, e.prenom FROM evaluation_ecrit ev JOIN enfant e ON e.id = ev.enfant_id WHERE e.foyer_id = ?',
  points: `SELECT p.*, e.prenom, c.libelle AS categorie, m.nom AS matiere FROM point p JOIN enfant e ON e.id = p.enfant_id
           LEFT JOIN categorie_point c ON c.id = p.categorie_id LEFT JOIN matiere m ON m.id = p.matiere_id WHERE e.foyer_id = ?`,
  regles_recompense: 'SELECT r.*, e.prenom FROM regle_recompense r JOIN enfant e ON e.id = r.enfant_id WHERE e.foyer_id = ?',
  recompenses: 'SELECT ro.*, e.prenom, r.libelle FROM recompense_obtenue ro JOIN enfant e ON e.id = ro.enfant_id JOIN regle_recompense r ON r.id = ro.regle_id WHERE e.foyer_id = ?',
  categories_points: 'SELECT * FROM categorie_point WHERE foyer_id = ?',
  catalogue_recompenses: 'SELECT * FROM recompense_catalogue WHERE foyer_id = ?',
  instruments: 'SELECT * FROM instrument WHERE foyer_id = ?',
  niveaux_instrument: 'SELECT n.* FROM niveau_instrument n JOIN instrument i ON i.id = n.instrument_id WHERE i.foyer_id = ?',
  morceaux: 'SELECT m.* FROM morceau m JOIN instrument i ON i.id = m.instrument_id WHERE i.foyer_id = ?',
  progression_morceaux: 'SELECT pm.*, e.prenom, m.titre FROM progression_morceau pm JOIN enfant e ON e.id = pm.enfant_id JOIN morceau m ON m.id = pm.morceau_id WHERE e.foyer_id = ?',
  matieres_foyer: 'SELECT * FROM matiere WHERE foyer_id = ?',
  notions_foyer: 'SELECT * FROM notion WHERE foyer_id = ?',
  exercices_foyer: 'SELECT * FROM exercice WHERE foyer_id = ?',
};

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Séparateur « ; » et BOM UTF-8 : ouverture directe dans un tableur réglé en français.
  return `﻿${cols.join(';')}\r\n${rows.map((r) => cols.map((c) => esc(r[c])).join(';')).join('\r\n')}\r\n`;
}

export default function exportRoutes(db) {
  const r = Router();

  r.get('/export/tables', (_req, res) => res.json(Object.keys(TABLES)));

  r.get('/export/json', (req, res) => {
    const out = { application: 'Scolario', exporte_le: new Date().toISOString(), foyer_id: req.adulte.foyer_id };
    for (const [nom, sql] of Object.entries(TABLES)) out[nom] = all(db, sql, req.adulte.foyer_id);
    res.setHeader('Content-Disposition', `attachment; filename="scolario-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(out);
  });

  r.get('/export/csv/:table', (req, res) => {
    const sql = TABLES[req.params.table];
    if (!sql) throw bad('Table inconnue');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scolario-${req.params.table}.csv"`);
    res.send(toCsv(all(db, sql, req.adulte.foyer_id)));
  });

  return r;
}
