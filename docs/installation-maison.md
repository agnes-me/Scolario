# Héberger Scolario à la maison (NAS ou Raspberry Pi), accessible depuis internet

Objectif : l'application tourne **chez vous** (vos données restent chez vous), se **met à jour toute seule** à chaque modification poussée sur GitHub, et reste **accessible depuis n'importe où en HTTPS**, sans VPN et **sans ouvrir de port** sur la box.

**Coût : 0 €**, ou ≈ 10 €/an si vous voulez votre propre nom de domaine (fortement conseillé, voir étape 2).

## Principe

```
 Vous poussez du code ──► GitHub Actions : tests + image Docker (amd64 + arm64)
                                   │
                                   ▼  publiée sur ghcr.io (gratuit)
 NAS / Raspberry ── toutes les 15 min : « y a-t-il une nouvelle image ? » ──► mise à jour
       │
       └── cloudflared ══ tunnel chiffré SORTANT ══► Cloudflare ◄── https://scolario.votre-domaine.fr
                                                          ▲
                                              (optionnel) contrôle d'accès
                                              par code e-mail : Cloudflare Access
```

Pourquoi c'est sûr :

- **Aucun port ouvert** sur la box : le tunnel est une connexion *sortante* depuis la maison. Votre adresse IP n'est pas exposée.
- **HTTPS automatique** (certificat géré par Cloudflare).
- **GitHub ne se connecte jamais chez vous** : c'est le NAS qui va chercher les mises à jour (modèle « pull »). Aucun secret de votre réseau n'est stocké sur GitHub.
- Filtrage anti-attaques et anti-robots de Cloudflare devant l'application.
- En option, **Cloudflare Access** : avant même d'atteindre la page de connexion de Scolario, il faut saisir un code reçu par e-mail, et seules les adresses que vous autorisez passent. C'est une double protection, idéale pour des données d'enfants.

## Matériel compatible

| Matériel | Compatible ? |
|---|---|
| Synology avec **Container Manager** (modèles « + » à processeur Intel/AMD : DS220+, DS920+, DS923+…) | ✅ |
| Synology à processeur ARM (DS220j, DS223…) | ❌ Pas de Docker : utilisez un Raspberry Pi |
| Raspberry Pi 4 ou 5 avec **Raspberry Pi OS 64 bits** + Docker | ✅ |

---

## Étape 1 — Activer la publication de l'image (une seule fois)

Le fichier `.github/workflows/ci.yml` est déjà dans le dépôt : à chaque push, GitHub teste l'application puis publie l'image `ghcr.io/agnes-me/scolario`.

1. Sur GitHub : onglet **Actions** du dépôt → vérifier que le workflow *CI / CD* passe au vert.
2. L'image apparaît dans **Packages** (colonne de droite du dépôt).
3. **Dépôt privé** : l'image l'est aussi. Il faut donc un jeton pour que le NAS puisse la télécharger :
   - GitHub › *Settings* › *Developer settings* › *Personal access tokens* › *Tokens (classic)* › **Generate new token**, avec **uniquement** la case `read:packages`, sans expiration ou avec une longue durée.
   - Sur le NAS ou le Pi (une seule fois) : `docker login ghcr.io -u agnes-me` et coller le jeton comme mot de passe.

## Étape 2 — Créer le tunnel Cloudflare (≈ 15 min)

1. Créer un compte gratuit sur https://dash.cloudflare.com.
2. **Nom de domaine** : Cloudflare Tunnel a besoin d'un domaine géré par Cloudflare.
   - Le plus simple : l'acheter directement chez Cloudflare (*Domain Registration*), à prix coûtant, ≈ 10 €/an pour un `.fr` ou un `.com`.
   - Ou utiliser un domaine que vous possédez déjà, en changeant ses serveurs DNS vers Cloudflare.
