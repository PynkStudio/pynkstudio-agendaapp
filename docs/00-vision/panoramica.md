# Panoramica

## Perché esiste

Molti siti hanno bisogno dello stesso flusso: un visitatore sceglie un giorno e un orario, lascia i suoi dati, riceve una conferma e al momento giusto si collega a una videocall con qualcuno dello staff. Scriverlo dentro ogni sito porta a orari e fusi cablati, doppie prenotazioni, link che non si ritrovano nei promemoria, e ogni progetto con la propria variante dei bug.

Agendaapp è quel flusso, una volta sola, come dipendenza. Le videocall girano su **LiveKit** installato su un server proprio, senza servizi di terzi a pagamento per utente.

## Cosa fa (dedotto dal codice)

- Calcola gli orari prenotabili da regole dichiarate dall'app → [[prenotazione-e-disponibilita]].
- Registra e gestisce le prenotazioni, impedendo sovrapposizioni a livello di database → [[modello-dati]].
- Genera il link personale dell'ospite → [[link-ospite-ed-email]].
- Apre le stanze video e ne registra gli eventi → [[videocall]].
- Individua i promemoria da inviare, una volta sola → [[promemoria]].
- Espone tutto come handler HTTP e hook React → [[architettura]].

## Cosa resta all'app che lo usa

| Responsabilità | Perché non è nel pacchetto |
|---|---|
| Autenticazione dello staff | Ogni app ha il suo sistema di utenti |
| Scope (tenant/progetto) di ogni richiesta | Dipende dall'host, dal dominio, dalle route |
| Client Supabase service-role | Il pacchetto non dipende da `@supabase/supabase-js` |
| **Invio di email, SMS, WhatsApp, push** | Provider e template sono dell'app; il pacchetto fornisce link e dati |
| CRM e altri effetti collaterali | Tramite gli hook |
| Testi, lingue, colori | Il pacchetto non contiene identità visiva |

## A chi serve

- Siti che offrono una call conoscitiva o di consulenza.
- App multi-tenant: ogni tenant è uno *scope* con i propri tipi di appuntamento.
- Qualsiasi host Node con un fetch runtime (Next.js, Hono, Vercel Functions…) e un database Postgres.

## Limiti attuali

- Un solo calendario per scope, salvo dichiararne altri nei tipi di appuntamento: non c'è ancora la gestione di più membri dello staff con agende proprie → [[backlog]].
- Nessuna UI per l'agenda dello staff: l'app la costruisce con `hostList`/`hostUpdate`.
