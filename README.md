# Agendaapp

Pacchetto riusabile per **prenotare appuntamenti e farli in videocall**: orari prenotabili, prenotazioni, promemoria e stanze video [LiveKit](https://livekit.io). Nessun progetto è cablato dentro: orari, fusi, testi, colori e URL li decide l'app che lo usa.

```
ospite sceglie giorno e ora ──▶ prenotazione ──▶ email di conferma con il link personale
                                      │
                                      ▼
              promemoria (con lo stesso link) ──▶ pagina dell'ospite ──▶ videocall LiveKit
                                                                            ▲
                                                 lo staff entra dalla propria agenda
```

## Cosa fa

- **Disponibilità** — finestre settimanali per tipo di appuntamento, in qualsiasi fuso IANA con ora legale gestita; preavviso minimo, pause tra un appuntamento e l'altro, giorni chiusi, blocchi puntuali (ferie).
- **Capienza e staff** — più appuntamenti nello stesso orario: posti decisi a mano per fascia, oppure tante prenotazioni quante persone dello staff libere ([docs/03-features/staff-e-capienza.md](docs/03-features/staff-e-capienza.md)).
- **Calendari collegati** — Google, Outlook/Microsoft 365, Apple iCloud (e altri CalDAV), link ICS: gli orari occupati delle persone non vengono proposti ([docs/03-features/calendari-collegati.md](docs/03-features/calendari-collegati.md)).
- **Call nel calendario dello staff** — ogni persona sceglie un calendario in cui le call assegnate vengono inserite (e tolte se annullate).
- **«Salva sul calendario» per i clienti** — file `.ics` e link Google / Outlook da mettere nelle email ([docs/03-features/link-ospite-ed-email.md](docs/03-features/link-ospite-ed-email.md)).
- **Festività** — chiusura automatica delle festività nazionali italiane.
- **Pagina impostazioni** — orari, giorni, posti, chiusure, staff e calendari, pronta all'uso in italiano e inglese ([docs/03-features/impostazioni.md](docs/03-features/impostazioni.md)).
- **Prenotazioni** — crea, annulla (staff o ospite), segna conclusa / non presentato, elenca. La doppia prenotazione è impossibile anche con richieste simultanee: la garantisce un vincolo del database.
- **Link personale dell'ospite** — un token derivato (HMAC), non salvato: conferma e promemoria contengono lo stesso link anche a giorni di distanza.
- **Videocall** — token d'accesso LiveKit e verifica dei webhook, più un componente React con prova di microfono/videocamera e la conferenza.
- **HTTP** — handler standard `Request → Response`, montabili come route di Next.js o in qualunque runtime basato su fetch.
- **React** — un hook senza grafica (`useAgendaBooking`) per costruire la propria interfaccia, e un widget neutro per chi non ne ha una.

Cosa **non** fa, e resta all'app che lo usa: autenticare il proprio staff, decidere a quale tenant/progetto (*scope*) appartiene una richiesta, fornire il client Supabase, **inviare email/SMS/push**, aggiornare un CRM, definire testi e stile.

## ⚠️ Il link nell'email di conferma è obbligatorio

L'ospite entra in videocall **solo** dal suo link personale. Il pacchetto lo costruisce (`guestUrl`) ma non spedisce email: è l'app che deve metterlo nella conferma e nel promemoria.

```ts
createAgendaServer({
  // …
  guestUrl: (booking, token) => `https://example.com/call/${booking.id}?t=${token}`,
  hooks: {
    onBookingCreated: async ({ booking, guestUrl }) => {
      await sendMail(booking.email, confirmationTemplate({ booking, joinUrl: guestUrl }));
    },
  },
});

// nel cron dei promemoria
for (const b of await agenda.claimDueReminders({ leadMinutes: 20 })) {
  await sendMail(b.email, reminderTemplate({ booking: b, joinUrl: agenda.guestUrlFor(b) }));
}
```

Se il sito usa strumenti di analisi, non lasciare il token nell'URL della pagina: fallo passare da una route che lo sposta in un cookie httpOnly. Dettagli e schema in [docs/03-features/link-ospite-ed-email.md](docs/03-features/link-ospite-ed-email.md).

## Installazione

Si installa dal tarball di un tag GitHub (con `dist/` già compilato):

```json
"@pynkstudio/agendaapp": "https://github.com/PynkStudio/pynkstudio-agendaapp/archive/refs/tags/v0.1.0.tar.gz"
```

Non usare `github:PynkStudio/pynkstudio-agendaapp#v0.1.0` su Vercel: npm può risolverlo via SSH e fallire.

Per la videocall servono anche le peer dependency LiveKit; il foglio di stile è del pacchetto (`import "@pynkstudio/agendaapp/video/styles.css"` nella pagina della call):

```bash
npm install livekit-client @livekit/components-react
```

## Avvio rapido

1. **Database** — applica le migration di `migrations/` in ordine (`0001`, `0002`, `0003`; Postgres/Supabase, richiede `btree_gist`).
2. **Server** — crea l'agenda una volta sola:

