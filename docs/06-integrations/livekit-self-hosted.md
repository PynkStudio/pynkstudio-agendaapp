# LiveKit self-hosted

File in `deploy/livekit/` (non inclusi nel pacchetto npm).

| File | Cosa |
|---|---|
| `compose.yml` | `livekit/livekit-server` + Caddy (TLS del segnale `wss://`), entrambi in `network_mode: host` |
| `Caddyfile` | reverse proxy `{$LIVEKIT_DOMAIN}` → `127.0.0.1:7880` |
| `bootstrap.sh` | genera API key/secret e `livekit.yaml` con il webhook |

## Requisiti

- Host con **IP pubblico** (VPS). Tunnel come Cloudflare Tunnel non trasportano il media WebRTC (UDP).
- DNS: un record A per il dominio della videocall verso l'host.
- Firewall: `80/tcp`, `443/tcp`, `7881/tcp`, `3478/udp`, `50000-60000/udp`.
- Docker con compose.

## Installazione

```bash
LIVEKIT_DOMAIN=video.example.com \
WEBHOOK_URL=https://example.com/api/agenda/livekit-webhook \
./deploy/livekit/bootstrap.sh
cd ~/Services/livekit && docker compose up -d
```

Lo script stampa i valori per l'app (`LIVEKIT_URL`, `LIVEKIT_API_KEY`; il secret resta in `livekit.yaml`, permessi 600). Non sovrascrive un `livekit.yaml` esistente.

## Configurazione generata

`livekit.yaml`: porta 7880, RTC TCP 7881 e UDP 50000-60000 con IP esterno automatico, una coppia di chiavi, webhook verso l'app, TURN su UDP 3478.

## Da verificare

- TURN su TLS/443 non configurato: alcune reti aziendali potrebbero non collegarsi.
- Dimensionamento: non misurato; per call 1:1 un VPS piccolo dovrebbe bastare.

## Alternativa

LiveKit Cloud: nessun server da gestire, stesso pacchetto, basta cambiare URL e chiavi e impostare il webhook dal loro pannello.
