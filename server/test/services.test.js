import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, run, get } from '../src/db.js';
import { checkAnswer, parseOptions } from '../src/services/answer.js';
import { appliquerResultat, notionsDues, requalifierEchecDuJour } from '../src/services/leitner.js';
import { cloturerRegle, etatRegle } from '../src/services/recompenses.js';
import { statutsEnfant } from '../src/services/statut.js';
import { addDays, anneeScolaire, periode } from '../src/dates.js';
import { seedFoyer } from '../src/seed.js';

function fixture() {
  const db = openDb(':memory:');
  const foyer = Number(run(db, "INSERT INTO foyer (nom) VALUES ('Test')").lastInsertRowid);
  seedFoyer(db, foyer);
  const enfant = Number(run(db, "INSERT INTO enfant (foyer_id, prenom) VALUES (?, 'Léa')", foyer).lastInsertRowid);
  const notion = get(db, "SELECT id FROM notion WHERE source_id = 'demo-tables-ce1'").id;
  return { db, foyer, enfant, notion };
}

test('correction : QCM, vrai/faux, calcul, accents et variantes', () => {
  assert.deepEqual(parseOptions('a) soit \\| b) est \\| c) sois'), ['a) soit', 'b) est', 'c) sois']);
  assert.deepEqual(parseOptions('a) soit | b) est'), ['a) soit', 'b) est']);
  const qcm = { type: 'QCM', reponse: 'a) soit' };
  assert.equal(checkAnswer(qcm, 'a) soit'), true);
  assert.equal(checkAnswer(qcm, 'soit'), true);
  assert.equal(checkAnswer(qcm, 'a'), true);
  assert.equal(checkAnswer(qcm, 'b) est'), false);
  const vf = { type: 'Vrai/Faux', reponse: 'Oui' };
  assert.equal(checkAnswer(vf, 'Vrai'), true);
  assert.equal(checkAnswer(vf, 'faux'), false);
  assert.equal(checkAnswer({ type: 'Calcul', reponse: '14' }, ' 14,0 '), true);
  assert.equal(checkAnswer({ type: 'Calcul', reponse: '3,5' }, '3.5'), true);
  assert.equal(checkAnswer({ type: 'Texte a trous', reponse: 'chantèrent' }, 'Chantèrent.'), true);
  assert.equal(checkAnswer({ type: 'Texte a trous', reponse: 'chantèrent' }, 'chanterent'), true);
  assert.equal(checkAnswer({ type: 'Reponse courte', reponse: 'green || vert' }, 'Green'), true);
  assert.equal(checkAnswer({ type: 'Reponse courte', reponse: 'green' }, ''), false);
});

test('dates : année scolaire et périodes', () => {
  assert.equal(anneeScolaire('2026-09-27'), '2026-2027');
  assert.equal(anneeScolaire('2027-06-30'), '2026-2027');
  assert.deepEqual(periode('semaine', '2026-09-27'), { debut: '2026-09-21', fin: '2026-09-27' }); // dimanche
  assert.deepEqual(periode('mois', '2026-02-10'), { debut: '2026-02-01', fin: '2026-02-28' });
  assert.deepEqual(periode('trimestre', '2026-11-03'), { debut: '2026-10-01', fin: '2026-12-31' });
});

test('Leitner : progression, échéances, retour en boîte 1 et alerte à partir de la boîte 4', () => {
  const { db, enfant, notion } = fixture();
  const j0 = '2026-09-01';
  let r = appliquerResultat(db, enfant, notion, true, j0);
  assert.deepEqual([r.compte, r.boiteAvant, r.boiteApres], [true, null, 2]);
  // Avant l'échéance : simple entraînement, pas d'évolution
  r = appliquerResultat(db, enfant, notion, true, j0);
  assert.equal(r.compte, false);
  assert.equal(notionsDues(db, enfant, addDays(j0, 1)).length, 0);
  assert.equal(notionsDues(db, enfant, addDays(j0, 2)).length, 1);
  r = appliquerResultat(db, enfant, notion, true, addDays(j0, 2)); // → 3 (7 j)
  r = appliquerResultat(db, enfant, notion, true, addDays(j0, 9)); // → 4 (14 j)
  assert.equal(r.boiteApres, 4);
  r = appliquerResultat(db, enfant, notion, false, addDays(j0, 23)); // échec depuis 4
  assert.deepEqual([r.boiteApres, r.alerte], [1, true]);
  assert.equal(get(db, 'SELECT COUNT(*) AS c FROM alerte WHERE enfant_id = ?', enfant).c, 1);
  // Échec depuis la boîte 1 : pas d'alerte
  r = appliquerResultat(db, enfant, notion, false, addDays(j0, 24));
  assert.equal(r.alerte, false);
});

