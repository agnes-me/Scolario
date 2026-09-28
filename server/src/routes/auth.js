import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { createSession, destroySession, hashPassword, noterEssai, requireAuth, tropDEssais, verifyPassword } from '../auth.js';
import { seedFoyer } from '../seed.js';
import { bad, notFound, str } from './common.js';

export const OPTIONS_DEFAUT = { vue_comparative: false, mode_enfant_affiche_points: true };

function inscriptionOuverte(db) {
  if (process.env.ALLOW_REGISTRATION === 'true') return true;
  return !get(db, 'SELECT 1 FROM foyer LIMIT 1');
}

function validerCompte({ nom, email, password }) {
  if (!str(nom)) throw bad('Le nom est obligatoire');
  if (!/^[^@\s]+@[^@\s]+$/.test(String(email || ''))) throw bad('Identifiant invalide : utilisez une adresse e-mail');
  if (String(password || '').length < 8) throw bad('Le mot de passe doit faire au moins 8 caractères');
}

export default function authRoutes(db) {
  const r = Router();
  const secure = process.env.COOKIE_SECURE === 'true';

  r.get('/auth/status', (req, res) => {
    const foyer = req.adulte ? get(db, 'SELECT id, nom, options_json FROM foyer WHERE id = ?', req.adulte.foyer_id) : null;
    res.json({
      connecte: Boolean(req.adulte),
      adulte: req.adulte || null,
      foyer: foyer ? { id: foyer.id, nom: foyer.nom, options: { ...OPTIONS_DEFAUT, ...JSON.parse(foyer.options_json) } } : null,
      inscriptionOuverte: inscriptionOuverte(db),
      codeInvitationRequis: Boolean(process.env.CODE_INVITATION),
    });
  });

  r.post('/auth/register', (req, res) => {
    if (!inscriptionOuverte(db)) throw bad('Les inscriptions sont fermées : demandez à un adulte du foyer de vous créer un compte.');
    const { foyer, nom, email, password, code } = req.body || {};
    // Instance exposée sur internet : la création d'un foyer peut exiger un code d'invitation.
    if (process.env.CODE_INVITATION && String(code || '').trim() !== process.env.CODE_INVITATION) throw bad('Code d’invitation incorrect');
    validerCompte({ nom, email, password });
    if (get(db, 'SELECT 1 FROM adulte WHERE email = ?', email)) throw bad('Cet identifiant est déjà utilisé');
    const adulteId = tx(db, () => {
      const f = Number(run(db, 'INSERT INTO foyer (nom) VALUES (?)', str(foyer, 100) || `Foyer de ${nom}`).lastInsertRowid);
      seedFoyer(db, f);
      return Number(run(db, 'INSERT INTO adulte (foyer_id, nom, email, password_hash) VALUES (?, ?, ?, ?)', f, str(nom, 100), email.trim(), hashPassword(password)).lastInsertRowid);
    });
    createSession(db, res, adulteId, secure);
    res.status(201).json({ ok: true });
  });

  r.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const cle = `${req.ip}|${String(email).toLowerCase()}`;
    if (tropDEssais(cle)) return res.status(429).json({ error: 'Trop de tentatives, réessayez dans 15 minutes.' });
    const a = get(db, 'SELECT id, password_hash FROM adulte WHERE email = ?', String(email || '').trim());
    if (!a || !verifyPassword(String(password || ''), a.password_hash)) {
      noterEssai(cle);
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }
    createSession(db, res, a.id, secure);
    res.json({ ok: true });
  });

  r.post('/auth/logout', (req, res) => {
    destroySession(db, req, res);
    res.json({ ok: true });
  });

  r.use(requireAuth);

  r.get('/foyer', (req, res) => {
    const f = get(db, 'SELECT * FROM foyer WHERE id = ?', req.adulte.foyer_id);
    res.json({
      id: f.id,
      nom: f.nom,
      options: { ...OPTIONS_DEFAUT, ...JSON.parse(f.options_json) },
      adultes: all(db, 'SELECT id, nom, email, created_at FROM adulte WHERE foyer_id = ? ORDER BY id', f.id),
    });
  });

  r.put('/foyer', (req, res) => {
    const f = get(db, 'SELECT * FROM foyer WHERE id = ?', req.adulte.foyer_id);
    const options = { ...OPTIONS_DEFAUT, ...JSON.parse(f.options_json), ...(req.body?.options || {}) };
    run(db, 'UPDATE foyer SET nom = ?, options_json = ? WHERE id = ?', str(req.body?.nom, 100) || f.nom, JSON.stringify(options), f.id);
    res.json({ ok: true });
  });

  r.post('/foyer/adultes', (req, res) => {
    const { nom, email, password } = req.body || {};
    validerCompte({ nom, email, password });
    if (get(db, 'SELECT 1 FROM adulte WHERE email = ?', email)) throw bad('Cet identifiant est déjà utilisé');
    const id = run(db, 'INSERT INTO adulte (foyer_id, nom, email, password_hash) VALUES (?, ?, ?, ?)', req.adulte.foyer_id, str(nom, 100), email.trim(), hashPassword(password)).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });

  r.delete('/foyer/adultes/:id', (req, res) => {
    const id = Number(req.params.id);
    if (id === req.adulte.id) throw bad('Vous ne pouvez pas supprimer votre propre compte');
    const a = get(db, 'SELECT id FROM adulte WHERE id = ? AND foyer_id = ?', id, req.adulte.foyer_id);
    if (!a) throw notFound();
    run(db, 'DELETE FROM adulte WHERE id = ?', id);
    res.json({ ok: true });
  });

  r.put('/moi/password', (req, res) => {
    const { ancien, nouveau } = req.body || {};
    const a = get(db, 'SELECT password_hash FROM adulte WHERE id = ?', req.adulte.id);
    if (!verifyPassword(String(ancien || ''), a.password_hash)) throw bad('Mot de passe actuel incorrect');
    if (String(nouveau || '').length < 8) throw bad('Le nouveau mot de passe doit faire au moins 8 caractères');
    run(db, 'UPDATE adulte SET password_hash = ? WHERE id = ?', hashPassword(nouveau), req.adulte.id);
    res.json({ ok: true });
  });

  return r;
}
