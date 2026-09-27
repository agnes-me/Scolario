// Authentification simple : un identifiant (e-mail) + mot de passe par adulte, session par cookie.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { get, run } from './db.js';

const COOKIE = 'scolario_session';
const DUREE_JOURS = 30;

export function hashPassword(pwd) {
  const salt = randomBytes(16);
  const hash = scryptSync(pwd, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pwd, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pwd, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export function createSession(db, res, adulteId, secure) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + DUREE_JOURS * 864e5);
  run(db, 'INSERT INTO session (token, adulte_id, expires_at) VALUES (?, ?, ?)', token, adulteId, expires.toISOString());
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure ? '; Secure' : ''}`);
}

export function destroySession(db, req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) run(db, 'DELETE FROM session WHERE token = ?', token);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Middleware : charge req.adulte si la session est valide. */
export function loadSession(db) {
  return (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const row = get(db, `SELECT a.id, a.foyer_id, a.nom, a.email FROM session s JOIN adulte a ON a.id = s.adulte_id
                           WHERE s.token = ? AND s.expires_at > ?`, token, new Date().toISOString());
      if (row) req.adulte = row;
    }
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.adulte) return res.status(401).json({ error: 'Non connecté' });
  next();
}

// Limitation basique des tentatives de connexion (mémoire).
const essais = new Map();
export function tropDEssais(cle) {
  const now = Date.now();
  const e = (essais.get(cle) || []).filter((t) => now - t < 15 * 60e3);
  essais.set(cle, e);
  return e.length >= 10;
}
export function noterEssai(cle) {
  essais.set(cle, [...(essais.get(cle) || []), Date.now()]);
}
