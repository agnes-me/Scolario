// Données de référence initiales. Tout reste modifiable ensuite (sauf le socle officiel,
// qui est remplacé par la synchronisation Notion).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const NIVEAUX = [
  ['PS', 'Petite section', 'Cycle 1'], ['MS', 'Moyenne section', 'Cycle 1'], ['GS', 'Grande section', 'Cycle 1'],
  ['CP', 'CP', 'Cycle 2'], ['CE1', 'CE1', 'Cycle 2'], ['CE2', 'CE2', 'Cycle 2'],
  ['CM1', 'CM1', 'Cycle 3'], ['CM2', 'CM2', 'Cycle 3'], ['6e', 'Sixième', 'Cycle 3'],
  ['5e', 'Cinquième', 'Cycle 4'], ['4e', 'Quatrième', 'Cycle 4'], ['3e', 'Troisième', 'Cycle 4'],
  ['2de', 'Seconde', 'Lycée'], ['1re', 'Première', 'Lycée'], ['Tle', 'Terminale', 'Lycée'],
];

// [code, nom, type, couleur, ordre, niveau_min, niveau_max]
export const MATIERES = [
  ['francais', 'Français', 'coeur', '#2f6fdb', 1, 'PS', null],
  ['maths', 'Mathématiques', 'coeur', '#1a9a5b', 2, 'PS', null],
  ['sciences', 'Sciences', 'coeur', '#8a4fd1', 3, 'PS', null],
  ['anglais', 'Anglais', 'coeur', '#e07b18', 4, 'CP', null],
  ['histoire_geo', 'Histoire-géographie', 'allegee', '#8d6e4f', 10, 'CE1', null],
  ['emc', 'EMC', 'allegee', '#c9a100', 11, 'CP', null],
  ['eps', 'EPS', 'allegee', '#6b7785', 12, 'PS', null],
  ['arts', 'Arts (plastiques et musique scolaire)', 'allegee', '#d64f93', 13, 'PS', null],
  ['techno', 'Technologie', 'allegee', '#3a8f9e', 14, '5e', '3e'],
  ['philosophie', 'Philosophie', 'allegee', '#555a99', 15, 'Tle', 'Tle'],
  ['latin', 'Latin', 'optionnelle', '#b03a2e', 20, '5e', null],
  ['grec', 'Grec ancien', 'optionnelle', '#9c4f3a', 21, '5e', null],
  ['espagnol', 'Espagnol', 'optionnelle', '#d4492a', 22, '5e', null],
  ['allemand', 'Allemand', 'optionnelle', '#4a4a4a', 23, '5e', null],
  ['lv_autre', 'Autre langue vivante', 'optionnelle', '#707070', 24, '5e', null],
  ['solfege', 'Solfège', 'musique', '#7a3fb0', 30, null, null],
];

export const LEITNER = [
  [1, 'Boîte 1 — Quotidien', 1, 'Notion nouvelle ou ratée : on la revoit dès le lendemain.', 'Passe en boîte 2.', 'Reste en boîte 1.', 0],
  [2, 'Boîte 2 — Tous les 2 jours', 2, 'Notion réussie une fois.', 'Passe en boîte 3.', 'Retour en boîte 1.', 0],
  [3, 'Boîte 3 — Hebdomadaire', 7, 'Notion confirmée 2 fois, statut proche de « acquis ».', 'Passe en boîte 4.', 'Retour en boîte 1.', 0],
  [4, 'Boîte 4 — Bimensuel', 14, 'Notion considérée acquise, simple vérification de rétention.', 'Passe en boîte 5.', 'Retour en boîte 1 (régression signalée au parent).', 1],
  [5, 'Boîte 5 — Mensuel', 30, 'Notion solidement maîtrisée sur la durée ; reste en réactivation d’entretien.', 'Reste en boîte 5.', 'Retour en boîte 1 (régression signalée au parent).', 1],
];

