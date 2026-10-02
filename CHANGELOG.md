# Changelog

Formato: [SemVer](https://semver.org). Ogni voce indica anche i passi richiesti ai progetti che usano il pacchetto.

## 0.4.0 — 2026-10-02

- **Calendario di destinazione per persona**: le call assegnate vengono inserite in automatico nel calendario scelto (Google, Microsoft, CalDAV/iCloud) e tolte se annullate. `hostCalendarEvent` nella config per titolo e testo; `external_event` sulla prenotazione.
- **«Salva sul calendario» per l'ospite**: `eventIcs`, `googleCalendarLink`, `outlookCalendarLink` in `/core`; `agenda.guestCalendarEvent(booking)`; handler `guestIcs`; `guestCalendarEvent` nella config.
- Impostazioni: scelta della destinazione per ogni persona; `GET calendarsManage?connectionId` elenca i calendari scrivibili.
- OAuth: scope di scrittura (Google `calendar.calendarlist.readonly` + `calendar.events`; Microsoft `Calendars.ReadWrite`).

**Per i progetti:** applicare `migrations/0003_host_calendar_destination.sql` **prima** di aggiornare (le query leggono `external_event` e le colonne di destinazione). Aggiornare gli scope delle app OAuth; le connessioni Google/Microsoft esistenti vanno ricollegate per poter scrivere.

## 0.3.0 — 2026-10-02

Staff, capienza, calendari collegati, festività, pagina impostazioni ([ADR-0006](docs/04-decisions/adr-0006-staff-capienza-calendari.md)).

- **Capienza**: `capacity` per fascia in modalità posti; `AgendaSlot.remaining`.
- **Staff**: `staffing: { mode: "hosts", hostIds }`; un orario ha tanti posti quante persone libere (orari personali, prenotazioni, blocchi, calendari collegati); assegnazione alla persona meno occupata; `booking.hostId`.
- **Calendari collegati** (sola lettura): Google (OAuth), Microsoft 365 / Outlook (OAuth), Apple iCloud e altri CalDAV (password specifica per app), link ICS. Credenziali cifrate; stato di errore visibile; cache.
- **Festività**: `holidays: ["IT"]` (festività nazionali italiane, Pasqua calcolata).
- **Impostazioni a database** (`agenda_event_types`) sopra i default del codice; staff in `agenda_hosts`.
- **Pagina impostazioni**: `@pynkstudio/agendaapp/settings/react` + `settings/styles.css`, testi it/en.
- Handler nuovi: `settingsGet`, `settingsSaveEventType`, `settingsUpdateHost`, `calendarsManage`, `calendarOAuthStart`, `calendarOAuthCallback`; opzione `listStaff`.
- Dipendenza nuova: `ical.js` (server).

**Per i progetti (breaking):** applicare `migrations/0002_hosts_settings_calendars.sql` **prima** di aggiornare (le query leggono `host_id`); `agenda.eventType()` e `listBookableDays()` ora restituiscono Promise; `addBlock` senza `calendar` chiude tutto lo scope (`*`). Facoltativo: `calendars` nella config e `AGENDA_CREDENTIALS_KEY`.

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
