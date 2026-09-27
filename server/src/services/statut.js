// Statut d'acquisition « effectif » d'une notion pour un enfant.
// On combine l'historique complet : dernière observation manuelle du parent et
// derniers tests (boîte Leitner). L'événement le plus récent l'emporte.
import { all } from '../db.js';

export const STATUTS = ['non_vu', 'en_cours', 'acquis', 'a_consolider'];

function statutDepuisTest(t) {
  if (!t) return null;
  if (t.boite_apres == null) return t.reussite ? 'en_cours' : 'a_consolider';
  if (!t.reussite && (t.boite_avant ?? 0) >= 4) return 'a_consolider';
  if (t.boite_apres >= 4) return 'acquis';
  return 'en_cours';
}

/**
 * Retourne une Map notion_id → { statut, date, source, boite, prochaine_echeance, derniere_obs, derniere_tentative }.
 * `notionIds` optionnel pour restreindre.
 */
export function statutsEnfant(db, enfantId) {
  const obs = all(db, `
    SELECT o.notion_id, o.statut, o.date, o.created_at FROM observation o
    WHERE o.enfant_id = ? AND o.id = (SELECT o2.id FROM observation o2 WHERE o2.enfant_id = o.enfant_id
      AND o2.notion_id = o.notion_id ORDER BY o2.date DESC, o2.id DESC LIMIT 1)`, enfantId);
  const tents = all(db, `
    SELECT t.notion_id, t.reussite, t.date, t.boite_avant, t.boite_apres FROM tentative t
    WHERE t.enfant_id = ? AND t.compte_leitner = 1 AND t.id = (SELECT t2.id FROM tentative t2
      WHERE t2.enfant_id = t.enfant_id AND t2.notion_id = t.notion_id AND t2.compte_leitner = 1 ORDER BY t2.date DESC, t2.id DESC LIMIT 1)`, enfantId);
  const plans = all(db, 'SELECT notion_id, boite, prochaine_echeance, derniere_verif FROM planification WHERE enfant_id = ?', enfantId);

  const res = new Map();
  const ensure = (id) => {
    if (!res.has(id)) res.set(id, { statut: 'non_vu', date: null, source: null, boite: null, prochaine_echeance: null });
    return res.get(id);
  };
  for (const p of plans) Object.assign(ensure(p.notion_id), { boite: p.boite, prochaine_echeance: p.prochaine_echeance, derniere_verif: p.derniere_verif });
  for (const o of obs) Object.assign(ensure(o.notion_id), { statut: o.statut, date: o.date, source: 'observation' });
  for (const t of tents) {
    const r = ensure(t.notion_id);
    const jourTest = t.date.slice(0, 10);
    if (!r.date || jourTest >= r.date) Object.assign(r, { statut: statutDepuisTest(t), date: jourTest, source: 'test' });
  }
  return res;
}

/** Agrégat par matière : nombre de notions par statut (pour les jauges). */
export function jauge(notions, statuts) {
  const c = { total: notions.length, non_vu: 0, en_cours: 0, acquis: 0, a_consolider: 0 };
  for (const n of notions) c[statuts.get(n.id)?.statut ?? 'non_vu']++;
  c.pourcentage = c.total ? Math.round((100 * c.acquis) / c.total) : null;
  return c;
}
