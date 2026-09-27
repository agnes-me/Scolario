import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { anneeScolaire, anneeSuivante, today } from '../dates.js';
import { bad, day, enfantDuFoyer, notFound, str } from './common.js';
import { notionsDues } from '../services/leitner.js';
import { etatRegle } from '../services/recompenses.js';

export function niveauxVisibles(db, foyerId) {
  return all(db, 'SELECT * FROM niveau WHERE foyer_id IS NULL OR foyer_id = ? ORDER BY ordre, id', foyerId);
}

function niveauVisible(db, foyerId, id) {
  if (id == null || id === '') return null;
  const n = get(db, 'SELECT * FROM niveau WHERE id = ? AND (foyer_id IS NULL OR foyer_id = ?)', Number(id), foyerId);
  if (!n) throw bad('Niveau inconnu');
  return n;
}

/** Matières proposées par défaut pour un niveau : cœur + suivi allégé applicables à ce niveau. */
export function matieresParDefaut(db, niveau) {
  if (!niveau) return [];
  const ordreDe = (code) => (code ? get(db, 'SELECT ordre FROM niveau WHERE foyer_id IS NULL AND code = ?', code)?.ordre : null);
  return all(db, "SELECT * FROM matiere WHERE foyer_id IS NULL AND type IN ('coeur','allegee')").filter((m) => {
    const min = ordreDe(m.niveau_min);
    const max = ordreDe(m.niveau_max);
    return (min == null || niveau.ordre >= min) && (max == null || niveau.ordre <= max);
  }).map((m) => m.id);
}

function activerMatieres(db, enfantId, ids) {
  const ins = db.prepare('INSERT OR IGNORE INTO enfant_matiere (enfant_id, matiere_id) VALUES (?, ?)');
  for (const id of ids) ins.run(enfantId, id);
}

export function resumeEnfant(db, e) {
  const regles = all(db, 'SELECT * FROM regle_recompense WHERE enfant_id = ? AND actif = 1', e.id).map((r) => etatRegle(db, r));
  const prochaine = regles.sort((a, b) => a.periode_fin.localeCompare(b.periode_fin))[0] || null;
  return {
    ...e,
    solde_points: get(db, 'SELECT COALESCE(SUM(valeur), 0) AS s FROM point WHERE enfant_id = ?', e.id).s,
    revisions_dues: notionsDues(db, e.id).length,
    alertes: get(db, 'SELECT COUNT(*) AS c FROM alerte WHERE enfant_id = ? AND lue = 0', e.id).c,
    recompenses_a_valider: get(db, "SELECT COUNT(*) AS c FROM recompense_obtenue WHERE enfant_id = ? AND statut = 'a_valider'", e.id).c,
    prochaine_recompense: prochaine,
  };
}

