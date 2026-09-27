export const STATUTS = {
  non_vu: { label: 'Non vu', couleur: 'var(--gris)' },
  en_cours: { label: 'En cours', couleur: 'var(--bleu)' },
  acquis: { label: 'Acquis', couleur: 'var(--vert)' },
  a_consolider: { label: 'À consolider', couleur: 'var(--orange)' },
};

export const STATUTS_MORCEAU = {
  non_travaille: 'Non travaillé',
  en_cours: 'En cours',
  acquis: 'Acquis',
  a_revoir: 'À revoir',
};

export const TYPES_ELEMENT = {
  livre: '📚 Livre à lire',
  recitation: '🎭 Récitation / poésie',
  projet: '🛠️ Projet de classe',
  stage: '💼 Stage',
  expose: '🗣️ Exposé',
  autre: '📌 Autre',
};

export const STATUTS_ELEMENT = { a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait' };

export const TYPES_EXERCICE = ['QCM', 'Reponse courte', 'Texte a trous', 'Calcul', 'Conjugaison a trous', 'Vrai/Faux'];

const pad = (n) => String(n).padStart(2, '0');
export const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function dateFr(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', opts);
}

export function age(dateNaissance) {
  if (!dateNaissance) return null;
  const [y, m, d] = dateNaissance.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

export const periodiciteLabel = { semaine: 'hebdomadaire', mois: 'mensuel', trimestre: 'trimestriel' };

export function formData(e) {
  return Object.fromEntries(new FormData(e.currentTarget).entries());
}
