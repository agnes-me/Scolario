// Éléments libres, notes scolaires, fluence, évaluations de l'écrit, musique.
import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { anneeScolaire, today } from '../dates.js';
import { bad, day, enfantDuFoyer, ligneDuFoyer, matiereVisible, notFound, num, str } from './common.js';

const TYPES_ELEMENT = ['livre', 'recitation', 'projet', 'stage', 'expose', 'autre'];

export default function modulesRoutes(db) {
  const r = Router();
  const fid = (req) => req.adulte.foyer_id;

  // Petit utilitaire CRUD pour les tables rattachées à un enfant.
  function crudEnfant(chemin, table, lire, ordre = 'date DESC, id DESC') {
    r.get(`/enfants/:id/${chemin}`, (req, res) => {
      const e = enfantDuFoyer(db, req, req.params.id);
      res.json(all(db, `SELECT * FROM ${table} WHERE enfant_id = ? ORDER BY ${ordre}`, e.id));
    });
    r.post(`/enfants/:id/${chemin}`, (req, res) => {
      const e = enfantDuFoyer(db, req, req.params.id);
      const v = lire(req, req.body || {}, e);
      const cols = Object.keys(v);
      const id = run(db, `INSERT INTO ${table} (enfant_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`, e.id, ...Object.values(v)).lastInsertRowid;
      res.status(201).json({ id: Number(id) });
    });
    r.put(`/${chemin}/:id`, (req, res) => {
      const row = ligneDuFoyer(db, req, table, req.params.id);
      const v = lire(req, { ...row, ...req.body }, row);
      const cols = Object.keys(v);
      run(db, `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(v), row.id);
      res.json({ ok: true });
    });
    r.delete(`/${chemin}/:id`, (req, res) => {
      const row = ligneDuFoyer(db, req, table, req.params.id);
      run(db, `DELETE FROM ${table} WHERE id = ?`, row.id);
      res.json({ ok: true });
    });
  }

  // ───── Éléments libres (livres, récitations, projets, stages…) ─────
  crudEnfant('elements', 'element_libre', (req, b) => {
    if (!str(b.titre)) throw bad('Titre obligatoire');
    const statut = ['a_faire', 'en_cours', 'fait'].includes(b.statut) ? b.statut : 'a_faire';
    return {
      annee: /^\d{4}-\d{4}$/.test(b.annee || '') ? b.annee : anneeScolaire(),
      matiere_id: matiereVisible(db, req, b.matiere_id)?.id ?? null,
      type: TYPES_ELEMENT.includes(b.type) ? b.type : 'autre',
      titre: str(b.titre, 200), description: str(b.description, 3000), statut,
      echeance: day(b.echeance, null), date_fait: statut === 'fait' ? day(b.date_fait, today()) : null,
    };
  }, "annee DESC, CASE statut WHEN 'en_cours' THEN 0 WHEN 'a_faire' THEN 1 ELSE 2 END, echeance IS NULL, echeance");

  // ───── Notes / évaluations scolaires ─────
  crudEnfant('notes', 'note_scolaire', (req, b) => {
    if (!str(b.intitule)) throw bad('Intitulé obligatoire');
    return {
      matiere_id: matiereVisible(db, req, b.matiere_id)?.id ?? null, date: day(b.date, today()), intitule: str(b.intitule, 200),
      note: num(b.note), note_max: num(b.note_max) ?? 20, appreciation: str(b.appreciation, 2000), adulte_id: req.adulte.id,
    };
  });

  // ───── Fluence ─────
  crudEnfant('fluence', 'mesure_fluence', (_req, b) => {
    const mcm = Number(b.mots_par_minute);
    if (!Number.isInteger(mcm) || mcm < 0 || mcm > 400) throw bad('Nombre de mots par minute invalide');
    return { date: day(b.date, today()), mots_par_minute: mcm, erreurs: num(b.erreurs), texte_support: str(b.texte_support, 300), commentaire: str(b.commentaire, 1000) };
  }, 'date, id');

  r.get('/paliers-fluence', (req, res) => {
    const std = all(db, 'SELECT niveau_code, periode, mcm FROM palier_fluence WHERE foyer_id IS NULL');
    const perso = all(db, 'SELECT niveau_code, periode, mcm FROM palier_fluence WHERE foyer_id = ?', fid(req));
    const map = new Map(std.map((p) => [`${p.niveau_code}|${p.periode}`, { ...p, personnalise: false }]));
    for (const p of perso) map.set(`${p.niveau_code}|${p.periode}`, { ...p, personnalise: true });
    res.json([...map.values()]);
  });

  r.put('/paliers-fluence', (req, res) => {
    const paliers = req.body?.paliers || [];
    tx(db, () => {
      for (const p of paliers) {
        if (!['debut', 'milieu', 'fin'].includes(p.periode) || !str(p.niveau_code)) continue;
        if (p.mcm === null || p.mcm === '') {
          run(db, 'DELETE FROM palier_fluence WHERE foyer_id = ? AND niveau_code = ? AND periode = ?', fid(req), p.niveau_code, p.periode);
        } else {
          run(db, `INSERT INTO palier_fluence (foyer_id, niveau_code, periode, mcm) VALUES (?, ?, ?, ?)
                   ON CONFLICT(foyer_id, niveau_code, periode) DO UPDATE SET mcm = excluded.mcm`, fid(req), p.niveau_code, p.periode, Number(p.mcm));
        }
      }
    });
    res.json({ ok: true });
  });

  // ───── Écrit : dictées, qualité graphique, production d'écrit ─────
  crudEnfant('ecrit', 'evaluation_ecrit', (_req, b) => {
    if (!['dictee', 'ecriture', 'production'].includes(b.type)) throw bad('Type invalide');
    return {
      date: day(b.date, today()), type: b.type, titre: str(b.titre, 200), note: num(b.note), note_max: num(b.note_max), nb_mots: num(b.nb_mots),
      erreurs_usage: num(b.erreurs_usage), erreurs_grammaire: num(b.erreurs_grammaire), erreurs_conjugaison: num(b.erreurs_conjugaison),
      qualite: ['soigne', 'correct', 'a_travailler'].includes(b.qualite) ? b.qualite : null,
      consignes_respectees: b.consignes_respectees == null || b.consignes_respectees === '' ? null : (b.consignes_respectees ? 1 : 0),
      structure: str(b.structure, 500), commentaire: str(b.commentaire, 2000),
    };
  }, 'date DESC, id DESC');

  // ───── Musique : instruments, niveaux, morceaux types ─────
  r.get('/instruments', (req, res) => {
    const instruments = all(db, 'SELECT * FROM instrument WHERE foyer_id = ? ORDER BY nom', fid(req));
    res.json(instruments.map((i) => ({
      ...i,
      niveaux: all(db, 'SELECT * FROM niveau_instrument WHERE instrument_id = ? ORDER BY ordre, id', i.id),
      morceaux: all(db, 'SELECT * FROM morceau WHERE instrument_id = ? ORDER BY titre', i.id),
    })));
  });

  const instrumentDuFoyer = (req, id) => {
    const i = get(db, 'SELECT * FROM instrument WHERE id = ? AND foyer_id = ?', Number(id), fid(req));
    if (!i) throw notFound('Instrument introuvable');
    return i;
  };

  r.post('/instruments', (req, res) => {
    if (!str(req.body?.nom)) throw bad('Nom obligatoire');
    const id = run(db, 'INSERT INTO instrument (foyer_id, nom) VALUES (?, ?)', fid(req), str(req.body.nom, 80)).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });
  r.put('/instruments/:id', (req, res) => {
    const i = instrumentDuFoyer(req, req.params.id);
    run(db, 'UPDATE instrument SET nom = ? WHERE id = ?', str(req.body?.nom, 80) || i.nom, i.id);
    res.json({ ok: true });
  });
  r.delete('/instruments/:id', (req, res) => {
    const i = instrumentDuFoyer(req, req.params.id);
    run(db, 'DELETE FROM instrument WHERE id = ?', i.id);
    res.json({ ok: true });
  });

  r.post('/instruments/:id/niveaux', (req, res) => {
    const i = instrumentDuFoyer(req, req.params.id);
    if (!str(req.body?.libelle)) throw bad('Libellé obligatoire');
    const ordre = num(req.body.ordre) ?? (get(db, 'SELECT COALESCE(MAX(ordre), 0) + 1 AS o FROM niveau_instrument WHERE instrument_id = ?', i.id).o);
    const id = run(db, 'INSERT INTO niveau_instrument (instrument_id, libelle, ordre) VALUES (?, ?, ?)', i.id, str(req.body.libelle, 80), ordre).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });
  const niveauInstDuFoyer = (req) => {
    const n = get(db, 'SELECT n.* FROM niveau_instrument n JOIN instrument i ON i.id = n.instrument_id WHERE n.id = ? AND i.foyer_id = ?', Number(req.params.id), fid(req));
    if (!n) throw notFound();
    return n;
  };
  r.put('/niveaux-instrument/:id', (req, res) => {
    const n = niveauInstDuFoyer(req);
    run(db, 'UPDATE niveau_instrument SET libelle = ?, ordre = ? WHERE id = ?', str(req.body?.libelle, 80) || n.libelle, num(req.body?.ordre) ?? n.ordre, n.id);
    res.json({ ok: true });
  });
  r.delete('/niveaux-instrument/:id', (req, res) => {
    const n = niveauInstDuFoyer(req);
    run(db, 'DELETE FROM niveau_instrument WHERE id = ?', n.id);
    res.json({ ok: true });
  });

  const lireMorceau = (req, b, instrumentId) => {
    if (!str(b.titre)) throw bad('Titre obligatoire');
    const niveau = b.niveau_id ? get(db, 'SELECT id FROM niveau_instrument WHERE id = ? AND instrument_id = ?', Number(b.niveau_id), instrumentId) : null;
    const lien = str(b.lien, 500);
    if (lien && !/^https?:\/\//i.test(lien)) throw bad('Le lien doit commencer par http:// ou https://');
    return [niveau?.id ?? null, str(b.titre, 200), str(b.compositeur, 200), str(b.style, 100), lien, str(b.difficulte, 50)];
  };
  r.post('/instruments/:id/morceaux', (req, res) => {
    const i = instrumentDuFoyer(req, req.params.id);
    const id = run(db, 'INSERT INTO morceau (instrument_id, niveau_id, titre, compositeur, style, lien, difficulte) VALUES (?, ?, ?, ?, ?, ?, ?)',
      i.id, ...lireMorceau(req, req.body || {}, i.id)).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });
  const morceauDuFoyer = (req) => {
    const m = get(db, 'SELECT m.* FROM morceau m JOIN instrument i ON i.id = m.instrument_id WHERE m.id = ? AND i.foyer_id = ?', Number(req.params.id), fid(req));
    if (!m) throw notFound();
    return m;
  };
  r.put('/morceaux/:id', (req, res) => {
    const m = morceauDuFoyer(req);
    run(db, 'UPDATE morceau SET niveau_id = ?, titre = ?, compositeur = ?, style = ?, lien = ?, difficulte = ? WHERE id = ?',
      ...lireMorceau(req, { ...m, ...req.body }, m.instrument_id), m.id);
    res.json({ ok: true });
  });
  r.delete('/morceaux/:id', (req, res) => {
    const m = morceauDuFoyer(req);
    run(db, 'DELETE FROM morceau WHERE id = ?', m.id);
    res.json({ ok: true });
  });

  /** Musique d'un enfant : instruments pratiqués, statut courant de chaque morceau (historique conservé). */
  r.get('/enfants/:id/musique', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const instruments = all(db, 'SELECT i.* FROM instrument i JOIN enfant_instrument ei ON ei.instrument_id = i.id WHERE ei.enfant_id = ? ORDER BY i.nom', e.id);
    res.json({
      instruments: instruments.map((i) => {
        const niveaux = all(db, 'SELECT * FROM niveau_instrument WHERE instrument_id = ? ORDER BY ordre, id', i.id);
        const morceaux = all(db, `SELECT m.*, (SELECT pm.statut FROM progression_morceau pm WHERE pm.enfant_id = ? AND pm.morceau_id = m.id ORDER BY pm.date DESC, pm.id DESC LIMIT 1) AS statut,
                                    (SELECT pm.date FROM progression_morceau pm WHERE pm.enfant_id = ? AND pm.morceau_id = m.id ORDER BY pm.date DESC, pm.id DESC LIMIT 1) AS date_statut
                                  FROM morceau m WHERE m.instrument_id = ? ORDER BY m.titre`, e.id, e.id, i.id);
        // Niveau atteint : le plus haut niveau dont tous les morceaux types sont acquis.
        let atteint = null;
        for (const n of niveaux) {
          const ms = morceaux.filter((m) => m.niveau_id === n.id);
          if (ms.length && ms.every((m) => m.statut === 'acquis')) atteint = n; else break;
        }
        return { ...i, niveaux, morceaux, niveau_atteint: atteint };
      }),
      historique: all(db, `SELECT pm.*, m.titre, i.nom AS instrument FROM progression_morceau pm JOIN morceau m ON m.id = pm.morceau_id
                           JOIN instrument i ON i.id = m.instrument_id WHERE pm.enfant_id = ? ORDER BY pm.date DESC, pm.id DESC LIMIT 100`, e.id),
    });
  });

  r.put('/enfants/:id/instruments', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const valides = new Set(all(db, 'SELECT id FROM instrument WHERE foyer_id = ?', fid(req)).map((i) => i.id));
    tx(db, () => {
      run(db, 'DELETE FROM enfant_instrument WHERE enfant_id = ?', e.id);
      for (const id of (req.body?.instrument_ids || []).map(Number)) if (valides.has(id)) run(db, 'INSERT INTO enfant_instrument (enfant_id, instrument_id) VALUES (?, ?)', e.id, id);
    });
    res.json({ ok: true });
  });

  r.post('/enfants/:id/morceaux/:morceauId', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const m = get(db, 'SELECT m.* FROM morceau m JOIN instrument i ON i.id = m.instrument_id WHERE m.id = ? AND i.foyer_id = ?', Number(req.params.morceauId), fid(req));
    if (!m) throw notFound();
    const statut = req.body?.statut;
    if (!['non_travaille', 'en_cours', 'acquis', 'a_revoir'].includes(statut)) throw bad('Statut invalide');
    run(db, 'INSERT INTO progression_morceau (enfant_id, morceau_id, statut, date, commentaire) VALUES (?, ?, ?, ?, ?)',
      e.id, m.id, statut, day(req.body?.date, today()), str(req.body?.commentaire, 1000));
    res.status(201).json({ ok: true });
  });

  return r;
}
