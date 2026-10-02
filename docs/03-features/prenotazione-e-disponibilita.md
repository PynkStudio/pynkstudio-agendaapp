# Prenotazione e disponibilità

## Tipi di appuntamento

Dichiarati nel codice dell'app (`eventTypes`), per scope, come **valori predefiniti**: dalla pagina impostazioni ([[impostazioni]]) si modificano e il server usa la versione salvata. `agenda.eventType()` è asincrono. Campi (`AgendaEventType` in `src/core/types.ts`):

| Campo | Default | Significato |
|---|---|---|
| `id` | — | salvato su ogni prenotazione |
| `title` | — | restituito dall'endpoint dei giorni |
| `durationMinutes` | — | durata |
| `slotStepMinutes` | = durata | distanza tra due inizi possibili |
| `timezone` | — | fuso IANA in cui sono espresse le finestre |
| `weekly` | — | finestre `{ day: 0-6, start: "HH:MM", end: "HH:MM", capacity? }`; più finestre per giorno ammesse; `capacity` = posti contemporanei in modalità posti |
| `bufferMinutes` | 0 | pausa obbligatoria dopo ogni appuntamento dello stesso calendario |
| `minNoticeMinutes` | 0 | preavviso minimo |
| `lookaheadDays` | 14 | quanti giorni **con almeno una finestra** offrire, da oggi |
| `closedDates` | — | date chiuse |
| `holidays` | — | calendari festivi da chiudere, es. `["IT"]` ([[staff-e-capienza]]) |
| `staffing` | `{ mode: "seats" }` | posti manuali o persone dello staff ([[staff-e-capienza]]) |
| `location` | — | `video`, `phone`, `in_person` |
| `calendar` | `default` | tipi che condividono una persona/stanza devono condividerlo |

La config è validata al primo uso (`assertValidEventType`): un fuso inesistente o una finestra vuota fanno fallire subito.

## Calcolo degli slot

`src/core/availability.ts`:

- `candidateSlots` genera gli inizi dalle finestre del giorno della settimana, convertendo l'ora locale in UTC con `zonedWallClockToUtc` (gestisce ora legale; un orario saltato dal cambio va all'istante subito dopo).
- `bookableDays` restituisce i prossimi `lookaheadDays` giorni utili nel fuso del tipo di appuntamento.
- `slotsForDate` segna `available: false` gli slot passati, dentro il preavviso o in conflitto con prenotazioni/blocchi.

## Controlli al momento della prenotazione

`createBooking` (`src/server/agenda.ts`), nell'ordine:

1. tipo di appuntamento esistente nello scope;
2. nome presente, email valida (salvata in minuscolo); campi troncati a lunghezze massime;
3. `isBookableStart`: l'inizio deve coincidere **esattamente** con uno slot offerto, futuro, oltre il preavviso e nei giorni prenotabili. L'orario del client non è mai creduto;
4. scelta della risorsa: tra i posti/le persone liberi per lo slot (prenotazioni, blocchi, calendari collegati), la meno occupata;
5. insert su quella risorsa: se il vincolo del DB la rifiuta (presa nel frattempo) si prova la successiva; finite le risorse → `slot_taken`.

Errori: `unknown_event_type` (404), `invalid_input` con `field` (400), `invalid_slot` (400), `slot_taken` (409), `db_error` (500), `unconfigured` (503).

I campi richiesti oltre a nome ed email si scelgono con `requiredFields` negli handler HTTP. I campi extra del body (es. azienda, UTM) non vengono salvati: arrivano all'hook come `extra`.

## Annullamento ed esiti

- `cancelBooking({ by: "host" })` dallo staff (`hostUpdate` con `action: "cancel"`); `by: "guest"` richiede il token ([[link-ospite-ed-email]]).
- `setStatus` per `completed` / `no_show` (`hostUpdate` con `complete` / `no_show`).
- Hook `onBookingCancelled`. **Il pacchetto non avvisa l'ospite**: se serve, lo fa l'app nell'hook.

## Blocchi

`addBlock`, `listBlocks`, `removeBlock`: intervalli chiusi per scope e calendario, rispettati da disponibilità e prenotazione.

## Lato interfaccia

`useAgendaBooking({ availabilityUrl, bookingUrl, eventType? })` gestisce giorni, slot, selezione e invio; su 409 azzera la scelta e ricarica gli slot. Etichette dei giorni con `dateParts(iso)` da `/core`. `AgendaBookingWidget` è una UI già fatta con sole classi `ag-*`.