test('statut effectif : le plus récent entre observation et test', () => {
  const { db, enfant, notion } = fixture();
  run(db, "INSERT INTO observation (enfant_id, notion_id, statut, date) VALUES (?, ?, 'acquis', '2026-09-01')", enfant, notion);
  assert.equal(statutsEnfant(db, enfant).get(notion).statut, 'acquis');
  run(db, `INSERT INTO tentative (enfant_id, exercice_id, notion_id, date, reussite, compte_leitner, boite_avant, boite_apres)
           VALUES (?, (SELECT id FROM exercice WHERE notion_id = ? LIMIT 1), ?, '2026-09-05T10:00:00Z', 0, 1, 4, 1)`, enfant, notion, notion);
  assert.equal(statutsEnfant(db, enfant).get(notion).statut, 'a_consolider');
});

test('récompenses : clôture hebdomadaire, seuil, report du surplus', () => {
  const { db, enfant } = fixture();
  const regle = { id: 0, enfant_id: enfant, periodicite: 'semaine', seuil: 5, mode_report: 'surplus', report_pourcent: 0, date_debut: '2026-09-07' };
  regle.id = Number(run(db, `INSERT INTO regle_recompense (enfant_id, libelle, periodicite, seuil, mode_report, date_debut) VALUES (?, 'Hebdo', 'semaine', 5, 'surplus', '2026-09-07')`, enfant).lastInsertRowid);
  const pt = (date, v) => run(db, 'INSERT INTO point (enfant_id, date, valeur, motif) VALUES (?, ?, ?, ?)', enfant, date, v, 'test');
  pt('2026-09-08', 4); pt('2026-09-10', 3); pt('2026-09-11', -1); // semaine 1 : 6 → atteint, surplus 1
  pt('2026-09-15', 3); // semaine 2 : 3 + 1 = 4 → non atteint
  const r = cloturerRegle(db, regle, '2026-09-22');
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => [x.total, x.atteint]), [[6, true], [4, false]]);
  // Idempotent
  assert.equal(cloturerRegle(db, regle, '2026-09-22').length, 0);
  pt('2026-09-23', 2);
  const etat = etatRegle(db, regle, '2026-09-24');
  assert.equal(etat.points, 2);
  assert.equal(etat.periode_debut, '2026-09-21');
});

test('Leitner : un échec le même jour annule la réussite déjà comptée', () => {
  const { db, enfant, notion } = fixture();
  const ex = get(db, 'SELECT id FROM exercice WHERE notion_id = ? LIMIT 1', notion).id;
  const jour = '2026-09-01';
  const r = appliquerResultat(db, enfant, notion, true, jour);
  run(db, `INSERT INTO tentative (enfant_id, exercice_id, notion_id, date, reussite, compte_leitner, boite_avant, boite_apres)
           VALUES (?, ?, ?, ?, 1, 1, ?, ?)`, enfant, ex, notion, `${jour}T10:00:00Z`, r.boiteAvant, r.boiteApres);
  assert.equal(r.boiteApres, 2);
  const q = requalifierEchecDuJour(db, enfant, notion, jour);
  assert.deepEqual([q.compte, q.boiteApres], [true, 1]);
  const p = get(db, 'SELECT boite, prochaine_echeance FROM planification WHERE enfant_id = ? AND notion_id = ?', enfant, notion);
  assert.deepEqual([p.boite, p.prochaine_echeance], [1, '2026-09-02']);
});
