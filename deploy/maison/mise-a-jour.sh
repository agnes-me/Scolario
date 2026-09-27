#!/bin/sh
# Mise à jour automatique : à planifier toutes les 15 minutes
# (Synology : Panneau de configuration › Planificateur de tâches › Script défini par l'utilisateur, utilisateur root ;
#  Raspberry Pi : « sudo crontab -e » puis « */15 * * * * /chemin/vers/mise-a-jour.sh »).
# Ne redémarre l'application que si GitHub a publié une nouvelle image.
set -e
cd "$(dirname "$0")"
AVANT=$(docker compose images -q scolario 2>/dev/null || true)
docker compose pull --quiet
docker compose up -d --remove-orphans
APRES=$(docker compose images -q scolario 2>/dev/null || true)
if [ "$AVANT" != "$APRES" ]; then
  echo "$(date '+%F %T') Scolario mis à jour" >> mise-a-jour.log
  docker image prune -f >/dev/null
fi
