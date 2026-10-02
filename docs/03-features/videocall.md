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

Dalla 0.2.0 l'interfaccia è propria del pacchetto, nello stile delle app di riunione più diffuse (vedi [[adr-0005-interfaccia-call-stile-meet]]). File: `src/video/react.tsx`, `lobby.tsx`, `room.tsx`, `styles.css`.

```tsx
import "@pynkstudio/agendaapp/video/styles.css";
import { AgendaVideoCall } from "@pynkstudio/agendaapp/video/react";

<AgendaVideoCall
  displayName="Ada Lovelace · Analytical Engines"   // nome mostrato in lobby
  title="Call conoscitiva · 20 min"                  // lobby + barra in basso
  getAccess={() => fetch(...).then((r) => r.json())} // handler videoToken
  labels={{ join: "Partecipa", ... }}                // testi nella lingua dell'app
/>
```

### Lobby («Pronto a partecipare?»)

- Anteprima della videocamera (specchiata), indicatore del livello del microfono.
- Pulsanti tondi microfono / videocamera; scelta di microfono, altoparlante e videocamera.
- **Nome fisso**: «Parteciperai come …». Non è modificabile dall'utente: il nome che vedono gli altri è quello scritto nel token dal server.
- Se il browser blocca i dispositivi: avviso e pulsanti spenti; si può entrare comunque e riprovare dalla call.

### Call

| Situazione | Layout |
|---|---|
| Da solo | il proprio riquadro + «In attesa che altri partecipino» |
| In due | l'altra persona a tutto schermo, il proprio riquadro in basso a destra |
| Tre o più | griglia automatica |
| Qualcuno presenta | schermo condiviso grande, partecipanti in una colonna laterale |

Ogni riquadro: video o avatar con iniziali (colore stabile per nome), nome, microfono spento, bordo quando parla.

Barra in basso: ora e titolo · microfono e videocamera con menu dispositivi (freccia) · condividi schermo (se il browser lo supporta) · esci (rosso) · Persone (con conteggio) · Chat (con non letti). Scorciatoie: Ctrl/⌘+D microfono, Ctrl/⌘+E videocamera. Avvisi: riconnessione, dispositivo non disponibile, audio bloccato dal browser (pulsante per attivarlo).

Di default si apre **a schermo intero** con un portale su `document.body` (prop `fullscreen`, default `true`), così nessun antenato con `transform` la intrappola.

### Nomi

- Ospite: `guestDisplayName(booking)` nella config del server (default: il nome della prenotazione). Esempio: `${name} · ${answers.company}`. Il server lo restituisce anche come `displayName` dal handler `videoToken`; per la lobby la pagina lo legge con `agenda.guestDisplayName(booking)`.
- Staff: il `name` restituito da `authorizeHost` (consigliato: nome e cognome dell'utente).

### Stile

Importare una volta `@pynkstudio/agendaapp/video/styles.css`. Colori neutri, tutti sovrascrivibili con le variabili `--agv-*` su `.agv` (o un antenato): `--agv-bg`, `--agv-surface`, `--agv-surface-2`, `--agv-panel`, `--agv-panel-text`, `--agv-text`, `--agv-muted`, `--agv-accent`, `--agv-accent-text`, `--agv-danger`, `--agv-speaking`, `--agv-radius`, `--agv-font`, `--agv-z`. Non serve più `@livekit/components-styles`.

## Da verificare

- Collegamento da reti aziendali molto restrittive: il deploy di esempio non configura TURN su TLS/443.
