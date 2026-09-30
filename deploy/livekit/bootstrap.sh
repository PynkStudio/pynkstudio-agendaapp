#!/usr/bin/env bash
# Prepara una cartella di deploy LiveKit con chiavi nuove.
# Uso: LIVEKIT_DOMAIN=video.example.com WEBHOOK_URL=https://example.com/api/agenda/livekit-webhook ./bootstrap.sh
set -euo pipefail

ROOT="${LIVEKIT_HOME:-$HOME/Services/livekit}"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${LIVEKIT_DOMAIN:?imposta LIVEKIT_DOMAIN (es. video.example.com)}"
: "${WEBHOOK_URL:?imposta WEBHOOK_URL (rotta livekitWebhook della app host)}"

mkdir -p "$ROOT"
cp "$TEMPLATE_DIR/compose.yml" "$TEMPLATE_DIR/Caddyfile" "$ROOT/"

if [[ -f "$ROOT/livekit.yaml" ]]; then
  printf 'Esiste gia %s; non lo sovrascrivo.\n' "$ROOT/livekit.yaml"
  exit 0
fi

API_KEY="API$(openssl rand -hex 6)"
API_SECRET="$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48)"

cat > "$ROOT/livekit.yaml" <<YAML
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  $API_KEY: $API_SECRET
webhook:
  api_key: $API_KEY
  urls:
    - $WEBHOOK_URL
turn:
  enabled: true
  domain: $LIVEKIT_DOMAIN
  udp_port: 3478
YAML
chmod 600 "$ROOT/livekit.yaml"
printf 'LIVEKIT_DOMAIN=%s\n' "$LIVEKIT_DOMAIN" > "$ROOT/.env"

cat <<MSG
Creato $ROOT. Variabili per l'app host (NON committarle):
  LIVEKIT_URL=wss://$LIVEKIT_DOMAIN
  LIVEKIT_API_KEY=$API_KEY
  LIVEKIT_API_SECRET=<in $ROOT/livekit.yaml>
Firewall: apri 80/tcp, 443/tcp, 7881/tcp, 3478/udp, 50000-60000/udp.
Avvio: cd $ROOT && docker compose up -d
MSG