3. **Zero Trust** (menu de gauche) › choisir le plan **Free** (jusqu'à 50 utilisateurs ; une carte peut être demandée, rien n'est facturé).
4. *Réseaux* › **Tunnels** › *Créer un tunnel* › type **Cloudflared** › nom : `maison`.
5. Dans l'écran d'installation, choisir **Docker** et copier le **jeton** (la longue chaîne après `--token`).
6. Onglet **Public Hostname** › *Ajouter* :
   - Sous-domaine : `scolario` — Domaine : `votre-domaine.fr`
   - Service : **HTTP** — URL : `scolario:3000`

## Étape 3 — Installer sur le NAS ou le Raspberry Pi (≈ 10 min)

1. Créer un dossier, par exemple `/volume1/docker/scolario` sur Synology ou `~/scolario` sur le Pi.
2. Y copier les fichiers du dossier [`deploy/maison/`](../deploy/maison) du dépôt : `docker-compose.yml`, `.env.example` et `mise-a-jour.sh`.
3. Renommer `.env.example` en `.env` et y coller le `TUNNEL_TOKEN` de l'étape 2.
4. Démarrer :
   - **Synology** : Container Manager › *Projet* › *Créer* › choisir le dossier › *Terminé*.
   - **Raspberry Pi** : `cd ~/scolario && docker compose up -d`
5. Ouvrir **https://scolario.votre-domaine.fr** et **créer le foyer immédiatement** : le premier compte créé ouvre le foyer, puis les inscriptions se ferment.

## Étape 4 — Mises à jour automatiques

Planifier `mise-a-jour.sh` toutes les 15 minutes. Le script ne redémarre l'application que si une nouvelle image a été publiée.

- **Synology** : *Panneau de configuration* › *Planificateur de tâches* › *Créer* › *Tâche planifiée* › *Script défini par l'utilisateur*.
  - Utilisateur : `root`
  - Planification : tous les jours, toutes les 15 minutes
  - Script : `/volume1/docker/scolario/mise-a-jour.sh`
- **Raspberry Pi** : `sudo crontab -e` puis ajouter la ligne `*/15 * * * * /home/pi/scolario/mise-a-jour.sh`.

Le cycle complet devient : vous (ou Claude) poussez une modification → GitHub teste et publie → moins de 15 minutes plus tard, la nouvelle version tourne chez vous.

## Étape 5 (recommandée) — Double protection avec Cloudflare Access

1. Zero Trust › **Access** › *Applications* › *Ajouter* › **Self-hosted**.
2. Domaine : `scolario.votre-domaine.fr`.
3. Politique : action **Allow** › règle *Emails* › saisir les adresses des adultes du foyer.
4. Méthode de connexion : **One-time PIN** (code envoyé par e-mail, rien à installer).

Seules ces adresses pourront afficher l'application, puis chacun se connecte avec son compte Scolario. La session Cloudflare dure par défaut 24 h (réglable jusqu'à un mois).

## Plusieurs applications (appli ménage, etc.)

Un seul tunnel suffit :
1. Ajoutez chaque application au même `docker-compose.yml`, ou dans un autre projet sur le même réseau Docker.
2. Déclarez un *Public Hostname* par application, par exemple `menage.votre-domaine.fr` → `http://menage:8080`.
3. Protégez chacune avec Cloudflare Access si besoin.

## Sauvegardes

Toutes les données sont dans le dossier `data/` (fichier `scolario.db`).

- **Synology** : *Hyper Backup* vers un disque USB ou un stockage cloud (par exemple C2, 15 Go gratuits selon l'offre du moment).
- **Raspberry Pi** : copie planifiée vers le NAS ou une clé USB, avec `sqlite3 data/scolario.db ".backup sauvegarde.db"`.
- En complément : *Paramètres › Export* de temps en temps.

## Dépannage

| Symptôme | Piste |
|---|---|
| Erreur 1033 / 502 sur l'adresse | Le conteneur `cloudflared` ou `scolario` est arrêté : `docker compose ps`, `docker compose logs` |
| `unauthorized` au téléchargement de l'image | Refaire `docker login ghcr.io` (étape 1.3) |
| Le workflow GitHub échoue | Onglet *Actions* → ouvrir l'exécution en rouge pour voir l'erreur |
| Pas de mise à jour après un push | Vérifier que le workflow a publié l'image, puis consulter `mise-a-jour.log` dans le dossier |
