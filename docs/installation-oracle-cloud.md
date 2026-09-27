# Installer Scolario gratuitement sur Oracle Cloud

Oracle Cloud propose une offre **« Always Free »** : une petite machine virtuelle gratuite **sans limite de durée**, largement suffisante pour Scolario. Un script fourni fait toute l'installation technique ; il reste une vingtaine de minutes de clics dans la console Oracle.

> **Coût : 0 €.** Une carte bancaire est demandée à l'inscription pour vérifier votre identité (une empreinte de ~1 € peut apparaître puis être annulée). Tant que vous restez sur les ressources marquées « Always Free », rien n'est facturé.

---

## Étape 1 — Créer le compte (≈ 10 min)

1. Aller sur https://www.oracle.com/fr/cloud/free/ → **Commencer gratuitement**.
2. Renseigner e-mail, pays, puis vérifier l'adresse e-mail.
3. **Région d'origine (« Home Region »)** : choisir **France Central (Paris)** ou **France South (Marseille)**. ⚠️ Ce choix est **définitif** et les ressources gratuites n'existent que dans cette région.
4. Saisir la carte bancaire (vérification uniquement).
5. Attendre l'e-mail « Your account is ready » (quelques minutes, parfois plus).

## Étape 2 — Ouvrir les ports web (≈ 3 min)

Par défaut, le réseau Oracle n'autorise que la connexion SSH. Il faut ouvrir les ports 80 et 443 :

1. Menu ☰ › **Mise en réseau** › **Réseaux cloud virtuels**.
2. Si la liste est vide : **Démarrer l'assistant VCN** › *Créer un VCN avec connectivité Internet* › Suivant › Créer.
3. Ouvrir le VCN › **Listes de sécurité** › *Default Security List* › **Ajouter des règles entrantes** :
   - CIDR source : `0.0.0.0/0` — Protocole : TCP — Plage de ports de destination : `80,443`
4. Enregistrer.

## Étape 3 — Créer la machine avec le script (≈ 5 min)

1. Menu ☰ › **Calcul** › **Instances** › **Créer une instance**.
2. **Nom** : `scolario`.
3. **Image et forme** › *Modifier* :
   - Image : **Canonical Ubuntu 24.04**.
   - Forme : **Ampere › VM.Standard.A1.Flex** avec **1 OCPU et 6 Go de mémoire** (marquée *Always Free*).
     - Si Oracle répond *« Out of capacity »* (fréquent, les machines ARM gratuites sont très demandées) : réessayer plus tard, ou prendre la forme **AMD › VM.Standard.E2.1.Micro** (aussi *Always Free*, suffisante pour Scolario).
4. **Clés SSH** : laisser *Générer une paire de clés* et **télécharger la clé privée** (utile seulement en cas de maintenance ; à garder précieusement).
5. **Afficher les options avancées** › onglet **Gestion** › *Coller le script cloud-init* :
   - Ouvrir le fichier [`deploy/oracle/cloud-init.sh`](../deploy/oracle/cloud-init.sh) du dépôt.
   - Si le dépôt GitHub est **privé**, renseigner `GITHUB_TOKEN` (jeton en lecture seule, voir le commentaire dans le script). S'il est public, ne rien changer.
   - Facultatif : renseigner `NOTION_TOKEN`.
   - Copier **tout** le contenu et le coller dans le champ.
6. **Créer**.

## Étape 4 — Ouvrir l'application (≈ 5 min d'attente)

1. Sur la page de l'instance, noter l'**adresse IP publique**, par exemple `141.145.12.34`.
2. Patienter ~5 minutes (installation automatique).
3. Ouvrir **https://141-145-12-34.sslip.io** (l'IP avec des tirets à la place des points, suivie de `.sslip.io`).
4. Créer le foyer et votre compte : **faites-le tout de suite**, c'est le premier compte créé qui ouvre le foyer, puis les inscriptions se ferment automatiquement.
5. Sur téléphone : menu du navigateur › *Ajouter à l'écran d'accueil* pour l'utiliser comme une application.

Le certificat HTTPS (Let's Encrypt) est obtenu et renouvelé automatiquement.

---

## Et ensuite ?

| Besoin | Comment |
|---|---|
| Ajouter l'autre parent | Dans l'application : *Paramètres › Foyer & adultes* |
| Activer la synchronisation Notion | Voir le README (section « Synchronisation Notion »), puis mettre la clé dans `/opt/scolario/.env` et `sudo systemctl restart scolario` |
| Mettre à jour l'application | Se connecter en SSH puis `sudo scolario-update` |
| Sauvegardes | Automatiques chaque nuit dans `/var/backups/scolario` (30 jours). En complément : *Paramètres › Export* de temps en temps |
| Vérifier que tout tourne | SSH puis `systemctl status scolario` ; journal d'installation : `/var/log/scolario-install.log` |

### Se connecter en SSH (maintenance uniquement)

```bash
chmod 600 ~/Téléchargements/ssh-key-*.key
ssh -i ~/Téléchargements/ssh-key-*.key ubuntu@141.145.12.34
```

### Nom de domaine personnalisé (facultatif)

Avec un domaine à vous (≈ 10 €/an), créer un enregistrement DNS `A` vers l'IP publique, puis remplacer l'adresse `…sslip.io` par votre domaine dans `/etc/caddy/Caddyfile` et lancer `sudo systemctl reload caddy`.

---

## Points de vigilance

- **Inactivité** : Oracle peut récupérer les machines gratuites jugées inactives (usage processeur très faible pendant 7 jours). Pour l'éviter, le plus simple est de passer le compte en **« Pay As You Go »** : il reste gratuit tant que vous restez dans les limites Always Free, et les machines ne sont plus récupérées. Réglez alors une **alerte budgétaire à 1 €** (*Facturation › Budgets*) pour être prévenue au moindre centime.
- **Données** : les sauvegardes quotidiennes restent sur la même machine. Téléchargez régulièrement un export (*Paramètres › Export*) ou le fichier de sauvegarde pour en garder une copie ailleurs.
