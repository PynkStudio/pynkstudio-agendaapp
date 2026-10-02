# Staff e capienza

Ogni tipo di appuntamento dice **chi** riceve le prenotazioni (`staffing`). Da questo dipende quante prenotazioni contemporanee accetta un orario.

## Modalità «posti» (`{ mode: "seats" }`, default)

Nessun calendario: si decide a mano quanti appuntamenti contemporanei accettare per fascia oraria.

```ts
weekly: [
  { day: 1, start: "09:00", end: "10:00", capacity: 2 }, // lunedì 9-10: due posti
  { day: 1, start: "10:00", end: "12:00" },              // capacity 1 di default
]
```

- Il pacchetto crea tanti **posti** quanta la capienza massima. Il posto *k* è aperto nelle fasce con `capacity ≥ k`.
- Ogni prenotazione occupa un posto (`calendar` = `default`, `default#2`, …). Il posto 1 ha l'id storico, quindi le prenotazioni fatte prima della 0.3.0 restano valide.
- Lo slot è disponibile finché resta un posto libero; `remaining` dice quanti.

## Modalità «persone» (`{ mode: "hosts", hostIds }`)

Prenotano le persone dello staff selezionate. Un orario ha **tanti posti quante persone libere** in quel momento.

Una persona è libera per uno slot se:

1. i suoi **orari personali** coprono tutto lo slot (`weekly` della persona; se `null`, gli orari del tipo di appuntamento);
2. lo slot rientra negli orari del tipo di appuntamento (che fanno da cornice);
3. non ha prenotazioni confermate sovrapposte (su **qualsiasi** tipo di appuntamento: `calendar = host:<id>`);
4. non ha blocchi sovrapposti (`calendar = host:<id>` o `*`);
5. non è occupata nei **calendari collegati** ([[calendari-collegati]]).

Esempio: tra le 9 e le 10 è libera una sola persona → si può prendere un solo appuntamento; se libere due, due.

### Assegnazione

Alla prenotazione il server ricalcola le persone libere per quello slot e prova a inserire sulla **meno occupata** (meno impegni nella giornata; a parità, a caso). Se nel frattempo qualcuno l'ha presa (vincolo `23P01`), passa alla successiva. `booking.hostId` dice chi la riceve.

### Staff

Le persone stanno in `agenda_hosts`. L'app le sincronizza con `agenda.settings.syncHosts(scope, people)` (o con l'opzione `listStaff` degli handler): crea le nuove, aggiorna nome ed email, **disattiva** chi non c'è più (non cancella: le prenotazioni passate restano collegate). Orari personali e calendari si gestiscono dalla pagina impostazioni ([[impostazioni]]).

## Blocchi

`addBlock` chiude per default **tutto** lo scope (`calendar: "*"`); con `calendar: "host:<id>"` solo una persona, con `default#2` un singolo posto.

## Festività

`holidays: ["IT"]` chiude le festività nazionali italiane (Capodanno, Epifania, Pasqua e Pasquetta, 25 aprile, 1° maggio, 2 giugno, Ferragosto, Ognissanti, Immacolata, Natale, Santo Stefano; dal 2026 anche il 4 ottobre, San Francesco). Pasqua è calcolata ogni anno. Altri paesi: aggiungere una voce a `HOLIDAY_CALENDARS` in `src/core/holidays.ts`. **Da verificare** a ogni anno nuovo eventuali modifiche di legge.

Le chiusure singole restano in `closedDates`.
