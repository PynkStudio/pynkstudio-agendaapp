# Changelog

Formato: [SemVer](https://semver.org). Ogni voce indica anche i passi richiesti ai progetti che usano il pacchetto.

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