// Paliers de fluence (mots correctement lus par minute) — volontairement ambitieux, modifiables.
export const PALIERS_FLUENCE = [
  ['CP', 'milieu', 30], ['CP', 'fin', 50],
  ['CE1', 'debut', 50], ['CE1', 'milieu', 70], ['CE1', 'fin', 90],
  ['CE2', 'debut', 90], ['CE2', 'milieu', 100], ['CE2', 'fin', 110],
  ['CM1', 'debut', 110], ['CM1', 'milieu', 115], ['CM1', 'fin', 120],
  ['CM2', 'debut', 120], ['CM2', 'milieu', 125], ['CM2', 'fin', 130],
  ['6e', 'fin', 140],
];

export function seedReference(db) {
  const hasNiveau = db.prepare('SELECT 1 FROM niveau WHERE foyer_id IS NULL AND code = ?');
  const insNiveau = db.prepare('INSERT INTO niveau (foyer_id, code, libelle, cycle, ordre, suivant_code) VALUES (NULL, ?, ?, ?, ?, ?)');
  NIVEAUX.forEach(([code, libelle, cycle], i) => {
    if (!hasNiveau.get(code)) insNiveau.run(code, libelle, cycle, (i + 1) * 10, NIVEAUX[i + 1]?.[0] ?? null);
  });

  const hasMat = db.prepare('SELECT 1 FROM matiere WHERE foyer_id IS NULL AND code = ?');
  const insMat = db.prepare('INSERT INTO matiere (foyer_id, code, nom, type, couleur, ordre, niveau_min, niveau_max) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)');
  for (const m of MATIERES) if (!hasMat.get(m[0])) insMat.run(...m);

  if (!db.prepare('SELECT 1 FROM leitner_boite LIMIT 1').get()) {
    const ins = db.prepare('INSERT INTO leitner_boite (numero, libelle, intervalle_jours, description, regle_succes, regle_echec, alerte_parent) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const b of LEITNER) ins.run(...b);
  }

  if (!db.prepare('SELECT 1 FROM palier_fluence WHERE foyer_id IS NULL LIMIT 1').get()) {
    const ins = db.prepare('INSERT INTO palier_fluence (foyer_id, niveau_code, periode, mcm) VALUES (NULL, ?, ?, ?)');
    for (const p of PALIERS_FLUENCE) ins.run(...p);
  }

  // Contenu de démonstration : uniquement si aucun référentiel n'a encore été importé.
  if (!db.prepare('SELECT 1 FROM notion WHERE foyer_id IS NULL LIMIT 1').get()) {
    const file = join(here, '../seed/referentiel-demo.json');
    if (existsSync(file)) importReferentielJson(db, JSON.parse(readFileSync(file, 'utf8')), 'demo');
  }
}

/**
 * Importe un référentiel au format JSON (même structure que l'export `/api/referentiel/export`).
 * { notions: [{ id, matiere, niveau, ..., cours, exercices: [{ id, titre, type, enonce, options, reponse, difficulte }] }] }
 */
export function importReferentielJson(db, data, source = 'demo') {
  const matByCode = new Map(db.prepare('SELECT id, code FROM matiere WHERE foyer_id IS NULL').all().map((m) => [m.code, m.id]));
  const upNotion = db.prepare(`
    INSERT INTO notion (foyer_id, source, source_id, matiere_id, niveau_code, cycle, domaine, sous_domaine, titre,
      libelle_officiel, statut_type, source_bo, millesime, en_vigueur_depuis, cours_md, actif, synced_at)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(source_id) DO UPDATE SET matiere_id = excluded.matiere_id, niveau_code = excluded.niveau_code,
      cycle = excluded.cycle, domaine = excluded.domaine, sous_domaine = excluded.sous_domaine, titre = excluded.titre,
      libelle_officiel = excluded.libelle_officiel, statut_type = excluded.statut_type, source_bo = excluded.source_bo,
      millesime = excluded.millesime, en_vigueur_depuis = excluded.en_vigueur_depuis, cours_md = excluded.cours_md,
      actif = 1, synced_at = excluded.synced_at
    RETURNING id`);
  const upEx = db.prepare(`
    INSERT INTO exercice (foyer_id, source, source_id, notion_id, titre, type, enonce, options_json, reponse, difficulte, actif, synced_at)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(source_id) DO UPDATE SET notion_id = excluded.notion_id, titre = excluded.titre, type = excluded.type,
      enonce = excluded.enonce, options_json = excluded.options_json, reponse = excluded.reponse,
      difficulte = excluded.difficulte, actif = 1, synced_at = excluded.synced_at`);
  const now = new Date().toISOString();
  let n = 0;
  let e = 0;
  for (const it of data.notions || []) {
    const matiereId = matByCode.get(it.matiere);
    if (!matiereId) continue;
    const { id } = upNotion.get(source, it.id, matiereId, it.niveau ?? null, it.cycle ?? null, it.domaine ?? null,
      it.sous_domaine ?? null, it.titre, it.libelle_officiel ?? null, it.statut_type ?? null, it.source_bo ?? null,
      it.millesime ?? null, it.en_vigueur_depuis ?? null, it.cours ?? null, now);
    n++;
    for (const ex of it.exercices || []) {
      upEx.run(source, ex.id, id, ex.titre, ex.type, ex.enonce, JSON.stringify(ex.options || []), ex.reponse, ex.difficulte ?? null, now);
      e++;
    }
  }
  return { notions: n, exercices: e };
}

/** Paramétrage par défaut d'un nouveau foyer (barème de points, instruments…). */
export function seedFoyer(db, foyerId) {
  const cat = db.prepare('INSERT INTO categorie_point (foyer_id, libelle, valeur_defaut) VALUES (?, ?, ?)');
  for (const [l, v] of [
    ['Travail soigné', 1], ['Leçon bien sue', 1], ['Excellent résultat', 2], ['Aide à la maison', 1],
    ['Lecture en autonomie', 1], ['Comportement exemplaire', 2],
    ['Travail bâclé', -1], ['Leçon non apprise', -1], ['Insolence', -2], ['Oubli de matériel', -1],
  ]) cat.run(foyerId, l, v);

  const rec = db.prepare('INSERT INTO recompense_catalogue (foyer_id, libelle, description) VALUES (?, ?, ?)');
  for (const [l, d] of [
    ['Choisir le dessert', 'Choix du dessert du dimanche'],
    ['Soirée film', 'Choisir le film de la soirée familiale'],
    ['Sortie au choix', 'Une sortie (parc, piscine, musée…) choisie par l’enfant'],
    ['Nouveau livre', 'Un livre au choix'],
  ]) rec.run(foyerId, l, d);

  const insInst = db.prepare('INSERT INTO instrument (foyer_id, nom) VALUES (?, ?) RETURNING id');
  const insNiv = db.prepare('INSERT INTO niveau_instrument (instrument_id, libelle, ordre) VALUES (?, ?, ?) RETURNING id');
  const insMor = db.prepare('INSERT INTO morceau (instrument_id, niveau_id, titre, compositeur, style) VALUES (?, ?, ?, ?, ?)');
  const exemples = {
    Piano: [
      ['Débutant', [['Au clair de la lune', 'Traditionnel', 'Comptine'], ['Ode à la joie (thème)', 'Beethoven', 'Classique']]],
      ['Élémentaire', [['Menuet en sol majeur', 'Petzold (attr. Bach)', 'Baroque']]],
      ['Intermédiaire', [['Für Elise', 'Beethoven', 'Classique'], ['Gymnopédie n°1', 'Satie', 'Moderne']]],
      ['Confirmé', [['Prélude en mi mineur op. 28 n°4', 'Chopin', 'Romantique']]],
    ],
    Guitare: [
      ['Débutant', [['Jeux interdits (thème, cordes à vide)', 'Anonyme', 'Classique'], ['Accords de base : La, Ré, Mi', '—', 'Accompagnement']]],
      ['Élémentaire', [['Knockin’ on Heaven’s Door (accords)', 'Bob Dylan', 'Folk']]],
      ['Intermédiaire', [['Romance anonyme (complète)', 'Anonyme', 'Classique']]],
      ['Confirmé', [['Asturias', 'Albéniz', 'Classique']]],
    ],
  };
  for (const [nom, niveaux] of Object.entries(exemples)) {
    const { id: instId } = insInst.get(foyerId, nom);
    niveaux.forEach(([libelle, morceaux], i) => {
      const { id: nivId } = insNiv.get(instId, libelle, i + 1);
      for (const [t, c, s] of morceaux) insMor.run(instId, nivId, t, c, s);
    });
  }
}
