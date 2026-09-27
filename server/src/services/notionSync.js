// Synchronisation périodique Notion → base de l'application.
// Notion est la source d'édition du référentiel ; l'application travaille sur sa propre copie
// et ne dépend jamais de Notion en temps réel. Le socle officiel n'est pas modifiable dans
// l'application : Notion fait foi, il n'y a donc pas de conflit bidirectionnel possible.
import { all, get, run, tx } from '../db.js';
import { parseOptions } from './answer.js';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

export function notionConfig() {
  return {
    token: process.env.NOTION_TOKEN || '',
    dbReferentiel: process.env.NOTION_DB_REFERENTIEL || '5431f85462fa4744a926baffcee67a8d',
    dbExercices: process.env.NOTION_DB_EXERCICES || '5087654b71824013a74cda922f632b61',
    dbLeitner: process.env.NOTION_DB_LEITNER || 'd8bdd7bbe1eb4d109db85a682808ee6f',
    intervalHeures: Number(process.env.NOTION_SYNC_INTERVAL_HOURS || 0),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(token, fetchImpl = fetch) {
  let last = 0;
  return async function call(path, { method = 'GET', body } = {}) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const wait = Math.max(0, last + 340 - Date.now()); // ≈ 3 requêtes / s (limite Notion)
      if (wait) await sleep(wait);
      last = Date.now();
      const res = await fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': VERSION,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 || res.status >= 500) {
        const retry = Number(res.headers.get('retry-after') || 2);
        await sleep(retry * 1000);
        continue;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(`Notion ${res.status} sur ${path} : ${json.message || JSON.stringify(json)}`);
      return json;
    }
    throw new Error(`Notion : trop de tentatives sur ${path}`);
  };
}