```ts
import { createAgendaServer } from "@pynkstudio/agendaapp/server";

export const agenda = createAgendaServer({
  db: () => createServiceRoleClient(),          // client Supabase service-role
  eventTypes: [{
    id: "intro-30",
    title: "Call conoscitiva",
    durationMinutes: 30,
    timezone: "Europe/Rome",
    weekly: ([1, 2, 3, 4, 5] as const).map((day) => ({ day, start: "09:00", end: "17:00" })),
    location: "video",
  }],
  signingSecret: process.env.AGENDA_SIGNING_SECRET!,
  video: { url: process.env.LIVEKIT_URL!, apiKey: process.env.LIVEKIT_API_KEY!, apiSecret: process.env.LIVEKIT_API_SECRET! },
  guestUrl: (b, t) => `https://example.com/call/${b.id}?t=${t}`,
  hooks: { onBookingCreated: async ({ booking, guestUrl }) => { /* email con guestUrl */ } },
});
```

3. **Rotte HTTP**:

```ts
import { createAgendaHandlers } from "@pynkstudio/agendaapp/http";

export const agendaHttp = createAgendaHandlers({
  agenda,
  requiredFields: ["phone"],
  authorizeHost: async (request, scope) => (await isStaff(request)) ? { identity: userId, name } : null,
});

// app/api/agenda/availability/route.ts
export const GET = (req: Request) => agendaHttp.availability(req, { scope: "my-project" });
```

4. **Interfaccia** — `useAgendaBooking` per il flusso di prenotazione, `AgendaVideoCall` per la pagina della call: lobby «Pronto a partecipare?» e stanza stile Meet (griglia, 1:1 con riquadro personale, presentazione schermo, microfono/videocamera con scelta dispositivi, chat, persone). Dettagli in [docs/03-features/videocall.md](docs/03-features/videocall.md).
5. **Server LiveKit** — `deploy/livekit/` (vedi [docs/06-integrations/livekit-self-hosted.md](docs/06-integrations/livekit-self-hosted.md)).

La guida completa, passo per passo, è [docs/08-processes/integrare-in-un-progetto.md](docs/08-processes/integrare-in-un-progetto.md).

## Entrypoint

| Import | Nel browser | Contenuto |
| --- | --- | --- |
| `@pynkstudio/agendaapp/core` | sì | tipi, fusi orari, calcolo slot |
| `@pynkstudio/agendaapp/react` | sì | `useAgendaBooking`, `AgendaBookingWidget` |
| `@pynkstudio/agendaapp/video/react` | sì | `AgendaVideoCall` (richiede le peer LiveKit) |
| `@pynkstudio/agendaapp/video/styles.css` | sì | stile della call (variabili `--agv-*`) |
| `@pynkstudio/agendaapp/settings/react` | sì | `AgendaSettingsPanel` |
| `@pynkstudio/agendaapp/settings/styles.css` | sì | stile delle impostazioni (variabili `--ags-*`) |
| `@pynkstudio/agendaapp/server` | no | `createAgendaServer` |
| `@pynkstudio/agendaapp/http` | no | `createAgendaHandlers` |
| `@pynkstudio/agendaapp/video/server` | no | `createLivekitToken`, `verifyLivekitWebhook` |
| `@pynkstudio/agendaapp/migrations/*` | — | SQL |

## Variabili d'ambiente (lato app)

Il pacchetto non legge variabili: le passa l'app. Nomi consigliati:

| Variabile | Uso |
| --- | --- |
| `AGENDA_SIGNING_SECRET` | segreto dei link ospite (≥ 16 caratteri). **Non cambiarlo dopo il lancio**: invaliderebbe i link già inviati |
| `LIVEKIT_URL` | `wss://` del server LiveKit |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | chiavi LiveKit |
| `AGENDA_CREDENTIALS_KEY` | cifratura delle credenziali dei calendari (≥ 32 caratteri, definitiva) |
| `AGENDA_GOOGLE_CLIENT_ID`, `AGENDA_GOOGLE_CLIENT_SECRET` | app OAuth Google (facoltative) |
| `AGENDA_MICROSOFT_CLIENT_ID`, `AGENDA_MICROSOFT_CLIENT_SECRET` | app OAuth Microsoft (facoltative) |

## Documentazione

La cartella `docs/` è una vault [Obsidian](https://obsidian.md) (apri la root della repo come vault). Punto di partenza: [docs/START-HERE.md](docs/START-HERE.md).

## Sviluppo

```bash
npm install
npm run typecheck
npm run test
npm run build
```

Per provare la videocall senza un'app: `npm run playground` (serve un LiveKit locale, vedi [docs/08-processes/playground-video.md](docs/08-processes/playground-video.md)).

`dist/` è committato perché le installazioni da tarball non compilano. Regole per chi modifica il codice (persone e IA): [AGENTS.md](AGENTS.md). Versioni: [CHANGELOG.md](CHANGELOG.md).
