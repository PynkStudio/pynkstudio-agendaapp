# Videocall

Basata su LiveKit (SFU WebRTC). Il server si installa come in [[livekit-self-hosted]]; va bene anche LiveKit Cloud cambiando URL e chiavi.

## Stanze

- Una stanza per prenotazione `video`: nome `<roomPrefix><bookingId>` (default `agenda-`), salvato in `video_room`.
- La stanza si crea al primo ingresso: nessuna chiamata preventiva a LiveKit.

## Chi entra e quando

`issueVideoAccess` (`src/server/agenda.ts`):

| | Ospite | Staff |
|---|---|---|
| Autenticazione | token del link ([[link-ospite-ed-email]]) | `authorizeHost` dell'app |
| Da quando | `joinEarlyMinutes` prima (default 10) | sempre |
| Fino a quando | `joinLateMinutes` dopo la fine (default 30) | uguale |
| Identità LiveKit | `guest:<bookingId>`, nome = nome della prenotazione | `host:<identity>` |
| `roomAdmin` | no | sì |

Errori: `forbidden`, `not_found`, `not_video`, `cancelled`, `too_early` (con `opensAt`), `ended`, `video_disabled` (config `video` assente).

## Token

JWT HS256 firmato con l'API secret, claim `iss` = API key, `sub` = identità, `video.room`, permessi di pubblicazione. Durata `tokenTtlSeconds` (default 2 ore). Scritto su `node:crypto`, senza `livekit-server-sdk`: vedi [[adr-0002-livekit-senza-sdk-server]].

## Webhook

Da configurare nel server LiveKit verso la route dell'app montata con `livekitWebhook`.

- Verifica: header `Authorization` = JWT firmato con il secret, `iss` uguale alla nostra API key, claim `sha256` uguale all'hash del body. Qualsiasi anomalia → 401.
- Eventi di stanze non nostre → accettati e ignorati (più app possono condividere un LiveKit).
- Salvataggio idempotente per `id` evento.
- `participant_joined` → `video_started_at` (primo ingresso).
- `room_finished` → `video_ended_at`; se qualcuno era entrato, lo stato passa a `completed`.
- Hook `onVideoEvent` per l'app.

## Interfaccia

`AgendaVideoCall` (`/video/react`): prova di microfono/videocamera (`PreJoin`), poi `LiveKitRoom` + `VideoConference`. Il token viene chiesto con `getAccess()` al clic su «entra», quindi è sempre fresco. Etichette sovrascrivibili (`labels`, incluso `tooEarly(opensAt)`).

Stile: l'app importa `@livekit/components-styles` e personalizza con le variabili `--lk-*`. Il pacchetto non porta colori.

## Da verificare

- Collegamento da reti aziendali molto restrittive: il deploy di esempio non configura TURN su TLS/443.
