import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let base;

before(async () => {
  const db = openDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

function agent() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
}

test('code d’invitation exigé si CODE_INVITATION est défini', async () => {
  process.env.CODE_INVITATION = 'secret-test';
  try {
    const a = agent();
    assert.equal((await a('GET', '/auth/status')).body.codeInvitationRequis, true);
    const r = await a('POST', '/auth/register', { nom: 'X', email: 'x@y.fr', password: 'motdepasse1', code: 'faux' });
    assert.equal(r.status, 400);
  } finally {
    delete process.env.CODE_INVITATION;
  }
});

test('parcours complet : foyer, enfant, tests, points, export, cloisonnement', async () => {
  const a = agent();
  let r = await a('GET', '/auth/status');
  assert.equal(r.body.inscriptionOuverte, true);

  r = await a('POST', '/auth/register', { foyer: 'Famille Martin', nom: 'Agnès', email: 'agnes@example.fr', password: 'motdepasse1' });
  assert.equal(r.status, 201);
  r = await a('GET', '/auth/status');
  assert.equal(r.body.connecte, true);
  assert.equal(r.body.inscriptionOuverte, false);

  // Second adulte du foyer
  r = await a('POST', '/foyer/adultes', { nom: 'Paul', email: 'paul@example.fr', password: 'motdepasse2' });
  assert.equal(r.status, 201);

  // Enfant en CE1 : matières par défaut
  const niveaux = (await a('GET', '/niveaux')).body;
  const ce1 = niveaux.find((n) => n.code === 'CE1');
  r = await a('POST', '/enfants', { prenom: 'Léa', date_naissance: '2019-03-02', niveau_id: ce1.id });
  const id = r.body.id;
  const enfant = (await a('GET', `/enfants/${id}`)).body;
  assert.ok(enfant.matieres.some((m) => m.code === 'francais'));
  assert.ok(!enfant.matieres.some((m) => m.code === 'latin'));
  assert.equal(enfant.annees.length, 1);

  // Synthèse : jauges des matières du niveau
  r = await a('GET', `/enfants/${id}/synthese`);
  const maths = r.body.matieres.find((m) => m.code === 'maths');
  assert.equal(maths.jauge.total, 1);

  // Séance de vérification sur une notion (le parent voit la réponse attendue)
  const notions = (await a('GET', `/notions?matiere_id=${maths.id}&niveau=CE1&enfant_id=${id}`)).body;
  r = await a('POST', `/enfants/${id}/session`, { mode: 'notion', notion_id: notions[0].id });
  assert.ok(r.body.questions.length >= 2);
  assert.ok(r.body.questions[0].reponse);
  const q = r.body.questions.find((x) => x.type === 'Calcul' && x.enonce.includes('4 × 7'));
  r = await a('POST', `/enfants/${id}/reponses`, { exercice_id: q.exercice_id, reponse: '28' });
  assert.equal(r.body.reussite, true);
  assert.equal(r.body.boiteApres, 2);
  // Nouvelle réussite le même jour : simple entraînement
  r = await a('POST', `/enfants/${id}/reponses`, { exercice_id: q.exercice_id, reussite: true });
  assert.equal(r.body.compte, false);
  // Verdict « raté » donné par le parent le même jour : la notion retombe en boîte 1
  r = await a('POST', `/enfants/${id}/reponses`, { exercice_id: q.exercice_id, reussite: false, reponse: '27' });
  assert.equal(r.body.reussite, false);
  assert.deepEqual([r.body.compte, r.body.boiteApres], [true, 1]);

  // Observation manuelle + historique
  r = await a('POST', `/enfants/${id}/observations`, { notion_id: notions[0].id, statut: 'acquis', commentaire: 'Très bien' });
  assert.equal(r.status, 201);
  r = await a('GET', `/notions/${notions[0].id}?enfant_id=${id}`);
  assert.equal(r.body.suivi.observations.length, 1);
  assert.equal(r.body.suivi.tentatives.length, 3);

  // Points et règle de récompense
  const cats = (await a('GET', '/categories-points')).body;
  r = await a('POST', `/enfants/${id}/points`, { categorie_id: cats.find((c) => c.valeur_defaut > 0).id });
  assert.equal(r.status, 201);
  r = await a('POST', `/enfants/${id}/points`, { valeur: -1, motif: 'Chambre en désordre' });
  r = await a('POST', `/enfants/${id}/regles`, { periodicite: 'semaine', seuil: 10, recompense: 'Soirée film' });
  assert.equal(r.status, 201);
  r = await a('GET', `/enfants/${id}/regles`);
  assert.equal(r.body.regles[0].seuil, 10);

  // Fluence, élément libre, passage de niveau
  assert.equal((await a('POST', `/enfants/${id}/fluence`, { mots_par_minute: 72, date: '2026-09-20' })).status, 201);
  assert.equal((await a('POST', `/enfants/${id}/elements`, { type: 'livre', titre: 'Le Petit Prince' })).status, 201);
  r = await a('GET', `/enfants/${id}/passage`);
  assert.equal(r.body.niveau_propose.code, 'CE2');
  r = await a('POST', `/enfants/${id}/passage`, { niveau_id: r.body.niveau_propose.id, annee: r.body.annee_proposee });
  assert.equal((await a('GET', `/enfants/${id}`)).body.annees.length, 2);

  // Export
  r = await a('GET', '/export/json');
  assert.equal(r.body.enfants.length, 1);
  assert.equal(r.body.points.length, 2);
  r = await a('GET', '/export/csv/points');
  assert.match(r.body, /Chambre en désordre/);

  // Cloisonnement : un autre foyer ne voit pas l'enfant (inscription fermée par défaut)
  const b = agent();
  r = await b('POST', '/auth/register', { nom: 'Intrus', email: 'x@example.fr', password: 'motdepasse3' });
  assert.equal(r.status, 400);
  r = await b('GET', `/enfants/${id}`);
  assert.equal(r.status, 401);

  // Connexion du second adulte : accès au même foyer
  const c = agent();
  r = await c('POST', '/auth/login', { email: 'paul@example.fr', password: 'mauvais' });
  assert.equal(r.status, 401);
  r = await c('POST', '/auth/login', { email: 'PAUL@example.fr', password: 'motdepasse2' });
  assert.equal(r.status, 200);
  assert.equal((await c('GET', `/enfants/${id}`)).body.prenom, 'Léa');
});
