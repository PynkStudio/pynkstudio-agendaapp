# Pagina impostazioni

`AgendaSettingsPanel` (`@pynkstudio/agendaapp/settings/react`) è la pagina con cui chi gestisce l'agenda decide orari, giorni, posti e collega i calendari. Testi inclusi in italiano e inglese (`locale`), sovrascrivibili con `labels`.

```tsx
import "@pynkstudio/agendaapp/settings/styles.css";
import { AgendaSettingsPanel } from "@pynkstudio/agendaapp/settings/react";

<AgendaSettingsPanel
  endpoints={{
    settings: "/api/agenda/settings",          // GET settingsGet, PUT settingsSaveEventType
    host: "/api/agenda/settings/host",         // PATCH settingsUpdateHost
    calendars: "/api/agenda/calendars",        // POST/DELETE calendarsManage
    oauthStart: "/api/agenda/calendar/connect", // GET calendarOAuthStart
  }}
  returnTo="/admin/agenda/impostazioni"
  locale="it"
/>
```

Tutti gli endpoint richiedono `authorizeHost`.

## Sezioni

1. **Appuntamento** — nome, durata, intervallo tra gli orari proposti, pausa dopo ogni appuntamento, preavviso minimo, giorni prenotabili, modalità (video / telefono / di persona).
2. **Chi riceve le prenotazioni** — «Posti manuali» o «Persone dello staff» con la scelta delle persone ([[staff-e-capienza]]).
3. **Orari settimanali** — fasce per giorno; in modalità posti ogni fascia ha il numero di posti.
4. **Festività e chiusure** — calendari festivi (es. Italia) e giorni di chiusura singoli.
5. **Staff e calendari** — per persona: riceve/non riceve prenotazioni, calendari collegati con stato e ultima lettura, pulsanti di collegamento, **«Inserisci le call nel calendario»** (connessione + calendario di destinazione), orari personali ([[calendari-collegati]]).

Il salvataggio scrive in `agenda_event_types` (validato lato server con `mergeEventTypeSettings`); «Ripristina i valori predefiniti» cancella la riga e torna ai valori del codice. Le impostazioni sono lette con una cache di 15 secondi per istanza.

## Stile

Importare `@pynkstudio/agendaapp/settings/styles.css`; colori neutri sovrascrivibili su `.ags`: `--ags-text`, `--ags-muted`, `--ags-surface`, `--ags-card`, `--ags-line`, `--ags-accent`, `--ags-accent-text`, `--ags-danger`, `--ags-ok`, `--ags-radius`, `--ags-font`, `--ags-savebar-bg`.

## Prova

`npm run playground` → `http://localhost:5180/settings`: pannello vero su un database in memoria ([[playground-video]]).
