// Utilitaires de dates « jour » (YYYY-MM-DD) en heure locale du serveur (TZ, ex. Europe/Paris).

const pad = (n) => String(n).padStart(2, '0');

export function toDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  return toDay(new Date());
}

export function addDays(day, n) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** Année scolaire contenant la date : bascule au 1er août. */
export function anneeScolaire(day = today()) {
  const d = parseDay(day);
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

export function anneeSuivante(annee) {
  const y = Number(annee.slice(0, 4)) + 1;
  return `${y}-${y + 1}`;
}

/** Bornes [debut, fin] (inclusives) de la période contenant `day`. */
export function periode(periodicite, day) {
  const d = parseDay(day);
  if (periodicite === 'semaine') {
    const dow = (d.getDay() + 6) % 7; // lundi = 0
    const debut = addDays(day, -dow);
    return { debut, fin: addDays(debut, 6) };
  }
  if (periodicite === 'mois') {
    const debut = new Date(d.getFullYear(), d.getMonth(), 1);
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { debut: toDay(debut), fin: toDay(fin) };
  }
  if (periodicite === 'trimestre') {
    const q = Math.floor(d.getMonth() / 3);
    const debut = new Date(d.getFullYear(), q * 3, 1);
    const fin = new Date(d.getFullYear(), q * 3 + 3, 0);
    return { debut: toDay(debut), fin: toDay(fin) };
  }
  throw new Error(`Périodicité inconnue : ${periodicite}`);
}
