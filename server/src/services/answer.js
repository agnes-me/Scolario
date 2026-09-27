// Correction automatique des réponses aux exercices.

/** Normalise une réponse : minuscules, sans accents, espaces/ponctuation finale réduits. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s«"']+|[\s.!?;:»"']+$/g, '')
    .trim();
}

/** Découpe le champ « Options » de Notion : « a) soit | b) est | c) sois ». */
export function parseOptions(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (!raw) return [];
  return String(raw)
    .split(/\s*\\?\|\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Retire le préfixe d'option « a) », « B. », « 1- »… */
const stripLetter = (s) => String(s).replace(/^\s*([a-z]|\d{1,2})\s*[).:-]\s+/i, '');

const VRAI = new Set(['vrai', 'oui', 'v', 'true', 'yes']);
const FAUX = new Set(['faux', 'non', 'f', 'false', 'no']);

const toNumber = (s) => {
  const t = normalize(s).replace(/\s/g, '').replace(',', '.').replace(/(€|cm|m|kg|g|l)$/, '');
  return t !== '' && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

/**
 * Vérifie une réponse. La réponse attendue peut contenir plusieurs variantes acceptées
 * séparées par « || » ou « / » entouré d'espaces (ex. « chantèrent || chanterent »).
 */
export function checkAnswer(exercice, given) {
  const type = normalize(exercice.type);
  const variants = String(exercice.reponse ?? '')
    .split(/\s*\|\|\s*|\s+\/\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const g = normalize(given);
  if (!g) return false;

  for (const expected of variants) {
    const e = normalize(expected);
    if (type.startsWith('vrai')) {
      if ((VRAI.has(e) && VRAI.has(g)) || (FAUX.has(e) && FAUX.has(g))) return true;
      continue;
    }
    if (type === 'qcm') {
      if (g === e || normalize(stripLetter(given)) === normalize(stripLetter(expected))) return true;
      // Réponse donnée sous forme de lettre seule (« a »)
      const letter = /^([a-z])\)?$/.exec(g);
      if (letter && e.startsWith(`${letter[1]})`)) return true;
      continue;
    }
    if (type === 'calcul') {
      const ne = toNumber(expected);
      const ng = toNumber(given);
      if (ne !== null && ng !== null && Math.abs(ne - ng) < 1e-9) return true;
    }
    if (g === e) return true;
  }
  return false;
}
