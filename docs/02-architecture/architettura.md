# Architettura

## Principio

Il pacchetto possiede **comportamento e struttura**; l'app possiede **identità e canali**. Nessun valore di progetto nel codice: tutto arriva da configurazione, props o dati. Vedi [[adr-0001-pacchetto-a-configurazione-esplicita]].

## Entrypoint

| Import | Ambiente | File | Contenuto |
|---|---|---|---|
| `/core` | browser + server | `src/core/` | tipi, fusi (`time.ts`), slot (`availability.ts`) |
| `/react` | browser | `src/react/` | `useAgendaBooking`, `AgendaBookingWidget` |
| `/video/react` | browser | `src/video/react.tsx`, `lobby.tsx`, `room.tsx`, `icons.tsx`, `avatar.tsx`, `labels.ts` | `AgendaVideoCall`, lobby e stanza stile Meet (unici file che importano LiveKit client) |
| `/video/styles.css` | browser | `src/video/styles.css` | stile della call, variabili `--agv-*` |
| `/settings/react` | browser | `src/settings/` | `AgendaSettingsPanel`, testi it/en |
| `/settings/styles.css` | browser | `src/settings/styles.css` | stile delle impostazioni, variabili `--ags-*` |
| `/server` | server | `src/server/`, `src/calendars/` | `createAgendaServer`, impostazioni e staff (`settings.ts`), calendari esterni (`src/calendars/`: OAuth, Google, Microsoft, CalDAV, ICS, cifratura) |
| `/http` | server | `src/http/` | `createAgendaHandlers` |
| `/video/server` | server | `src/video/livekit.ts` | JWT LiveKit e verifica webhook su `node:crypto` |
| `/migrations/*` | — | `migrations/` | SQL |

**Confine browser/server**: `core` e `react` non importano `node:*` né accedono al DB. Importare `/server` da codice client fallisce il bundle, ed è voluto.

## Componenti

```mermaid
flowchart LR
  subgraph App ospite
    UI[UI della app<br/>useAgendaBooking] -->|fetch| R[route HTTP dell'app]
    P[pagina call ospite<br/>AgendaVideoCall] -->|videoToken| R
  end
  R --> H[createAgendaHandlers]
  H --> S[createAgendaServer]
  S --> DB[(Postgres<br/>agenda_*)]
  S -->|hook| N[email / CRM / push<br/>della app]
  P <-->|WebRTC| LK[server LiveKit]
  LK -->|webhook firmato| R
```

## Flusso di prenotazione

1. `GET availability` senza data → giorni prenotabili (nel fuso del tipo di appuntamento).
2. `GET availability?date=` → slot con `available` e `remaining`: per ogni risorsa (posto o persona) si tolgono prenotazioni, blocchi e occupati dei calendari collegati; il numero di risorse libere è la capienza dello slot ([[staff-e-capienza]]).
3. `POST book` → il server **ricontrolla** che l'orario sia uno slot valido ([[prenotazione-e-disponibilita]]), controlla i blocchi, inserisce. Il vincolo di esclusione del DB rifiuta le sovrapposizioni (409).
4. Hook `onBookingCreated` con `booking`, `guestUrl`, `extra` → l'app manda la conferma ([[link-ospite-ed-email]]).

## Flusso della videocall

1. L'ospite apre `guestUrl` → la pagina dell'app chiama `videoToken` con `bookingId` + `token`.
2. Il server verifica il token, lo stato e la finestra oraria e firma un JWT LiveKit per la stanza `agenda-<id>`.
3. `AgendaVideoCall` mostra la lobby (anteprima, dispositivi, nome fisso) e poi la stanza a schermo intero ([[videocall]]).
4. LiveKit invia i webhook → eventi salvati, `video_started_at`, stato «completed» a stanza chiusa. Vedi [[videocall]].

## Configurazione

`AgendaServerConfig` (`src/server/config.ts`): `db`, `eventTypes` (default, sovrascrivibili dalle impostazioni), `signingSecret`, `video`, `calendars`, `guestUrl`, `guestDisplayName`, `hooks`, `tables`, `logger`, `now`. Gli hook sono attesi dopo la scrittura e i loro errori sono registrati senza annullare la prenotazione.
