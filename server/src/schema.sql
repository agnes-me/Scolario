-- Scolario — schéma SQLite
-- Conventions : dates « jour » au format YYYY-MM-DD, horodatages ISO 8601.
-- Les tables sans foyer_id (ou avec foyer_id NULL) sont des données de référence
-- communes à tous les foyers (niveaux standards, matières officielles, référentiel synchronisé).

PRAGMA foreign_keys = ON;

-- ───────────────────────── Foyers, adultes, sessions ─────────────────────────
CREATE TABLE IF NOT EXISTS foyer (
  id            INTEGER PRIMARY KEY,
  nom           TEXT NOT NULL,
  options_json  TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS adulte (
  id             INTEGER PRIMARY KEY,
  foyer_id       INTEGER NOT NULL REFERENCES foyer(id) ON DELETE CASCADE,
  nom            TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS session (
  token       TEXT PRIMARY KEY,
  adulte_id   INTEGER NOT NULL REFERENCES adulte(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);

-- ───────────────────────── Référentiels paramétrables ─────────────────────────
CREATE TABLE IF NOT EXISTS niveau (
  id           INTEGER PRIMARY KEY,
  foyer_id     INTEGER REFERENCES foyer(id) ON DELETE CASCADE, -- NULL = niveau standard
  code         TEXT NOT NULL,
  libelle      TEXT NOT NULL,
  cycle        TEXT,
  ordre        INTEGER NOT NULL DEFAULT 0,
  suivant_code TEXT,
  UNIQUE (foyer_id, code)
);

CREATE TABLE IF NOT EXISTS matiere (
  id          INTEGER PRIMARY KEY,
  foyer_id    INTEGER REFERENCES foyer(id) ON DELETE CASCADE, -- NULL = matière du socle / optionnelle officielle
  code        TEXT NOT NULL,
  nom         TEXT NOT NULL,
  -- coeur : suivi détaillé ; allegee : attendus du programme uniquement ;
  -- optionnelle : LV2, langues anciennes ; musique ; libre : matière créée par le foyer
  type        TEXT NOT NULL CHECK (type IN ('coeur','allegee','optionnelle','musique','libre')),
  couleur     TEXT,
  ordre       INTEGER NOT NULL DEFAULT 100,
  niveau_min  TEXT,           -- code niveau à partir duquel la matière est proposée par défaut
  niveau_max  TEXT,
  UNIQUE (foyer_id, code)
);

-- ───────────────────────── Enfants et années scolaires ─────────────────────────
CREATE TABLE IF NOT EXISTS enfant (
  id              INTEGER PRIMARY KEY,
  foyer_id        INTEGER NOT NULL REFERENCES foyer(id) ON DELETE CASCADE,
  prenom          TEXT NOT NULL,
  nom             TEXT,
  date_naissance  TEXT,
  niveau_id       INTEGER REFERENCES niveau(id),
  filiere         TEXT,        -- filière / spécialités (lycée), section…
  couleur         TEXT,
  archive         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS annee_scolaire (
  id           INTEGER PRIMARY KEY,
  enfant_id    INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  annee        TEXT NOT NULL,           -- ex. 2026-2027
  niveau_id    INTEGER REFERENCES niveau(id),
  filiere      TEXT,
  etablissement TEXT,
  commentaire  TEXT,
  UNIQUE (enfant_id, annee)
);

CREATE TABLE IF NOT EXISTS enfant_matiere (
  enfant_id   INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  matiere_id  INTEGER NOT NULL REFERENCES matiere(id) ON DELETE CASCADE,
  PRIMARY KEY (enfant_id, matiere_id)
);

-- ───────────────────────── Référentiel : notions, cours, exercices ─────────────────────────
CREATE TABLE IF NOT EXISTS notion (
  id                 INTEGER PRIMARY KEY,
  foyer_id           INTEGER REFERENCES foyer(id) ON DELETE CASCADE, -- NULL = socle officiel (figé, synchronisé)
  source             TEXT NOT NULL DEFAULT 'notion' CHECK (source IN ('notion','demo','foyer')),
  source_id          TEXT UNIQUE,     -- id de page Notion (ou identifiant de démo)
  matiere_id         INTEGER NOT NULL REFERENCES matiere(id),
  niveau_code        TEXT,
  cycle              TEXT,
  domaine            TEXT,
  sous_domaine       TEXT,
  titre              TEXT NOT NULL,
  libelle_officiel   TEXT,
  statut_type        TEXT,            -- Observation / Introduction / Mémorisation / Consolidation / Maîtrise
  source_bo          TEXT,
  millesime          TEXT,
  en_vigueur_depuis  TEXT,
  remplace_par       TEXT,
  notes              TEXT,
  valeur_cible       REAL,
  unite              TEXT,
  cours_md           TEXT,            -- fiche de cours (markdown)
  actif              INTEGER NOT NULL DEFAULT 1,
  source_edited_at   TEXT,
  synced_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_notion_matiere ON notion(matiere_id, niveau_code);

CREATE TABLE IF NOT EXISTS exercice (
  id                INTEGER PRIMARY KEY,
  foyer_id          INTEGER REFERENCES foyer(id) ON DELETE CASCADE,
  source            TEXT NOT NULL DEFAULT 'notion',
  source_id         TEXT UNIQUE,
  notion_id         INTEGER REFERENCES notion(id) ON DELETE CASCADE,
  titre             TEXT NOT NULL,
  type              TEXT NOT NULL,     -- QCM / Reponse courte / Texte a trous / Calcul / Conjugaison a trous / Vrai/Faux
  enonce            TEXT NOT NULL,
  options_json      TEXT NOT NULL DEFAULT '[]',
  reponse           TEXT NOT NULL,
  difficulte        TEXT,              -- Facile / Standard / Renforcement
  actif             INTEGER NOT NULL DEFAULT 1,
  source_edited_at  TEXT,
  synced_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_exercice_notion ON exercice(notion_id);

CREATE TABLE IF NOT EXISTS leitner_boite (
  numero            INTEGER PRIMARY KEY,
  libelle           TEXT NOT NULL,
  intervalle_jours  INTEGER NOT NULL,
  description       TEXT,
  regle_succes      TEXT,
  regle_echec       TEXT,
  alerte_parent     INTEGER NOT NULL DEFAULT 0,  -- échec depuis cette boîte => signalement au parent
  synced_at         TEXT
);

CREATE TABLE IF NOT EXISTS sync_log (
  id          INTEGER PRIMARY KEY,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  statut      TEXT NOT NULL,   -- en_cours / ok / erreur
  resume      TEXT,
  declencheur TEXT
);

-- ───────────────────────── Suivi des acquis ─────────────────────────
CREATE TABLE IF NOT EXISTS observation (
  id          INTEGER PRIMARY KEY,
  enfant_id   INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  notion_id   INTEGER NOT NULL REFERENCES notion(id) ON DELETE CASCADE,
  statut      TEXT NOT NULL CHECK (statut IN ('non_vu','en_cours','acquis','a_consolider')),
  date        TEXT NOT NULL,
  commentaire TEXT,
  adulte_id   INTEGER REFERENCES adulte(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_obs_enfant ON observation(enfant_id, notion_id, date);

CREATE TABLE IF NOT EXISTS tentative (
  id                INTEGER PRIMARY KEY,
  enfant_id         INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  exercice_id       INTEGER NOT NULL REFERENCES exercice(id) ON DELETE CASCADE,
  notion_id         INTEGER NOT NULL REFERENCES notion(id) ON DELETE CASCADE,
  date              TEXT NOT NULL,       -- horodatage ISO
  reussite          INTEGER NOT NULL,
  reponse_donnee    TEXT,
  compte_leitner    INTEGER NOT NULL DEFAULT 0, -- la tentative a fait évoluer la boîte Leitner
  boite_avant       INTEGER,
  boite_apres       INTEGER,
  corrigee_parent   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tent_enfant ON tentative(enfant_id, notion_id, date);

CREATE TABLE IF NOT EXISTS planification (
  enfant_id           INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  notion_id           INTEGER NOT NULL REFERENCES notion(id) ON DELETE CASCADE,
  boite               INTEGER NOT NULL DEFAULT 1,
  derniere_verif      TEXT,
  prochaine_echeance  TEXT NOT NULL,
  PRIMARY KEY (enfant_id, notion_id)
);

CREATE TABLE IF NOT EXISTS alerte (
  id          INTEGER PRIMARY KEY,
  enfant_id   INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  notion_id   INTEGER REFERENCES notion(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  message     TEXT NOT NULL,
  date        TEXT NOT NULL,
  lue         INTEGER NOT NULL DEFAULT 0
);

-- ───────────────────────── Éléments libres, notes, fluence, écrit ─────────────────────────
CREATE TABLE IF NOT EXISTS element_libre (
  id           INTEGER PRIMARY KEY,
  enfant_id    INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  annee        TEXT NOT NULL,
  matiere_id   INTEGER REFERENCES matiere(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,   -- livre / recitation / projet / stage / autre
  titre        TEXT NOT NULL,
  description  TEXT,
  statut       TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire','en_cours','fait')),
  echeance     TEXT,
  date_fait    TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS note_scolaire (
  id          INTEGER PRIMARY KEY,
  enfant_id   INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  matiere_id  INTEGER REFERENCES matiere(id) ON DELETE SET NULL,
  date        TEXT NOT NULL,
  intitule    TEXT NOT NULL,
  note        REAL,
  note_max    REAL DEFAULT 20,
  appreciation TEXT,
  adulte_id   INTEGER REFERENCES adulte(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mesure_fluence (
  id               INTEGER PRIMARY KEY,
  enfant_id        INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  date             TEXT NOT NULL,
  mots_par_minute  INTEGER NOT NULL,
  erreurs          INTEGER,
  texte_support    TEXT,
  commentaire      TEXT
);

CREATE TABLE IF NOT EXISTS palier_fluence (
  niveau_code   TEXT NOT NULL,
  periode       TEXT NOT NULL CHECK (periode IN ('debut','milieu','fin')),
  mcm           INTEGER NOT NULL,          -- mots correctement lus par minute visés
  foyer_id      INTEGER REFERENCES foyer(id) ON DELETE CASCADE,
  UNIQUE (foyer_id, niveau_code, periode)
);

CREATE TABLE IF NOT EXISTS evaluation_ecrit (
  id                   INTEGER PRIMARY KEY,
  enfant_id            INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  date                 TEXT NOT NULL,
  type                 TEXT NOT NULL CHECK (type IN ('dictee','ecriture','production')),
  titre                TEXT,
  note                 REAL,
  note_max             REAL,
  nb_mots              INTEGER,
  erreurs_usage        INTEGER,
  erreurs_grammaire    INTEGER,
  erreurs_conjugaison  INTEGER,
  qualite              TEXT,    -- ecriture : soigne / correct / a_travailler
  consignes_respectees INTEGER, -- production : 0/1
  structure            TEXT,    -- production : appréciation
  commentaire          TEXT
);

-- ───────────────────────── Musique ─────────────────────────
CREATE TABLE IF NOT EXISTS instrument (
  id        INTEGER PRIMARY KEY,
  foyer_id  INTEGER REFERENCES foyer(id) ON DELETE CASCADE,
  nom       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS niveau_instrument (
  id             INTEGER PRIMARY KEY,
  instrument_id  INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  libelle        TEXT NOT NULL,
  ordre          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS morceau (
  id             INTEGER PRIMARY KEY,
  instrument_id  INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  niveau_id      INTEGER REFERENCES niveau_instrument(id) ON DELETE SET NULL,
  titre          TEXT NOT NULL,
  compositeur    TEXT,
  style          TEXT,
  lien           TEXT,
  difficulte     TEXT
);

CREATE TABLE IF NOT EXISTS enfant_instrument (
  enfant_id      INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  instrument_id  INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  PRIMARY KEY (enfant_id, instrument_id)
);

CREATE TABLE IF NOT EXISTS progression_morceau (
  id          INTEGER PRIMARY KEY,
  enfant_id   INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  morceau_id  INTEGER NOT NULL REFERENCES morceau(id) ON DELETE CASCADE,
  statut      TEXT NOT NULL CHECK (statut IN ('non_travaille','en_cours','acquis','a_revoir')),
  date        TEXT NOT NULL,
  commentaire TEXT
);

-- ───────────────────────── Points et récompenses ─────────────────────────
CREATE TABLE IF NOT EXISTS categorie_point (
  id             INTEGER PRIMARY KEY,
  foyer_id       INTEGER NOT NULL REFERENCES foyer(id) ON DELETE CASCADE,
  libelle        TEXT NOT NULL,
  valeur_defaut  INTEGER NOT NULL,   -- positive (bon point) ou négative (mauvais point)
  actif          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS point (
  id            INTEGER PRIMARY KEY,
  enfant_id     INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  valeur        INTEGER NOT NULL,
  motif         TEXT,
  categorie_id  INTEGER REFERENCES categorie_point(id) ON DELETE SET NULL,
  matiere_id    INTEGER REFERENCES matiere(id) ON DELETE SET NULL,
  adulte_id     INTEGER REFERENCES adulte(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_point_enfant ON point(enfant_id, date);

CREATE TABLE IF NOT EXISTS recompense_catalogue (
  id           INTEGER PRIMARY KEY,
  foyer_id     INTEGER NOT NULL REFERENCES foyer(id) ON DELETE CASCADE,
  libelle      TEXT NOT NULL,
  description  TEXT
);

CREATE TABLE IF NOT EXISTS regle_recompense (
  id               INTEGER PRIMARY KEY,
  enfant_id        INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  libelle          TEXT NOT NULL,
  periodicite      TEXT NOT NULL CHECK (periodicite IN ('semaine','mois','trimestre')),
  seuil            INTEGER NOT NULL,
  recompense       TEXT,
  catalogue_id     INTEGER REFERENCES recompense_catalogue(id) ON DELETE SET NULL,
  mode_report      TEXT NOT NULL DEFAULT 'zero' CHECK (mode_report IN ('zero','surplus','pourcentage')),
  report_pourcent  INTEGER NOT NULL DEFAULT 0,
  date_debut       TEXT NOT NULL,
  actif            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recompense_obtenue (
  id               INTEGER PRIMARY KEY,
  regle_id         INTEGER NOT NULL REFERENCES regle_recompense(id) ON DELETE CASCADE,
  enfant_id        INTEGER NOT NULL REFERENCES enfant(id) ON DELETE CASCADE,
  periode_debut    TEXT NOT NULL,
  periode_fin      TEXT NOT NULL,
  points           INTEGER NOT NULL,       -- points de la période + report entrant
  report_entrant   INTEGER NOT NULL DEFAULT 0,
  report_sortant   INTEGER NOT NULL DEFAULT 0,
  atteint          INTEGER NOT NULL,       -- calcul automatique : seuil atteint ?
  statut           TEXT NOT NULL DEFAULT 'a_valider' CHECK (statut IN ('a_valider','obtenue','non_obtenue')),
  valide_par       INTEGER REFERENCES adulte(id) ON DELETE SET NULL,
  date_validation  TEXT,
  UNIQUE (regle_id, periode_debut)
);
