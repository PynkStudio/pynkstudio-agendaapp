# Link dell'ospite ed email di conferma

## La regola

> **Ogni email di conferma di un appuntamento `video` deve contenere il link personale dell'ospite.** Anche il promemoria.

L'ospite non ha un account: il link è l'unica cosa che gli permette di entrare nella stanza. Il pacchetto **non invia email** (i provider e i template sono dell'app, vedi [[panoramica]]), quindi questa regola la deve applicare l'app. Senza link, l'ospite prenota e poi non ha modo di collegarsi.

## Come si ottiene il link

1. Nella config si dichiara come è fatto l'URL della pagina dell'ospite:

```ts
guestUrl: (booking, token) => `https://example.com/call/${booking.id}?t=${encodeURIComponent(token)}`,
```

2. Il pacchetto lo passa già pronto:

| Dove | Come |
|---|---|
| Conferma | `hooks.onBookingCreated({ booking, guestUrl })` |
| Risultato di `createBooking` | `result.guestUrl` |
| Promemoria o reinvio | `agenda.guestUrlFor(booking)` |
| Risposta HTTP di `book` | solo con `exposeGuestUrl: true` (spento di default: il link è una credenziale, l'email è il canale più sicuro) |

`guestUrl` è `null` se la config non lo dichiara.

## Esempio completo

```ts
const agenda = createAgendaServer({
  // …
  guestUrl: (b, t) => `https://example.com/call/${b.id}?t=${encodeURIComponent(t)}`,
  hooks: {
    onBookingCreated: async ({ booking, guestUrl }) => {
      await sendMail({
        to: booking.email,
        subject: "Appuntamento confermato",
        html: confirmationHtml({
          name: booking.name,
          when: formatSlotLabel(booking.startsAt, { timezone: "Europe/Rome", locale: "it-IT" }),
          joinUrl: booking.location === "video" ? guestUrl : null,
        }),
      });
    },
  },
});
```

Nel template: un bottone ben visibile («Entra nella videocall») e una riga che spiega che il link è personale e si attiva poco prima dell'inizio (`joinEarlyMinutes`, default 10 minuti).

## La pagina dietro il link

### Non lasciare il token nell'URL della pagina

Se la pagina carica strumenti di analisi (GA4, Meta Pixel, pixel pubblicitari), questi registrano l'**URL completo**, token compreso: la credenziale finirebbe a terzi. Schema consigliato:

1. `guestUrl` punta a una **route server di ingresso**, es. `/call/[bookingId]/enter?t=…`;
2. la route verifica il token (`agenda.verifyManageToken`), lo salva in un **cookie httpOnly** (`Secure`, `SameSite=Lax`) e risponde con un redirect 303 verso l'URL pulito `/call/[bookingId]`, con `Referrer-Policy: no-referrer`;
3. la pagina legge il token dal cookie lato server e lo passa al componente client (non all'URL).

La route di ingresso non esegue JavaScript, quindi nessun tracker vede il token. Il link resta inoltrabile: chi lo apre su un altro dispositivo riceve il cookie lì.

### Cosa fa la pagina

1. legge il token (dal cookie) e verifica con `agenda.verifyManageToken(bookingId, token)` e `agenda.getBooking(bookingId)` per mostrare data e argomento, o un messaggio se annullata;
2. rende `AgendaVideoCall` con un `getAccess` che fa `POST` al handler `videoToken` con `{ bookingId, token }`.

Deve essere **noindex**. Se un'app non usa nessun tracker può leggere il token direttamente dall'URL, ma lo schema a cookie resta preferibile.

## Il token

`token = HMAC-SHA256(signingSecret, "agenda:manage:" + bookingId)` in base64url. Non è salvato: si ricalcola sempre uguale, per questo il promemoria può rimandare lo stesso link. Conseguenze:

- **Non cambiare `signingSecret`** dopo il lancio: tutti i link già inviati smetterebbero di funzionare.
- Un link non si revoca singolarmente; annullare la prenotazione basta a chiudere l'accesso.

Vedi [[adr-0004-token-ospite-derivato]].

## Altri usi del link

Lo stesso token autorizza l'annullamento da parte dell'ospite (`guestCancel`). Se l'app lo offre, conviene metterlo nella stessa pagina.
