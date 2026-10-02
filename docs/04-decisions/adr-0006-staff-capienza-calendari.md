# ADR-0006: Capienza come insieme di risorse; calendari esterni in sola lettura

- **Stato:** accettata
- **Data:** 2026-10-02

## Contesto

Richieste: (1) appuntamenti multipli contemporanei decisi a mano; (2) disponibilità calcolata dagli orari in cui almeno una persona dello staff è libera, con tanti posti quante persone libere; (3) collegamento dei calendari Google, Apple, Microsoft; (4) festività italiane escludibili; (5) una pagina impostazioni.

## Decisione

1. **Risorse**: ogni prenotazione occupa una risorsa (un posto anonimo o una persona). La colonna `calendar` contiene l'id della risorsa, così il **vincolo di esclusione esistente** garantisce l'assenza di sovrapposizioni per risorsa senza nuovi vincoli. Capienza = risorse libere.
2. **Posti** generati dalla capienza delle fasce; il posto 1 conserva l'id storico (`default`) per compatibilità con i dati esistenti.
3. **Persone**: risorse `host:<id>` condivise tra tutti i tipi di appuntamento, orari personali opzionali, assegnazione alla meno occupata con ritentativo sulla successiva.
4. **Calendari esterni in sola lettura**, senza SDK: Google FreeBusy, Microsoft Graph calendarView, CalDAV (iCloud e altri), feed ICS. `ical.js` per espandere le ricorrenze. Credenziali cifrate AES-256-GCM. Fail-open con stato di errore visibile.
5. **Impostazioni a database** (`agenda_event_types`) sopra i default del codice; staff in `agenda_hosts`, sincronizzato dall'app.
6. Pagina impostazioni nel pacchetto, con testi it/en.

## Alternative valutate

| Alternativa | Contro |
|---|---|
| Contatore di capienza per slot | Le corse tra prenotazioni simultanee vanno gestite a mano; il vincolo per risorsa le risolve nel DB |
| Vincolo di capienza in un trigger | Logica più fragile, difficile da far combaciare con il calcolo degli slot |
| SDK ufficiali Google/Microsoft | Peso e versioni da allineare per due chiamate ciascuno |
| Fail-closed sui calendari in errore | Un token scaduto svuoterebbe l'agenda senza che nessuno se ne accorga |

## Conseguenze

- Breaking: `eventType()` e `listBookableDays()` sono asincroni; la 0.3.0 legge `host_id` e richiede la migration `0002`.
- La scrittura degli appuntamenti nei calendari delle persone resta da fare ([[backlog]]).
- Le app OAuth (Google, Microsoft) le crea chi usa il pacchetto; lo scope Google è sensibile e richiede la verifica dell'app per utenti esterni.
