# Changelog

Formato: [SemVer](https://semver.org). Ogni voce indica anche i passi richiesti ai progetti che usano il pacchetto.

## 0.2.0 — 2026-10-02

Interfaccia della call stile Meet ([ADR-0005](docs/04-decisions/adr-0005-interfaccia-call-stile-meet.md)).

- `AgendaVideoCall` riscritto: lobby «Pronto a partecipare?» con anteprima, livello microfono, scelta di microfono/altoparlante/videocamera e nome fisso; stanza con layout solo / 1:1 / griglia / presentazione, barra con microfono e videocamera (menu dispositivi), condivisione schermo, uscita, pannelli Persone e Chat, avvisi, scorciatoie Ctrl/⌘+D ed E; schermo intero via portale.
- Nuovo `@pynkstudio/agendaapp/video/styles.css` con variabili `--agv-*`.
- Server: `guestDisplayName` in config e `agenda.guestDisplayName(booking)`; il nome entra nel token e `issueVideoAccess` / handler `videoToken` restituiscono `displayName`.
- Esportati anche `AgendaLobby`, `AgendaMeetRoom`, `DEFAULT_VIDEO_LABELS`.
- `playground/` per lo sviluppo della UI.

**Per i progetti (breaking):** `displayName` è ora obbligatorio in `AgendaVideoCall`; importare `@pynkstudio/agendaapp/video/styles.css` al posto di `@livekit/components-styles`; le etichette hanno nuove chiavi (vedi `AgendaVideoCallLabels`).

## 0.1.0 — 2026-09-30

Prima versione.

- `/core`: tipi, fusi orari con ora legale, calcolo slot da finestre settimanali.
- `/server`: `createAgendaServer` — disponibilità, prenotazione, annullamento, esiti, blocchi, promemoria, accesso video, webhook LiveKit, link ospite (`guestUrl`, `guestUrlFor`).
- `/http`: `createAgendaHandlers` (availability, book, videoToken, guestCancel, hostList, hostUpdate, livekitWebhook).
- `/video/server`, `/video/react`: token/webhook LiveKit su `node:crypto`, `AgendaVideoCall`.
- `/react`: `useAgendaBooking`, `AgendaBookingWidget`.
- `migrations/0001_agenda_schema.sql`.
- `deploy/livekit/`: server LiveKit self-hosted.

**Per i progetti:** applicare `0001_agenda_schema.sql`; impostare `AGENDA_SIGNING_SECRET`; mettere `guestUrl` nelle email di conferma e promemoria.
