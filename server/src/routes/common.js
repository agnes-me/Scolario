import { get } from '../db.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const bad = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Introuvable') => new HttpError(404, msg);

/** Récupère un enfant en vérifiant qu'il appartient au foyer de l'adulte connecté. */
export function enfantDuFoyer(db, req, id) {
  const e = get(db, `SELECT e.*, n.code AS niveau_code, n.libelle AS niveau_libelle, n.cycle AS niveau_cycle, n.ordre AS niveau_ordre
                     FROM enfant e LEFT JOIN niveau n ON n.id = e.niveau_id
                     WHERE e.id = ? AND e.foyer_id = ?`, Number(id), req.adulte.foyer_id);
  if (!e) throw notFound('Enfant introuvable');
  return e;
}

/** Vérifie qu'une ligne d'une table enfant-scopée appartient bien au foyer. */
export function ligneDuFoyer(db, req, table, id) {
  const row = get(db, `SELECT t.* FROM ${table} t JOIN enfant e ON e.id = t.enfant_id WHERE t.id = ? AND e.foyer_id = ?`, Number(id), req.adulte.foyer_id);
  if (!row) throw notFound();
  return row;
}

/** Matière visible par le foyer (officielle ou créée par le foyer). */
export function matiereVisible(db, req, id) {
  if (id == null || id === '') return null;
  const m = get(db, 'SELECT * FROM matiere WHERE id = ? AND (foyer_id IS NULL OR foyer_id = ?)', Number(id), req.adulte.foyer_id);
  if (!m) throw notFound('Matière introuvable');
  return m;
}

export function notionVisible(db, req, id) {
  const n = get(db, 'SELECT * FROM notion WHERE id = ? AND (foyer_id IS NULL OR foyer_id = ?)', Number(id), req.adulte.foyer_id);
  if (!n) throw notFound('Notion introuvable');
  return n;
}

export const str = (v, max = 2000) => (v == null || v === '' ? null : String(v).slice(0, max));
export const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const day = (v, fallback) => {
  if (v == null || v === '') return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw bad('Date invalide (format attendu AAAA-MM-JJ)');
  return String(v);
};
