#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Scolario — installation automatique sur une machine Oracle Cloud « Always Free »
# (Ubuntu 22.04 / 24.04, processeur Ampere ARM ou AMD).
#
# Utilisation : coller TOUT ce fichier dans le champ « Cloud-init script »
# (Créer une instance › Afficher les options avancées › Gestion) après avoir
# complété les 3 réglages ci-dessous. L'installation prend ~5 minutes après
# le démarrage de la machine.
#
# Résultat : l'application est servie en HTTPS (certificat Let's Encrypt gratuit,
# via Caddy) à l'adresse https://<IP-avec-des-tirets>.sslip.io
# Journal de l'installation : /var/log/scolario-install.log
# ─────────────────────────────────────────────────────────────────────────────

# ═════════════ RÉGLAGES À COMPLÉTER ═════════════
# Dépôt et branche à installer
REPO="agnes-me/Scolario"
BRANCH="claude/app-development-free-zh5de3"
# Jeton GitHub en lecture seule — uniquement si le dépôt est PRIVÉ (sinon laisser vide).
# GitHub › Settings › Developer settings › Fine-grained tokens › accès « Contents: Read » au dépôt.
GITHUB_TOKEN=""
# Clé de l'intégration Notion (facultatif, peut être ajoutée plus tard dans /opt/scolario/.env)
NOTION_TOKEN=""
# ════════════════════════════════════════════════

set -euo pipefail
exec > >(tee -a /var/log/scolario-install.log) 2>&1
echo "=== Installation de Scolario : $(date) ==="

export DEBIAN_FRONTEND=noninteractive
APP_DIR=/opt/scolario
DATA_DIR=/var/lib/scolario

# 1. Paquets système + Node.js 22 (dépôt officiel NodeSource)
apt-get update -y
apt-get install -y ca-certificates curl git sqlite3 debian-keyring debian-archive-keyring apt-transport-https gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# 2. Caddy (serveur web + HTTPS automatique)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

# 3. Pare-feu de la machine : les images Oracle bloquent tout sauf SSH par défaut
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save || true

# 4. Utilisateur dédié, code et dépendances
id scolario >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin scolario
mkdir -p "$DATA_DIR" /var/backups/scolario
if [ -n "$GITHUB_TOKEN" ]; then URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git"; else URL="https://github.com/${REPO}.git"; fi
rm -rf "$APP_DIR"
git clone --depth 1 --branch "$BRANCH" "$URL" "$APP_DIR"
git -C "$APP_DIR" remote set-url origin "$URL"
cd "$APP_DIR"
npm ci
npm run build
npm prune --omit=dev

# 5. Configuration
IP=$(curl -fsS https://ifconfig.me || curl -fsS https://api.ipify.org)
DOMAINE="$(echo "$IP" | tr '.' '-').sslip.io"
cat > "$APP_DIR/.env" <<EOF
PORT=3000
HOST=127.0.0.1
DB_PATH=$DATA_DIR/scolario.db
TZ=Europe/Paris
NOTION_TOKEN=$NOTION_TOKEN
NOTION_SYNC_INTERVAL_HOURS=24
ALLOW_REGISTRATION=false
COOKIE_SECURE=true
TRUST_PROXY=1
EOF
chown -R scolario:scolario "$APP_DIR" "$DATA_DIR" /var/backups/scolario
chmod 600 "$APP_DIR/.env"

# 6. Service systemd (redémarrage automatique)
cat > /etc/systemd/system/scolario.service <<EOF
[Unit]
Description=Scolario
After=network.target

[Service]
Type=simple
User=scolario
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node --env-file=$APP_DIR/.env --disable-warning=ExperimentalWarning server/src/index.js
Restart=always
RestartSec=5
Environment=TZ=Europe/Paris

[Install]
WantedBy=multi-user.target
EOF

# 7. Caddy : HTTPS automatique vers l'application
cat > /etc/caddy/Caddyfile <<EOF
$DOMAINE {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
EOF

# 8. Sauvegarde quotidienne (30 derniers jours conservés)
cat > /usr/local/bin/scolario-backup <<EOF
#!/bin/bash
sqlite3 $DATA_DIR/scolario.db ".backup '/var/backups/scolario/scolario-\$(date +%F).db'"
find /var/backups/scolario -name 'scolario-*.db' -mtime +30 -delete
EOF
chmod +x /usr/local/bin/scolario-backup
echo "15 3 * * * scolario /usr/local/bin/scolario-backup" > /etc/cron.d/scolario-backup

# 9. Commande de mise à jour : « sudo scolario-update »
cat > /usr/local/bin/scolario-update <<EOF
#!/bin/bash
set -e
/usr/local/bin/scolario-backup
cd $APP_DIR
sudo -u scolario git pull --ff-only
sudo -u scolario npm ci
sudo -u scolario npm run build
sudo -u scolario npm prune --omit=dev
systemctl restart scolario
echo "Scolario mis à jour."
EOF
chmod +x /usr/local/bin/scolario-update

systemctl daemon-reload
systemctl enable --now scolario
systemctl restart caddy

echo "$DOMAINE" > /etc/scolario-adresse
echo "=== Terminé. Adresse de l'application : https://$DOMAINE ==="
