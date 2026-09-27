// Récompenses périodiques : calcul automatique des périodes échues, soumis à validation du parent.
import { all, get, run } from '../db.js';
import { addDays, periode, today } from '../dates.js';

function pointsEntre(db, enfantId, debut, fin) {
  return get(db, 'SELECT COALESCE(SUM(valeur), 0) AS s FROM point WHERE enfant_id = ? AND date BETWEEN ? AND ?', enfantId, debut, fin).s;
}

function reportSortant(regle, total, atteint) {
  if (regle.mode_report === 'surplus') return atteint ? Math.max(0, total - regle.seuil) : 0;
  if (regle.mode_report === 'pourcentage') return Math.max(0, Math.floor((total * regle.report_pourcent) / 100));
  return 0;
}

/** Report entrant pour la période commençant à `debut` (= report sortant de la période précédente clôturée). */
function reportEntrant(db, regle, debut) {
  const prev = get(db, 'SELECT report_sortant FROM recompense_obtenue WHERE regle_id = ? AND periode_fin = ?', regle.id, addDays(debut, -1));
  return prev?.report_sortant ?? 0;
}

/** Clôture toutes les périodes terminées (avant `jour`) non encore calculées pour une règle. */
export function cloturerRegle(db, regle, jour = today()) {
  const creees = [];
  let { debut, fin } = periode(regle.periodicite, regle.date_debut);
  // On ne recalcule pas ce qui existe déjà : on repart après la dernière période clôturée.
  const last = get(db, 'SELECT MAX(periode_fin) AS f FROM recompense_obtenue WHERE regle_id = ?', regle.id);
  if (last?.f) ({ debut, fin } = periode(regle.periodicite, addDays(last.f, 1)));
  let garde = 0;
  while (fin < jour && garde++ < 500) {
    const entrant = reportEntrant(db, regle, debut);
    const total = pointsEntre(db, regle.enfant_id, debut, fin) + entrant;
    const atteint = total >= regle.seuil;
    const sortant = reportSortant(regle, total, atteint);
    run(db, `INSERT OR IGNORE INTO recompense_obtenue (regle_id, enfant_id, periode_debut, periode_fin, points, report_entrant, report_sortant, atteint)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, regle.id, regle.enfant_id, debut, fin, total, entrant, sortant, atteint ? 1 : 0);
    creees.push({ debut, fin, total, atteint });
    ({ debut, fin } = periode(regle.periodicite, addDays(fin, 1)));
  }
  return creees;
}

export function cloturerTout(db, jour = today()) {
  const regles = all(db, 'SELECT r.* FROM regle_recompense r JOIN enfant e ON e.id = r.enfant_id WHERE r.actif = 1 AND e.archive = 0');
  let n = 0;
  for (const r of regles) n += cloturerRegle(db, r, jour).length;
  return n;
}

/** État courant d'une règle : période en cours, points accumulés (report inclus), progression. */
export function etatRegle(db, regle, jour = today()) {
  const { debut, fin } = periode(regle.periodicite, jour < regle.date_debut ? regle.date_debut : jour);
  const entrant = reportEntrant(db, regle, debut);
  const points = pointsEntre(db, regle.enfant_id, debut, fin) + entrant;
  return {
    ...regle,
    periode_debut: debut,
    periode_fin: fin,
    report_entrant: entrant,
    points,
    progression: regle.seuil > 0 ? Math.min(100, Math.round((100 * Math.max(0, points)) / regle.seuil)) : 100,
    atteint: points >= regle.seuil,
  };
}