export default function enfantsRoutes(db) {
  const r = Router();

  // ───── Niveaux (référentiel paramétrable) ─────
  r.get('/niveaux', (req, res) => res.json(niveauxVisibles(db, req.adulte.foyer_id)));

  r.post('/niveaux', (req, res) => {
    const { code, libelle, cycle, ordre, suivant_code } = req.body || {};
    if (!str(code) || !str(libelle)) throw bad('Code et libellé obligatoires');
    const id = run(db, 'INSERT INTO niveau (foyer_id, code, libelle, cycle, ordre, suivant_code) VALUES (?, ?, ?, ?, ?, ?)',
      req.adulte.foyer_id, str(code, 20), str(libelle, 100), str(cycle, 50), Number(ordre) || 0, str(suivant_code, 20)).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  r.put('/niveaux/:id', (req, res) => {
    const n = get(db, 'SELECT * FROM niveau WHERE id = ? AND foyer_id = ?', Number(req.params.id), req.adulte.foyer_id);
    if (!n) throw bad('Seuls les niveaux ajoutés par le foyer sont modifiables');
    const b = req.body || {};
    run(db, 'UPDATE niveau SET code = ?, libelle = ?, cycle = ?, ordre = ?, suivant_code = ? WHERE id = ?',
      str(b.code, 20) || n.code, str(b.libelle, 100) || n.libelle, str(b.cycle, 50), Number(b.ordre) || n.ordre, str(b.suivant_code, 20), n.id);
    res.json({ ok: true });
  });

  r.delete('/niveaux/:id', (req, res) => {
    const n = get(db, 'SELECT * FROM niveau WHERE id = ? AND foyer_id = ?', Number(req.params.id), req.adulte.foyer_id);
    if (!n) throw bad('Seuls les niveaux ajoutés par le foyer sont supprimables');
    if (get(db, 'SELECT 1 FROM enfant WHERE niveau_id = ? UNION SELECT 1 FROM annee_scolaire WHERE niveau_id = ?', n.id, n.id)) throw bad('Niveau utilisé : suppression impossible');
    run(db, 'DELETE FROM niveau WHERE id = ?', n.id);
    res.json({ ok: true });
  });

  // ───── Enfants ─────
  r.get('/enfants', (req, res) => {
    const archives = req.query.archives === '1';
    const rows = all(db, `SELECT e.*, n.code AS niveau_code, n.libelle AS niveau_libelle, n.ordre AS niveau_ordre, n.cycle AS niveau_cycle
                          FROM enfant e LEFT JOIN niveau n ON n.id = e.niveau_id
                          WHERE e.foyer_id = ? AND e.archive = ? ORDER BY e.date_naissance, e.id`, req.adulte.foyer_id, archives ? 1 : 0);
    res.json(rows.map((e) => resumeEnfant(db, e)));
  });

  r.post('/enfants', (req, res) => {
    const b = req.body || {};
    if (!str(b.prenom)) throw bad('Le prénom est obligatoire');
    const niveau = niveauVisible(db, req.adulte.foyer_id, b.niveau_id);
    const id = tx(db, () => {
      const id = Number(run(db, 'INSERT INTO enfant (foyer_id, prenom, nom, date_naissance, niveau_id, filiere, couleur) VALUES (?, ?, ?, ?, ?, ?, ?)',
        req.adulte.foyer_id, str(b.prenom, 60), str(b.nom, 60), day(b.date_naissance, null), niveau?.id ?? null, str(b.filiere, 200), str(b.couleur, 20)).lastInsertRowid);
      run(db, 'INSERT INTO annee_scolaire (enfant_id, annee, niveau_id, filiere, etablissement) VALUES (?, ?, ?, ?, ?)',
        id, anneeScolaire(), niveau?.id ?? null, str(b.filiere, 200), str(b.etablissement, 200));
      activerMatieres(db, id, matieresParDefaut(db, niveau));
      return id;
    });
    res.status(201).json({ id });
  });

  r.get('/enfants/:id', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    res.json({
      ...resumeEnfant(db, e),
      annees: all(db, `SELECT a.*, n.code AS niveau_code, n.libelle AS niveau_libelle FROM annee_scolaire a
                       LEFT JOIN niveau n ON n.id = a.niveau_id WHERE a.enfant_id = ? ORDER BY a.annee DESC`, e.id),
      matieres: all(db, `SELECT m.* FROM matiere m JOIN enfant_matiere em ON em.matiere_id = m.id
                         WHERE em.enfant_id = ? ORDER BY m.ordre, m.nom`, e.id),
      instruments: all(db, 'SELECT i.* FROM instrument i JOIN enfant_instrument ei ON ei.instrument_id = i.id WHERE ei.enfant_id = ?', e.id),
    });
  });

  r.put('/enfants/:id', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const b = req.body || {};
    const niveau = b.niveau_id !== undefined ? niveauVisible(db, req.adulte.foyer_id, b.niveau_id) : null;
    tx(db, () => {
      run(db, 'UPDATE enfant SET prenom = ?, nom = ?, date_naissance = ?, niveau_id = ?, filiere = ?, couleur = ? WHERE id = ?',
        str(b.prenom, 60) || e.prenom, b.nom !== undefined ? str(b.nom, 60) : e.nom,
        b.date_naissance !== undefined ? day(b.date_naissance, null) : e.date_naissance,
        b.niveau_id !== undefined ? niveau?.id ?? null : e.niveau_id,
        b.filiere !== undefined ? str(b.filiere, 200) : e.filiere, b.couleur !== undefined ? str(b.couleur, 20) : e.couleur, e.id);
      // Le niveau de l'année en cours suit le niveau courant (correction manuelle).
      if (b.niveau_id !== undefined || b.filiere !== undefined) {
        run(db, `INSERT INTO annee_scolaire (enfant_id, annee, niveau_id, filiere) VALUES (?, ?, ?, ?)
                 ON CONFLICT(enfant_id, annee) DO UPDATE SET niveau_id = excluded.niveau_id, filiere = excluded.filiere`,
          e.id, anneeScolaire(), b.niveau_id !== undefined ? niveau?.id ?? null : e.niveau_id, b.filiere !== undefined ? str(b.filiere, 200) : e.filiere);
      }
    });
    res.json({ ok: true });
  });

  r.post('/enfants/:id/archive', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    run(db, 'UPDATE enfant SET archive = ? WHERE id = ?', req.body?.archive === false ? 0 : 1, e.id);
    res.json({ ok: true });
  });

  r.delete('/enfants/:id', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    if (req.body?.confirmation !== e.prenom) throw bad(`Pour supprimer définitivement, saisissez le prénom « ${e.prenom} »`);
    run(db, 'DELETE FROM enfant WHERE id = ?', e.id);
    res.json({ ok: true });
  });

  // ───── Années scolaires / passage de niveau ─────
  r.get('/enfants/:id/passage', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const courant = get(db, 'SELECT * FROM annee_scolaire WHERE enfant_id = ? ORDER BY annee DESC LIMIT 1', e.id);
    const annee = courant ? anneeSuivante(courant.annee) : anneeScolaire();
    const niveau = e.niveau_id ? get(db, 'SELECT * FROM niveau WHERE id = ?', e.niveau_id) : null;
    const propose = niveau?.suivant_code
      ? get(db, 'SELECT * FROM niveau WHERE code = ? AND (foyer_id IS NULL OR foyer_id = ?) ORDER BY foyer_id DESC LIMIT 1', niveau.suivant_code, req.adulte.foyer_id)
      : null;
    res.json({ annee_actuelle: courant?.annee ?? null, annee_proposee: annee, niveau_actuel: niveau, niveau_propose: propose });
  });

  r.post('/enfants/:id/passage', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const b = req.body || {};
    const niveau = niveauVisible(db, req.adulte.foyer_id, b.niveau_id);
    if (!niveau) throw bad('Niveau obligatoire');
    const annee = str(b.annee, 9);
    if (!/^\d{4}-\d{4}$/.test(annee || '')) throw bad('Année scolaire invalide (ex. 2027-2028)');
    tx(db, () => {
      run(db, `INSERT INTO annee_scolaire (enfant_id, annee, niveau_id, filiere, etablissement, commentaire) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(enfant_id, annee) DO UPDATE SET niveau_id = excluded.niveau_id, filiere = excluded.filiere,
               etablissement = excluded.etablissement, commentaire = excluded.commentaire`,
        e.id, annee, niveau.id, str(b.filiere, 200), str(b.etablissement, 200), str(b.commentaire, 500));
      run(db, 'UPDATE enfant SET niveau_id = ?, filiere = ? WHERE id = ?', niveau.id, str(b.filiere, 200), e.id);
      activerMatieres(db, e.id, matieresParDefaut(db, niveau));
    });
    res.json({ ok: true });
  });

  r.put('/enfants/:id/annees/:anneeId', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const a = get(db, 'SELECT * FROM annee_scolaire WHERE id = ? AND enfant_id = ?', Number(req.params.anneeId), e.id);
    if (!a) throw notFound();
    const b = req.body || {};
    const niveau = b.niveau_id !== undefined ? niveauVisible(db, req.adulte.foyer_id, b.niveau_id) : null;
    run(db, 'UPDATE annee_scolaire SET niveau_id = ?, filiere = ?, etablissement = ?, commentaire = ? WHERE id = ?',
      b.niveau_id !== undefined ? niveau?.id ?? null : a.niveau_id, str(b.filiere, 200), str(b.etablissement, 200), str(b.commentaire, 500), a.id);
    res.json({ ok: true });
  });

  r.delete('/enfants/:id/annees/:anneeId', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    run(db, 'DELETE FROM annee_scolaire WHERE id = ? AND enfant_id = ?', Number(req.params.anneeId), e.id);
    res.json({ ok: true });
  });

  // ───── Matières actives ─────
  r.put('/enfants/:id/matieres', (req, res) => {
    const e = enfantDuFoyer(db, req, req.params.id);
    const ids = (req.body?.matiere_ids || []).map(Number);
    const valides = new Set(all(db, 'SELECT id FROM matiere WHERE foyer_id IS NULL OR foyer_id = ?', req.adulte.foyer_id).map((m) => m.id));
    tx(db, () => {
      run(db, 'DELETE FROM enfant_matiere WHERE enfant_id = ?', e.id);
      activerMatieres(db, e.id, ids.filter((id) => valides.has(id)));
    });
    res.json({ ok: true });
  });

  // ───── Vue comparative (frise des niveaux) ─────
  r.get('/comparatif', (req, res) => {
    const enfants = all(db, 'SELECT id, prenom, couleur, date_naissance FROM enfant WHERE foyer_id = ? AND archive = 0 ORDER BY date_naissance', req.adulte.foyer_id);
    res.json(enfants.map((e) => ({
      ...e,
      annees: all(db, `SELECT a.annee, n.code AS niveau_code, n.ordre FROM annee_scolaire a LEFT JOIN niveau n ON n.id = a.niveau_id
                       WHERE a.enfant_id = ? ORDER BY a.annee`, e.id),
    })));
  });

  r.get('/aujourdhui', (_req, res) => res.json({ date: today(), annee: anneeScolaire() }));

  return r;
}
