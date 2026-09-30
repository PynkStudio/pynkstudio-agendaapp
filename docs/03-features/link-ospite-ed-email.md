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

L'app crea la route (es. `/call/[bookingId]`) che:

1. legge `bookingId` e `t`;
2. opzionalmente verifica subito con `agenda.verifyManageToken(bookingId, t)` e `agenda.getBooking(bookingId)` per mostrare data e argomento, o un messaggio se annullata;
3. rende `AgendaVideoCall` con un `getAccess` che fa `POST` al handler `videoToken` con `{ bookingId, token: t }`.

Deve essere **noindex** e con `referrer: no-referrer`, perché l'URL contiene la credenziale.

## Il token

`token = HMAC-SHA256(signingSecret, "agenda:manage:" + bookingId)` in base64url. Non è salvato: si ricalcola sempre uguale, per questo il promemoria può rimandare lo stesso link. Conseguenze:

- **Non cambiare `signingSecret`** dopo il lancio: tutti i link già inviati smetterebbero di funzionare.
- Un link non si revoca singolarmente; annullare la prenotazione basta a chiudere l'accesso.

Vedi [[adr-0004-token-ospite-derivato]].

## Altri usi del link

Lo stesso token autorizza l'annullamento da parte dell'ospite (`guestCancel`). Se l'app lo offre, conviene metterlo nella stessa pagina.
