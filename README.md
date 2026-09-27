# Scolario — suivi de scolarité familiale

Application web **gratuite, open-source et auto-hébergeable** pour suivre la scolarité de plusieurs enfants d'un même foyer, de la maternelle à la terminale, en s'appuyant sur le programme officiel de l'Éducation nationale… et au-delà (fluence, dictées, musique, bons points).

> **Coût : 0 €.** Aucun abonnement, aucun service payant. Node.js + SQLite (intégré à Node), une seule dépendance d'exécution (Express, licence MIT). Tourne sur un Synology, un Raspberry Pi ou n'importe quel ordinateur.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Démarrage rapide](#démarrage-rapide)
3. [Installation sur Synology / Raspberry Pi (Docker)](#installation-sur-synology--raspberry-pi-docker)
4. [Synchronisation Notion](#synchronisation-notion)
5. [Configuration](#configuration)
6. [Sauvegarde et export](#sauvegarde-et-export)
7. [Architecture technique](#architecture-technique)
8. [Correspondance avec le cahier des charges](#correspondance-avec-le-cahier-des-charges)
9. [Développement](#développement)

---

## Fonctionnalités

| Domaine | Ce que fait l'application |
|---|---|
| **Foyer** | Plusieurs adultes par foyer (un identifiant + mot de passe chacun, tous administrateurs à égalité), autant d'enfants que nécessaire, archivage. |
| **Niveaux** | Référentiel PS → Tle paramétrable (ajout de niveaux particuliers : filières, sections…), historique des années scolaires, **passage de niveau** proposé automatiquement (CM2 → 6e) et ajustable (redoublement…). |
| **Matières** | Socle officiel (cœur de cible : français, maths, sciences, anglais ; suivi allégé : histoire-géo, EMC, EPS, arts, techno, philo), options activables par enfant (latin, grec, espagnol, allemand…), solfège, **matières libres** du foyer (code, échecs…). |
| **Référentiel** | Notions, fiches de cours et banque d'exercices **synchronisées depuis Notion** (copie locale, aucune dépendance temps réel). Le foyer peut ajouter ses propres notions / cours / exercices. |
| **Brique élémentaire** | Chaque notion = **cours** (markdown : règles, tableaux, pièges) + **questions de vérification** (QCM, réponse courte, texte à trous, calcul, conjugaison, vrai/faux) + **réactivation Leitner** (5 boîtes, 1/2/7/14/30 jours, paramètres lus dans Notion). |
| **Suivi des acquis** | Historique complet horodaté (observations manuelles + vérifications), jamais écrasé. Statut « acquis » révisable : une régression après un acquis solide (boîte ≥ 4) **alerte le parent**. |
| **Vérification avec l'enfant** | Séances menées par le parent, assis à côté de l'enfant (révisions du jour, une notion, ou les notions non acquises d'une matière) : le parent pose la question, affiche la réponse attendue, note « Réussi » ou « Raté » (raccourcis clavier O / N), avec la fiche de cours à portée de main et un bilan final. |
| **Fluence & écrit** | Mesures de fluence (mots/min) avec courbe et **paliers de référence** par niveau ; dictées avec erreurs par type (usage / grammaire / conjugaison) ; qualité graphique ; productions d'écrit. |
| **Éléments libres** | Livres à lire, récitations, projets, stages, exposés — par enfant et par année, avec statut à faire / en cours / fait. |
| **Notes** | Évaluations scolaires par matière. |
| **Musique** | Instruments paramétrables (piano et guitare fournis en exemple), progression par niveaux, **morceaux types** jalons (titre, compositeur, lien partition/vidéo), statut par enfant avec historique, « niveau atteint » calculé. |
| **Points & récompenses** | Bons / mauvais points avec motif (barème éditable) et matière facultative ; **plusieurs paliers en parallèle** (hebdo, mensuel, trimestriel) avec seuil, récompense (libre ou catalogue), remise à zéro / report du surplus / report d'un pourcentage ; calcul automatique en fin de période **soumis à validation** du parent. |
| **Tableaux de bord** | Accueil multi-enfants, synthèse par enfant (jauges par matière, solde, paliers, révisions, alertes), vue détaillée par matière (progression dans le temps, évaluations, notions non acquises), historique consolidé, **vue comparative optionnelle** (désactivée par défaut). |
| **Export** | Export complet JSON et CSV table par table (compatible tableur français), export du référentiel. |

---

## Démarrage rapide

Prérequis : **Node.js ≥ 22.13** (gratuit, https://nodejs.org).

```bash
git clone https://github.com/agnes-me/scolario.git
cd scolario
npm install
npm run build        # compile l'interface
npm start            # http://localhost:3000
```

Au premier lancement, l'écran propose de **créer le foyer** et le premier compte adulte. Les inscriptions se ferment ensuite automatiquement : les autres adultes sont ajoutés depuis *Paramètres › Foyer & adultes*.

Un petit **référentiel de démonstration** (6 notions, 14 exercices) est chargé pour tester tout de suite. Il est désactivé automatiquement dès la première synchronisation Notion.

---

## Installation sur Synology / Raspberry Pi (Docker)

> **Accès depuis internet sans VPN ni port ouvert, avec mises à jour automatiques depuis GitHub** (Cloudflare Tunnel + GitHub Actions) : voir [`docs/installation-maison.md`](docs/installation-maison.md).
>
> **Pas de serveur à la maison ?** Hébergement gratuit sur Oracle Cloud « Always Free », avec installation automatique : voir [`docs/installation-oracle-cloud.md`](docs/installation-oracle-cloud.md).

L'image est basée sur `node:22-alpine` (disponible en amd64 et arm64 : Synology Intel/AMD, Raspberry Pi 4/5 en 64 bits).

```bash
cp .env.example .env      # puis renseigner NOTION_TOKEN
docker compose up -d --build
```

- Les données sont dans le dossier `./data` (base `scolario.db`), monté dans le conteneur.
- **Synology** (Container Manager) : *Projet › Créer*, choisir le dossier contenant `docker-compose.yml`, puis lancer. Pour un accès depuis l'extérieur en HTTPS, utiliser le *Reverse proxy* de DSM (Panneau de configuration › Portail de connexion › Avancé) et régler `COOKIE_SECURE=true` et `TRUST_PROXY=1`.
- **Raspberry Pi sans Docker** : installer Node 22 puis `npm ci && npm run build && npm start`, avec un service systemd :

```ini
# /etc/systemd/system/scolario.service
[Unit]
Description=Scolario
After=network.target

[Service]
WorkingDirectory=/home/pi/scolario
ExecStart=/usr/bin/npm start
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

---

## Synchronisation Notion

Notion reste **l'outil d'édition** du référentiel ; l'application en garde **sa propre copie** et fonctionne sans Notion au quotidien (pas de latence, pas de quota, pas de dépendance au service).

### Mise en place (une seule fois, gratuit)

1. Aller sur https://www.notion.so/profile/integrations → **Nouvelle intégration** → type *Interne*, capacité *Lire le contenu* uniquement.
2. Copier la clé secrète (`ntn_…`) dans `.env` : `NOTION_TOKEN=ntn_…`
3. Dans Notion, ouvrir chacune des 3 bases → menu `•••` → **Connexions** → ajouter l'intégration :
   - *Référentiel scolaire — Programmes officiels 2026-2027*
   - *Exercices — Banque de tests*
   - *Paramètres de réactivation (Leitner)*
4. Redémarrer l'application, puis *Paramètres › Référentiel & Notion › Synchroniser maintenant*.

La base Notion **reste privée** : l'intégration n'y accède qu'en lecture, sans rien exposer sur internet.

### Fonctionnement

| Point | Choix retenu |
|---|---|
| Déclenchement | Manuel (bouton) **et/ou** planifié (`NOTION_SYNC_INTERVAL_HOURS`, ex. 24) **et/ou** en ligne de commande (`npm run sync:notion`, pratique en tâche planifiée DSM). |
| Incrémental | Les propriétés sont relues à chaque fois ; le contenu des pages (fiches de cours) n'est re-téléchargé que si la page a été modifiée (`last_edited_time`). Bouton « Tout re-télécharger » pour forcer. |
| Conflits | Aucun possible : le socle officiel n'est **pas modifiable** dans l'application (Notion fait foi). Les ajouts du foyer vivent dans des tables à part et ne sont jamais écrasés. |
| Suppressions | Une page supprimée/archivée dans Notion est **désactivée** dans l'application ; l'historique des enfants est conservé. |
| Limite d'API | ≈ 3 requêtes/s respectées, reprise automatique sur erreur 429. |

### Correspondance des propriétés

| Base Notion | Propriété | Utilisation |
|---|---|---|
| Référentiel | `Notion` (titre), `Matiere`, `Niveau`, `Cycle`, `Domaine`, `Sous_domaine`, `Libelle_officiel`, `Statut`, `Source_BO`, `Millesime`, `En_vigueur_depuis`, `Remplace_par`, `Notes`, `Valeur_cible`, `Unite` | Notion du référentiel |
| Référentiel | **contenu de la page** | Fiche de cours (convertie en markdown : titres, gras, listes, tableaux, encadrés) |
| Exercices | `Exercice`, `Type`, `Enonce`, `Options` (séparées par « \| »), `Reponse_attendue`, `Difficulte`, `Notion_liee` | Banque de tests |
| Leitner | `Boite`, `Numero`, `Intervalle_jours`, `Description`, `Regle_succes`, `Regle_echec` | Boîtes de réactivation (un `Regle_echec` mentionnant « signalé au parent » active l'alerte) |

`Matiere = Langues anciennes` est rangé en **Latin** ou **Grec ancien** selon le titre/domaine ; `Langues vivantes optionnelles` en **Espagnol**, **Allemand** ou *Autre LV*.

**Astuce correction** : dans `Reponse_attendue`, plusieurs variantes acceptées peuvent être séparées par `||` (ex. `chantèrent || chanterent`). La correction ignore majuscules, accents et ponctuation finale ; un parent peut toujours « valider » une réponse jugée fausse à tort.

---

## Configuration

Toutes les variables sont facultatives (voir `.env.example`).

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `DB_PATH` | `./data/scolario.db` | Fichier de base SQLite |
| `TZ` | système | Fuseau horaire (échéances, fin de semaine/mois) |
| `NOTION_TOKEN` | — | Clé de l'intégration Notion |
| `NOTION_DB_REFERENTIEL` / `_EXERCICES` / `_LEITNER` | bases actuelles | Identifiants des bases Notion |
| `NOTION_SYNC_INTERVAL_HOURS` | `0` | Synchronisation automatique toutes les N heures |
| `ALLOW_REGISTRATION` | `false` | Autoriser la création d'autres foyers |
| `COOKIE_SECURE` | `false` | `true` si servi en HTTPS |
| `TRUST_PROXY` | — | Derrière un reverse proxy |

---

## Sauvegarde et export

- **Sauvegarde complète** : copier `data/scolario.db` (idéalement application arrêtée, ou avec `sqlite3 data/scolario.db ".backup sauvegarde.db"`). Sur Synology, *Hyper Backup* sur le dossier `data` suffit.
- **Export** : *Paramètres › Export* → JSON complet ou CSV par table (séparateur `;`, UTF-8 avec BOM : s'ouvre directement dans LibreOffice / Excel).

---

## Architecture technique

```
scolario/
├── server/                 API REST (Node.js + Express), indépendante du front
│   ├── src/
│   │   ├── schema.sql      Modèle de données (SQLite)
│   │   ├── seed.js         Niveaux, matières, Leitner, paliers de fluence, démo
│   │   ├── auth.js         Comptes (scrypt), sessions par cookie
│   │   ├── routes/         auth, enfants, référentiel, suivi, points, modules, export
│   │   ├── services/       leitner, correction des réponses, statuts, récompenses, synchro Notion
│   │   └── cli/            synchronisation en ligne de commande
│   ├── seed/               Référentiel de démonstration (JSON)
│   └── test/               Tests (node:test) : services, synchro Notion simulée, parcours API
├── client/                 Interface React (Vite), responsive, installable (PWA)
├── Dockerfile, docker-compose.yml
├── .github/workflows/      CI/CD : tests + image Docker multi-architecture (ghcr.io)
├── deploy/maison/          Déploiement NAS / Raspberry Pi (Cloudflare Tunnel, mises à jour auto)
├── deploy/oracle/          Script d'installation automatique (Oracle Cloud)
└── docs/                   Guide d'utilisation, installation Oracle Cloud
```

- **Base de données** : SQLite via le module `node:sqlite` intégré à Node (aucune compilation native, idéal sur ARM).
- **API séparée du front** (`/api/...`, JSON) : une future application mobile pourra la réutiliser telle quelle.
- **Sécurité** : mots de passe hachés (scrypt), cookie `HttpOnly` + `SameSite=Lax`, requêtes modifiantes en JSON uniquement (anti-CSRF), limitation des tentatives de connexion, cloisonnement strict par foyer.
- **Tâches planifiées** internes (sans cron) : clôture horaire des périodes de récompense, synchronisation Notion périodique, purge des sessions.

### Modèle de données

Conforme à l'esquisse du cahier des charges (§6), avec quelques ajouts : `annee_scolaire` (historique des niveaux), `enfant_matiere` (matières actives), `note_scolaire`, `evaluation_ecrit` (dictées / écriture / production), `palier_fluence`, `alerte`, `categorie_point`, `recompense_catalogue`, `enfant_instrument`, `sync_log`.

---

## Correspondance avec le cahier des charges

| § | Exigence | Statut |
|---|---|---|
| 2 | Foyer multi-adultes / multi-enfants, pas de saisie autonome des enfants | ✅ |
| 3.1 | CRUD enfant, archivage, passage de niveau avec historique, niveaux paramétrables | ✅ |
| 3.2 | Socle figé + ajouts libres (livres, récitations, projets, stages), options, matières libres | ✅ |
| 3.2 bis | Synchronisation périodique Notion → base locale, Notion privée | ✅ |
| 3.3 | Solfège (matière musique), instruments paramétrables, niveaux, morceaux types, statut daté | ✅ |
| 3.4 | Bons/mauvais points, barème, paliers parallèles, report, validation parent, historique | ✅ |
| 3.5 | Synthèse, vue par matière avec progression, vue comparative optionnelle | ✅ |
| 3.6 | Historique horodaté sans écrasement, « acquis » révisable | ✅ |
| 3.7 | Cours + tests + Leitner 5 boîtes paramétré depuis Notion, alerte parent dès la boîte 4 | ✅ |
| 4 | Fluence chiffrée + paliers, écriture qualitative, dictées par type d'erreur, production d'écrit | ✅ |
| 5 | Web responsive, API séparée, auth simple, auto-hébergement, 100 % gratuit | ✅ |
| 7 | Export CSV / JSON dès la V1 | ✅ |

Reste côté **contenu** (hors développement) : lycée hors langues, approfondissement EPS/arts, contenu du module musique (morceaux et solfège à saisir).

---

## Développement

```bash
npm install
npm run dev      # API sur :3000 + interface Vite sur :5173 (proxy /api)
npm test         # tests automatisés
```

Licence : MIT.
