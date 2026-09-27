// Répétition espacée (Leitner à N boîtes, paramètres lus en base — synchronisés depuis Notion).
import { all, get, run } from '../db.js';
import { addDays, today } from '../dates.js';

export function boites(db) {
  return all(db, 'SELECT * FROM leitner_boite ORDER BY numero');
}

/**
 * Applique le résultat d'un test à la planification d'une notion.
 * - Notion jamais testée ou échéance atteinte : la boîte évolue (succès : +1, échec : retour boîte 1).
 * - Sinon (entraînement libre avant l'échéance) : la tentative est seulement journalisée.
 * Retourne { compte, boiteAvant, boiteApres, alerte }.
 */
export function appliquerResultat(db, enfantId, notionId, reussite, jour = today()) {
  const cfg = boites(db);
  const max = cfg.at(-1)?.numero ?? 5;
  const byNum = new Map(cfg.map((b) => [b.numero, b]));
  const plan = get(db, 'SELECT * FROM planification WHERE enfant_id = ? AND notion_id = ?', enfantId, notionId);

  if (plan && plan.prochaine_echeance > jour) {
    return { compte: false, boiteAvant: plan.boite, boiteApres: plan.boite, alerte: false };
  }

  const avant = plan?.boite ?? null;
  let apres;
  let alerte = false;
  if (reussite) {
    apres = avant === null ? 2 : Math.min(avant + 1, max);
  } else {
    apres = 1;
    if (avant !== null && byNum.get(avant)?.alerte_parent) alerte = true;
  }
  const intervalle = byNum.get(apres)?.intervalle_jours ?? 1;
  const prochaine = addDays(jour, intervalle);

  run(db, `INSERT INTO planification (enfant_id, notion_id, boite, derniere_verif, prochaine_echeance)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(enfant_id, notion_id) DO UPDATE SET boite = excluded.boite,
             derniere_verif = excluded.derniere_verif, prochaine_echeance = excluded.prochaine_echeance`,
    enfantId, notionId, apres, jour, prochaine);

  if (alerte) {
    const n = get(db, 'SELECT titre FROM notion WHERE id = ?', notionId);
    run(db, 'INSERT INTO alerte (enfant_id, notion_id, type, message, date) VALUES (?, ?, ?, ?, ?)',
      enfantId, notionId, 'regression',
      `Oubli détecté : « ${n?.titre} » était en boîte ${avant} (acquis solide) et a été raté. Retour en boîte 1.`, jour);
  }
  return { compte: true, boiteAvant: avant, boiteApres: apres, alerte };
}

/**
 * Plusieurs questions sur une même notion le même jour : la notion n'avance que si toutes
 * sont réussies. Si une question est ratée après une réussite déjà comptée aujourd'hui,
 * on rejoue le résultat du jour comme un échec (retour en boîte 1 depuis la boîte d'origine).
 * Retourne le résultat Leitner à enregistrer sur la tentative, ou null si rien à faire.
 */
export function requalifierEchecDuJour(db, enfantId, notionId, jour = today()) {
  const comptee = get(db, `SELECT * FROM tentative WHERE enfant_id = ? AND notion_id = ? AND compte_leitner = 1
                           AND substr(date, 1, 10) = ? ORDER BY id DESC LIMIT 1`, enfantId, notionId, jour);
  if (!comptee || !comptee.reussite) return null;
  const avant = comptee.boite_avant;
  const cfg = boites(db);
  const intervalle = cfg.find((b) => b.numero === 1)?.intervalle_jours ?? 1;
  run(db, 'UPDATE planification SET boite = 1, derniere_verif = ?, prochaine_echeance = ? WHERE enfant_id = ? AND notion_id = ?',
    jour, addDays(jour, intervalle), enfantId, notionId);
  const alerte = avant != null && Boolean(cfg.find((b) => b.numero === avant)?.alerte_parent);
  if (alerte) {
    const n = get(db, 'SELECT titre FROM notion WHERE id = ?', notionId);
    run(db, 'INSERT INTO alerte (enfant_id, notion_id, type, message, date) VALUES (?, ?, ?, ?, ?)', enfantId, notionId, 'regression',
      `Oubli détecté : « ${n?.titre} » était en boîte ${avant} (acquis solide) et a été raté. Retour en boîte 1.`, jour);
  }
  return { compte: true, boiteAvant: avant, boiteApres: 1, alerte };
}

/** Inscrit une notion en réactivation (ex. marquée « acquise » par le parent) si elle ne l'est pas déjà. */
export function inscrire(db, enfantId, notionId, boite = 1, jour = today()) {
  const cfg = boites(db);
  const intervalle = cfg.find((b) => b.numero === boite)?.intervalle_jours ?? 1;
  run(db, `INSERT INTO planification (enfant_id, notion_id, boite, derniere_verif, prochaine_echeance)
           VALUES (?, ?, ?, ?, ?) ON CONFLICT(enfant_id, notion_id) DO NOTHING`,
    enfantId, notionId, boite, jour, addDays(jour, intervalle));
}

/** Notions à réviser aujourd'hui (échéance atteinte) disposant d'au moins un exercice actif. */
export function notionsDues(db, enfantId, jour = today()) {
  return all(db, `
    SELECT p.*, n.titre, n.niveau_code, n.matiere_id, m.nom AS matiere_nom, m.couleur AS matiere_couleur
    FROM planification p
    JOIN notion n ON n.id = p.notion_id AND n.actif = 1
    JOIN matiere m ON m.id = n.matiere_id
    WHERE p.enfant_id = ? AND p.prochaine_echeance <= ?
      AND EXISTS (SELECT 1 FROM exercice e WHERE e.notion_id = n.id AND e.actif = 1)
    ORDER BY p.prochaine_echeance, p.boite`, enfantId, jour);
}

/**
 * Choisit un exercice pour une notion : on privilégie l'exercice le moins récemment tenté
 * par l'enfant (et jamais tenté en priorité), pour varier les formats.
 */
export function choisirExercice(db, enfantId, notionId, exclure = []) {
  const rows = all(db, `
    SELECT e.*, (SELECT MAX(t.date) FROM tentative t WHERE t.exercice_id = e.id AND t.enfant_id = ?) AS derniere
    FROM exercice e WHERE e.notion_id = ? AND e.actif = 1`, enfantId, notionId)
    .filter((e) => !exclure.includes(e.id));
  if (!rows.length) return null;
  rows.sort((a, b) => (a.derniere ?? '') < (b.derniere ?? '') ? -1 : (a.derniere ?? '') > (b.derniere ?? '') ? 1 : Math.random() - 0.5);
  return rows[0];
}