async function queryAll(call, dbId) {
  const out = [];
  let cursor;
  do {
    const r = await call(`/databases/${dbId}/query`, { method: 'POST', body: { page_size: 100, start_cursor: cursor } });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function childrenAll(call, blockId) {
  const out = [];
  let cursor;
  do {
    const q = cursor ? `&start_cursor=${cursor}` : '';
    const r = await call(`/blocks/${blockId}/children?page_size=100${q}`);
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

// ───────────── Conversion propriétés / blocs → valeurs simples / markdown ─────────────

export function richToMd(rich = []) {
  return rich.map((t) => {
    let s = t.plain_text ?? '';
    if (!s.trim()) return s;
    const a = t.annotations || {};
    if (a.code) s = `\`${s}\``;
    if (a.bold) s = `**${s}**`;
    if (a.italic) s = `*${s}*`;
    if (a.strikethrough) s = `~~${s}~~`;
    if (t.href) s = `[${s}](${t.href})`;
    return s;
  }).join('');
}

export function prop(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  switch (p.type) {
    case 'title': return p.title.map((t) => t.plain_text).join('').trim() || null;
    case 'rich_text': return p.rich_text.map((t) => t.plain_text).join('').trim() || null;
    case 'select': return p.select?.name ?? null;
    case 'status': return p.status?.name ?? null;
    case 'multi_select': return p.multi_select.map((o) => o.name);
    case 'number': return p.number;
    case 'relation': return p.relation.map((r) => r.id);
    case 'url': return p.url;
    case 'date': return p.date?.start ?? null;
    case 'checkbox': return p.checkbox;
    default: return null;
  }
}

export async function blocksToMd(call, blocks, depth = 0) {
  const lines = [];
  const indent = '  '.repeat(depth);
  let num = 0;
  for (const b of blocks) {
    const v = b[b.type] || {};
    const text = richToMd(v.rich_text);
    if (b.type !== 'numbered_list_item') num = 0;
    switch (b.type) {
      case 'paragraph': lines.push(indent + text, ''); break;
      case 'heading_1': lines.push(`# ${text}`, ''); break;
      case 'heading_2': lines.push(`## ${text}`, ''); break;
      case 'heading_3': lines.push(`### ${text}`, ''); break;
      case 'bulleted_list_item': lines.push(`${indent}- ${text}`); break;
      case 'numbered_list_item': lines.push(`${indent}${++num}. ${text}`); break;
      case 'to_do': lines.push(`${indent}- [${v.checked ? 'x' : ' '}] ${text}`); break;
      case 'quote': lines.push(`> ${text}`, ''); break;
      case 'callout': lines.push(`> ${v.icon?.emoji ? `${v.icon.emoji} ` : ''}${text}`, ''); break;
      case 'code': lines.push('```', v.rich_text.map((t) => t.plain_text).join(''), '```', ''); break;
      case 'divider': lines.push('---', ''); break;
      case 'equation': lines.push(`\`${v.expression}\``, ''); break;
      case 'toggle': lines.push(`${indent}**${text}**`); break;
      case 'table': {
        const rows = await childrenAll(call, b.id);
        rows.forEach((r, i) => {
          lines.push(`| ${r.table_row.cells.map((c) => richToMd(c).replace(/\|/g, '\\|')).join(' | ')} |`);
          if (i === 0) lines.push(`|${r.table_row.cells.map(() => '---').join('|')}|`);
        });
        lines.push('');
        break;
      }
      default: break;
    }
    if (b.has_children && b.type !== 'table' && b.type !== 'child_page' && b.type !== 'child_database') {
      const kids = await childrenAll(call, b.id);
      lines.push(await blocksToMd(call, kids, depth + 1));
      if (b.type.endsWith('list_item')) continue;
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ───────────── Correspondance des matières Notion → matières de l'application ─────────────

const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matiereCode(matiere, contexte = '') {
  const m = normalize(matiere);
  const c = normalize(contexte);
  if (m.startsWith('francais')) return 'francais';
  if (m.startsWith('math')) return 'maths';
  if (m.includes('science') || m.includes('svt') || m.includes('physique')) return 'sciences';
  if (m.startsWith('anglais')) return 'anglais';
  if (m.includes('histoire') || m.includes('geo')) return 'histoire_geo';
  if (m === 'emc') return 'emc';
  if (m === 'eps') return 'eps';
  if (m.startsWith('art') || m.includes('musique')) return 'arts';
  if (m.startsWith('techno')) return 'techno';
  if (m.startsWith('philo')) return 'philosophie';
  if (m.includes('latin')) return 'latin';
  if (m.includes('grec')) return 'grec';
  if (m.includes('espagnol')) return 'espagnol';
  if (m.includes('allemand')) return 'allemand';
  if (m.includes('solfege')) return 'solfege';
  if (m.includes('anciennes')) return c.includes('grec') ? 'grec' : 'latin';
  if (m.includes('vivantes')) return c.includes('allemand') ? 'allemand' : c.includes('espagnol') ? 'espagnol' : 'lv_autre';
  return null;
}

// ───────────── Synchronisation ─────────────

let enCours = null;

export function syncEnCours() {
  return Boolean(enCours);
}

/**
 * Lance la synchronisation. Options : { force: re-télécharger tous les cours, declencheur, fetchImpl }.
 * Une seule synchronisation à la fois.
 */
export function synchroniser(db, opts = {}) {
  if (enCours) return enCours;
  enCours = doSync(db, opts).finally(() => { enCours = null; });
  return enCours;
}

async function doSync(db, { force = false, declencheur = 'manuel', fetchImpl } = {}) {
  const cfg = notionConfig();
  if (!cfg.token) throw new Error('NOTION_TOKEN n’est pas configuré (voir README, section « Synchronisation Notion »).');
  const started = new Date().toISOString();
  const logId = Number(run(db, 'INSERT INTO sync_log (started_at, statut, declencheur) VALUES (?, ?, ?)', started, 'en_cours', declencheur).lastInsertRowid);
  const call = client(cfg.token, fetchImpl);
  const resume = { notions: 0, cours_telecharges: 0, exercices: 0, boites: 0, desactives: 0, ignores: [] };

  try {
    // 1. Paramètres Leitner
    const boites = await queryAll(call, cfg.dbLeitner);
    const leitner = boites.map((p) => ({
      numero: prop(p, 'Numero'),
      libelle: prop(p, 'Boite'),
      intervalle: prop(p, 'Intervalle_jours'),
      description: prop(p, 'Description'),
      succes: prop(p, 'Regle_succes'),
      echec: prop(p, 'Regle_echec'),
    })).filter((b) => Number.isFinite(b.numero) && Number.isFinite(b.intervalle));

    // 2. Référentiel (propriétés), puis cours (contenu de page) si modifié
    const pages = await queryAll(call, cfg.dbReferentiel);
    const existants = new Map(all(db, "SELECT source_id, source_edited_at, cours_md FROM notion WHERE source = 'notion'").map((n) => [n.source_id, n]));
    const coursParPage = new Map();
    for (const p of pages) {
      const ex = existants.get(p.id);
      if (!force && ex && ex.source_edited_at === p.last_edited_time && ex.cours_md != null) continue;
      const blocks = await childrenAll(call, p.id);
      coursParPage.set(p.id, await blocksToMd(call, blocks));
      resume.cours_telecharges++;
    }

    // 3. Exercices
    const exPages = await queryAll(call, cfg.dbExercices);

    // 4. Écriture en base, en une transaction
    tx(db, () => {
      const now = new Date().toISOString();
      if (leitner.length) {
        run(db, 'DELETE FROM leitner_boite');
        const ins = db.prepare('INSERT INTO leitner_boite (numero, libelle, intervalle_jours, description, regle_succes, regle_echec, alerte_parent, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const b of leitner) {
          const alerte = /signal|parent/i.test(b.echec || '') ? 1 : 0;
          ins.run(b.numero, b.libelle || `Boîte ${b.numero}`, b.intervalle, b.description, b.succes, b.echec, alerte, now);
          resume.boites++;
        }
      }

      const matieres = new Map(all(db, 'SELECT id, code FROM matiere WHERE foyer_id IS NULL').map((m) => [m.code, m.id]));
      const up = db.prepare(`
        INSERT INTO notion (foyer_id, source, source_id, matiere_id, niveau_code, cycle, domaine, sous_domaine, titre,
          libelle_officiel, statut_type, source_bo, millesime, en_vigueur_depuis, remplace_par, notes, valeur_cible, unite,
          cours_md, actif, source_edited_at, synced_at)
        VALUES (NULL, 'notion', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET matiere_id = excluded.matiere_id, niveau_code = excluded.niveau_code,
          cycle = excluded.cycle, domaine = excluded.domaine, sous_domaine = excluded.sous_domaine, titre = excluded.titre,
          libelle_officiel = excluded.libelle_officiel, statut_type = excluded.statut_type, source_bo = excluded.source_bo,
          millesime = excluded.millesime, en_vigueur_depuis = excluded.en_vigueur_depuis, remplace_par = excluded.remplace_par,
          notes = excluded.notes, valeur_cible = excluded.valeur_cible, unite = excluded.unite,
          cours_md = COALESCE(excluded.cours_md, notion.cours_md), actif = 1,
          source_edited_at = excluded.source_edited_at, synced_at = excluded.synced_at`);
      const vus = new Set();
      for (const p of pages) {
        const titre = prop(p, 'Notion');
        const contexte = `${titre} ${prop(p, 'Domaine') || ''} ${prop(p, 'Sous_domaine') || ''} ${prop(p, 'Libelle_officiel') || ''}`;
        const code = matiereCode(prop(p, 'Matiere'), contexte);
        if (!titre || !code || !matieres.has(code)) {
          resume.ignores.push(`${titre || p.id} (matière « ${prop(p, 'Matiere') || '?'} »)`);
          continue;
        }
        up.run(p.id, matieres.get(code), prop(p, 'Niveau'), prop(p, 'Cycle'), prop(p, 'Domaine'), prop(p, 'Sous_domaine'), titre,
          prop(p, 'Libelle_officiel'), prop(p, 'Statut'), prop(p, 'Source_BO'), prop(p, 'Millesime'), prop(p, 'En_vigueur_depuis'),
          prop(p, 'Remplace_par'), prop(p, 'Notes'), prop(p, 'Valeur_cible'), prop(p, 'Unite'),
          coursParPage.has(p.id) ? coursParPage.get(p.id) : null, p.last_edited_time, now);
        vus.add(p.id);
        resume.notions++;
      }

      const notionIds = new Map(all(db, "SELECT id, source_id FROM notion WHERE source = 'notion'").map((n) => [n.source_id, n.id]));
      const upEx = db.prepare(`
        INSERT INTO exercice (foyer_id, source, source_id, notion_id, titre, type, enonce, options_json, reponse, difficulte, actif, source_edited_at, synced_at)
        VALUES (NULL, 'notion', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET notion_id = excluded.notion_id, titre = excluded.titre, type = excluded.type,
          enonce = excluded.enonce, options_json = excluded.options_json, reponse = excluded.reponse,
          difficulte = excluded.difficulte, actif = 1, source_edited_at = excluded.source_edited_at, synced_at = excluded.synced_at`);
      const exVus = new Set();
      for (const p of exPages) {
        const rel = prop(p, 'Notion_liee') || [];
        const notionId = rel.map((id) => notionIds.get(id)).find(Boolean);
        const enonce = prop(p, 'Enonce');
        const reponse = prop(p, 'Reponse_attendue');
        if (!notionId || !enonce || !reponse) {
          resume.ignores.push(`Exercice ${prop(p, 'Exercice') || p.id} (notion liée, énoncé ou réponse manquant)`);
          continue;
        }
        upEx.run(p.id, notionId, prop(p, 'Exercice') || enonce.slice(0, 60), prop(p, 'Type') || 'Reponse courte', enonce,
          JSON.stringify(parseOptions(prop(p, 'Options'))), reponse, prop(p, 'Difficulte'), p.last_edited_time, now);
        exVus.add(p.id);
        resume.exercices++;
      }

      // Pages supprimées / archivées dans Notion : désactivées (l'historique des enfants est conservé).
      for (const [sid, id] of notionIds) {
        if (!vus.has(sid)) { run(db, 'UPDATE notion SET actif = 0 WHERE id = ?', id); resume.desactives++; }
      }
      for (const e of all(db, "SELECT id, source_id FROM exercice WHERE source = 'notion' AND actif = 1")) {
        if (!exVus.has(e.source_id)) { run(db, 'UPDATE exercice SET actif = 0 WHERE id = ?', e.id); resume.desactives++; }
      }
      // Le contenu de démonstration n'a plus lieu d'être une fois le vrai référentiel importé.
      if (resume.notions > 0) {
        run(db, "UPDATE notion SET actif = 0 WHERE source = 'demo'");
        run(db, "UPDATE exercice SET actif = 0 WHERE source = 'demo'");
      }
    });

    run(db, 'UPDATE sync_log SET ended_at = ?, statut = ?, resume = ? WHERE id = ?', new Date().toISOString(), 'ok', JSON.stringify(resume), logId);
    return resume;
  } catch (e) {
    run(db, 'UPDATE sync_log SET ended_at = ?, statut = ?, resume = ? WHERE id = ?', new Date().toISOString(), 'erreur', JSON.stringify({ erreur: e.message, ...resume }), logId);
    throw e;
  }
}

export function derniereSync(db) {
  const r = get(db, 'SELECT * FROM sync_log ORDER BY id DESC LIMIT 1');
  if (r?.resume) r.resume = JSON.parse(r.resume);
  return r;
}
