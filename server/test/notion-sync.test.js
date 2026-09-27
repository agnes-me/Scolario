import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, get, all } from '../src/db.js';
import { synchroniser, matiereCode } from '../src/services/notionSync.js';

const rt = (s, ann = {}) => [{ plain_text: s, annotations: ann }];
const page = (id, props, edited = '2026-09-25T10:00:00.000Z') => ({ id, last_edited_time: edited, properties: props });
const title = (s) => ({ type: 'title', title: rt(s) });
const text = (s) => ({ type: 'rich_text', rich_text: s ? rt(s) : [] });
const select = (s) => ({ type: 'select', select: s ? { name: s } : null });
const number = (n) => ({ type: 'number', number: n });
const relation = (...ids) => ({ type: 'relation', relation: ids.map((id) => ({ id })) });

function fakeNotion() {
  const calls = [];
  const dbs = {
    REF: [
      page('n1', { Notion: title('Passé simple'), Matiere: select('Français'), Niveau: select('CM2'), Cycle: select('Cycle 3'),
        Domaine: text('Grammaire et orthographe'), Sous_domaine: text('Conjugaison'), Libelle_officiel: text('être, avoir…'),
        Statut: select('Memorisation'), Source_BO: text('BO n°16'), Millesime: select('2025'), En_vigueur_depuis: text('2026-09') }),
      page('n2', { Notion: title('Rosa, la rose'), Matiere: select('Langues anciennes'), Niveau: select('5e'), Domaine: text('Latin — déclinaisons') }),
    ],
    EX: [
      page('e1', { Exercice: title('PS QCM'), Type: select('QCM'), Enonce: text('Il ___ (être)'), Options: text('a) fut | b) fût'),
        Reponse_attendue: text('a) fut'), Difficulte: select('Standard'), Notion_liee: relation('n1') }),
      page('e2', { Exercice: title('Orphelin'), Type: select('QCM'), Enonce: text('?'), Reponse_attendue: text('x'), Notion_liee: relation() }),
    ],
    LEIT: [1, 2, 3, 4, 5].map((n, i) => page(`l${n}`, { Boite: title(`Boite ${n}`), Numero: number(n), Intervalle_jours: number([1, 2, 7, 14, 30][i]),
      Regle_echec: text(n >= 4 ? 'Retour en Boite 1 (régression signalée au parent).' : 'Retour en Boite 1.') })),
  };
  const blocks = {
    n1: [
      { id: 'b1', type: 'heading_2', heading_2: { rich_text: rt('Fiche de cours') } },
      { id: 'b2', type: 'paragraph', paragraph: { rich_text: [...rt('Il '), ...rt('chanta', { bold: true })] } },
      { id: 'b3', type: 'table', table: {}, has_children: true },
    ],
    b3: [
      { type: 'table_row', table_row: { cells: [rt('Personne'), rt('Forme')] } },
      { type: 'table_row', table_row: { cells: [rt('il'), rt('fut')] } },
    ],
    n2: [],
  };
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    const u = new URL(url);
    let body;
    const q = /\/databases\/(\w+)\/query/.exec(u.pathname);
    if (q) body = { results: dbs[q[1]], has_more: false };
    const b = /\/blocks\/(\w+)\/children/.exec(u.pathname);
    if (b) body = { results: blocks[b[1]] || [], has_more: false };
    assert.ok(opts.headers.Authorization.startsWith('Bearer '));
    return { ok: true, status: 200, headers: new Map(), json: async () => body };
  };
  return { fetchImpl, calls };
}

test('correspondance des matières Notion', () => {
  assert.equal(matiereCode('Français'), 'francais');
  assert.equal(matiereCode('Langues anciennes', 'Grec ancien — alphabet'), 'grec');
  assert.equal(matiereCode('Langues anciennes', 'Latin'), 'latin');
  assert.equal(matiereCode('Langues vivantes optionnelles', 'Allemand LV2'), 'allemand');
  assert.equal(matiereCode('Inconnue'), null);
});

test('synchronisation Notion : import, cours en markdown, Leitner, désactivation de la démo, incrémental', async () => {
  process.env.NOTION_TOKEN = 'secret_test';
  process.env.NOTION_DB_REFERENTIEL = 'REF';
  process.env.NOTION_DB_EXERCICES = 'EX';
  process.env.NOTION_DB_LEITNER = 'LEIT';
  const db = openDb(':memory:');
  const { fetchImpl, calls } = fakeNotion();
  const r = await synchroniser(db, { fetchImpl });
  assert.equal(r.notions, 2);
  assert.equal(r.exercices, 1);
  assert.equal(r.boites, 5);
  const n1 = get(db, "SELECT * FROM notion WHERE source_id = 'n1'");
  assert.match(n1.cours_md, /## Fiche de cours/);
  assert.match(n1.cours_md, /Il \*\*chanta\*\*/);
  assert.match(n1.cours_md, /\| il \| fut \|/);
  const latin = get(db, "SELECT m.code FROM notion n JOIN matiere m ON m.id = n.matiere_id WHERE n.source_id = 'n2'");
  assert.equal(latin.code, 'latin');
  const ex = get(db, "SELECT * FROM exercice WHERE source_id = 'e1'");
  assert.deepEqual(JSON.parse(ex.options_json), ['a) fut', 'b) fût']);
  assert.equal(get(db, 'SELECT alerte_parent FROM leitner_boite WHERE numero = 4').alerte_parent, 1);
  assert.equal(get(db, 'SELECT alerte_parent FROM leitner_boite WHERE numero = 2').alerte_parent, 0);
  assert.equal(all(db, "SELECT * FROM notion WHERE source = 'demo' AND actif = 1").length, 0);

  // 2e passage : pages inchangées → aucun contenu de page re-téléchargé
  calls.length = 0;
  const r2 = await synchroniser(db, { fetchImpl });
  assert.equal(r2.cours_telecharges, 0);
  assert.equal(calls.filter((c) => c.includes('/blocks/')).length, 0);
  assert.equal(get(db, "SELECT statut FROM sync_log ORDER BY id DESC LIMIT 1").statut, 'ok');
});
