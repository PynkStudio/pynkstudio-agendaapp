# Calendari collegati

In modalità «persone» ([[staff-e-capienza]]) ogni persona può collegare uno o più calendari: gli orari in cui è occupata non vengono proposti. Il pacchetto **legge** soltanto (vedi [[backlog]] per la scrittura degli appuntamenti).

| Provider | Come si collega | Cosa legge |
|---|---|---|
| Google Calendar | OAuth (`calendar.freebusy`) | free/busy del calendario principale |
| Outlook / Microsoft 365 | OAuth (`Calendars.Read`) | `calendarView` del calendario predefinito, esclusi eventi «libero» e annullati |
| Apple iCloud | CalDAV con **password specifica per app** | tutti i calendari di eventi dell'account |
| Altri CalDAV (Fastmail, Nextcloud…) | CalDAV con server indicato | idem |
| Link ICS | indirizzo `.ics` (anche `webcal://`) | qualsiasi calendario pubblicato o con indirizzo segreto |

Per CalDAV e ICS il pacchetto espande le ricorrenze (RRULE, EXDATE, eccezioni) con `ical.js` e ignora gli eventi trasparenti («mostra come libero») o annullati.

## Configurazione nell'app

```ts
createAgendaServer({
  // …
  calendars: {
    credentialsKey: process.env.AGENDA_CREDENTIALS_KEY!, // ≥ 32 caratteri, non cambiarla dopo
    redirectUri: (provider) => `https://example.com/api/agenda/calendar/callback/${provider}`,
    google: { clientId: process.env.AGENDA_GOOGLE_CLIENT_ID!, clientSecret: process.env.AGENDA_GOOGLE_CLIENT_SECRET! },
    microsoft: { clientId: process.env.AGENDA_MICROSOFT_CLIENT_ID!, clientSecret: process.env.AGENDA_MICROSOFT_CLIENT_SECRET! },
    cacheSeconds: 120,
  },
});
```

Senza `google` / `microsoft` i rispettivi pulsanti compaiono disattivati; CalDAV e ICS funzionano con la sola `credentialsKey`.

### App OAuth da creare

**Google** (Google Cloud Console → API e servizi):
1. Abilitare *Google Calendar API*.
2. Schermata di consenso OAuth con lo scope `…/auth/calendar.freebusy` (oltre a `openid`, `email`). È uno scope sensibile: per utenti esterni all'organizzazione Google richiede la **verifica dell'app**; finché non è verificata funziona solo per gli utenti di test indicati.
3. Credenziali → ID client OAuth «Applicazione web», URI di reindirizzamento = `redirectUri("google")`.

**Microsoft** (Microsoft Entra ID → Registrazioni app):
1. Nuova registrazione, account «di qualsiasi organizzazione e personali» (tenant `common`).
2. URI di reindirizzamento Web = `redirectUri("microsoft")`.
3. Autorizzazioni delegate Microsoft Graph: `Calendars.Read`, `User.Read`, `offline_access`, `openid`, `email`.
4. Certificati e segreti → nuovo segreto client.

### Route da montare

| Route (esempio) | Handler |
|---|---|
| `GET /api/agenda/calendar/connect` | `calendarOAuthStart` (staff) |
| `GET /api/agenda/calendar/callback/google` | `calendarOAuthCallback(req, "google")` |
| `GET /api/agenda/calendar/callback/microsoft` | `calendarOAuthCallback(req, "microsoft")` |
| `POST/DELETE /api/agenda/calendars` | `calendarsManage` (CalDAV, ICS, scollega) |

Il callback non richiede sessione: lo `state` OAuth è firmato con `signingSecret`, scade dopo 15 minuti e porta scope, persona e pagina di ritorno (solo percorsi interni, niente redirect aperti).

## Sicurezza

- Credenziali (token OAuth, password CalDAV, URL ICS segreti) cifrate con **AES-256-GCM** in `agenda_calendar_connections.credentials`, chiave derivata da `credentialsKey`. Mai restituite al browser.
- I token scaduti si rinnovano da soli; Microsoft ruota anche il refresh token e il pacchetto salva quello nuovo.
- Cambiare `credentialsKey` rende illeggibili tutte le connessioni: vanno ricollegate.

## Affidabilità

- Gli occupati si leggono **per giornata** e restano in cache `cacheSeconds` (default 120 s) per istanza.
- Se un calendario non risponde, la connessione passa a stato `error` con il messaggio, visibile nelle impostazioni, e quel calendario viene **ignorato** (fail-open): meglio un rischio di sovrapposizione segnalato che un'agenda vuota. Torna `ok` alla prima lettura riuscita.
- **Da verificare** con account reali: Google e Microsoft sono testati con risposte simulate; CalDAV con un server simulato in stile iCloud.
