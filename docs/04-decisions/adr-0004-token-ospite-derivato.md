# ADR-0004: Link ospite derivato, non salvato

- **Stato:** accettata
- **Data:** 2026-09-30

## Contesto

L'ospite non ha account. Serve un link personale che funzioni nella conferma **e** nel promemoria inviato giorni dopo. Un token casuale mostrato una sola volta (e salvato come hash) non si potrebbe rimettere nel promemoria.

## Decisione

`token = HMAC-SHA256(signingSecret, "agenda:manage:" + bookingId)`, base64url, verificato a tempo costante. Nessuna colonna nel DB. L'URL lo costruisce l'app con `guestUrl`; il pacchetto lo passa agli hook e lo ricostruisce con `guestUrlFor`.

## Alternative valutate

| Alternativa | Contro |
|---|---|
| Token casuale salvato in chiaro | Una fuga del DB espone tutti i link |
| Token casuale salvato come hash | Il promemoria non può ricostruire il link |
| JWT con scadenza | Scadenza da tarare; più lungo; stesso segreto comunque |

## Conseguenze

- Cambiare `signingSecret` invalida tutti i link emessi: va trattato come un cambio incompatibile.
- Un singolo link non si revoca: si annulla la prenotazione.
- Vedi [[link-ospite-ed-email]].
