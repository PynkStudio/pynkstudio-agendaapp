# Integrare Agendaapp in un progetto

Checklist completa. Gli esempi usano Next.js App Router; con altri host cambia solo il montaggio delle route.

## 1. Dipendenze

- `@pynkstudio/agendaapp` dal tarball del tag (vedi `README.md`).
- Per la videocall: `livekit-client`, `@livekit/components-react`; nella pagina della call `import "@pynkstudio/agendaapp/video/styles.css"`.

## 2. Database

Applica `migrations/0001_agenda_schema.sql` e `migrations/0002_hosts_settings_calendars.sql` (copiandole tra le migration del progetto). Verifica che esistano le tre tabelle e il vincolo `agenda_bookings_no_overlap`.

## 3. Variabili d'ambiente

`AGENDA_SIGNING_SECRET` (casuale, ≥ 16 caratteri, definitiva), `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

## 4. Runtime (un modulo solo server)

- `createAgendaServer` con `db`, `eventTypes`, `signingSecret`, `video`, **`guestUrl`** e hook.
- **`onBookingCreated` invia la conferma con `guestUrl`** — vedi [[link-ospite-ed-email]]. È il passo che più facilmente si dimentica.
- `onBookingCancelled` se serve avvisare qualcuno.
- `createAgendaHandlers` con `authorizeHost` (staff) e `requiredFields`.
- Crea l'istanza in modo pigro se l'assenza di env non deve rompere la build.

## 5. Route

| Route (esempio) | Handler |
|---|---|
| `GET /api/agenda/availability` | `availability` |
| `POST /api/agenda/book` | `book` |
| `POST /api/agenda/video-token` | `videoToken` |
| `POST /api/agenda/cancel` | `guestCancel` (opzionale) |
| `GET/PATCH /api/agenda/admin` | `hostList` / `hostUpdate` |
| `POST /api/agenda/livekit-webhook` | `livekitWebhook` (serve il body grezzo) |

Lo scope lo decide l'app per ogni richiesta (`{ scope }`).

## 6. Pagine

- Prenotazione: `useAgendaBooking` o `AgendaBookingWidget`.
- **Route di ingresso** all'URL di `guestUrl`: sposta il token in un cookie httpOnly e reindirizza all'URL pulito (i tracker non devono vedere il token, vedi [[link-ospite-ed-email]]).
- **Pagina ospite**: noindex, token letto dal cookie, `AgendaVideoCall` con `displayName={agenda.guestDisplayName(booking)}` e `getAccess` verso `videoToken` passando `token`.
- Pagina staff: `AgendaVideoCall` con `displayName` = nome e cognome dell'utente (lo stesso di `authorizeHost`) e `getAccess` senza token.
- Tema: sovrascrivi le variabili `--agv-*` con i colori dell'app.
- Agenda staff: tabella/calendario costruiti su `hostList`/`hostUpdate`.

## 6b. Impostazioni, staff e calendari (facoltativo)

- Pagina impostazioni con `AgendaSettingsPanel` e gli handler `settingsGet`, `settingsSaveEventType`, `settingsUpdateHost`, `calendarsManage`, `calendarOAuthStart`, `calendarOAuthCallback` ([[impostazioni]]).
- Opzione `listStaff` degli handler (o `agenda.settings.syncHosts`) per tenere allineato lo staff.
- `calendars` nella config del server, app OAuth Google/Microsoft e `AGENDA_CREDENTIALS_KEY` ([[calendari-collegati]]).

## 7. Promemoria

Cron che chiama `claimDueReminders` e invia con `guestUrlFor` ([[promemoria]]).

## 8. LiveKit

Server come in [[livekit-self-hosted]], con webhook verso la route del punto 5.

## 9. Collaudo

1. Prenota uno slot → controlla riga in `agenda_bookings` ed **email con il link**; aprendolo, l'URL finale nella barra non deve contenere il token.
2. Riprova lo stesso slot → 409.
3. Apri il link troppo presto → messaggio con l'orario di apertura.
4. Entra come ospite e come staff → audio/video in entrambe le direzioni.
5. Esci da entrambi → `agenda_video_events` popolata, stato `completed`.
6. Promemoria ricevuto una sola volta, con lo stesso link.
