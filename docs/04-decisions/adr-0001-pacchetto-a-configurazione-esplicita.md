# ADR-0001: Pacchetto esterno a configurazione esplicita

- **Stato:** accettata
- **Data:** 2026-09-30

## Contesto

Agenda e videocall servono a più progetti. Tenerle dentro un sito le lega a quel sito; un modulo condiviso con stato globale (`configure…()` una volta per processo) rende difficile servire più scope o più host dallo stesso codice e complica i test.

## Decisione

1. Repo e pacchetto propri, distribuiti come tarball di un tag GitHub con `dist/` committato.
2. `createAgendaServer(config)` restituisce un'istanza: DB, tipi di appuntamento, segreto, LiveKit, URL ospite e hook arrivano tutti dalla config. Nessuna variabile d'ambiente letta dal pacchetto.
3. Il pacchetto non dipende da Supabase (client tipizzato strutturalmente) né da un provider email.
4. La UI dell'app resta dell'app: hook headless + widget neutro opzionale.

## Alternative valutate

| Alternativa | Contro |
|---|---|
| Codice copiato in ogni progetto | Bug e fix da ripetere ovunque |
| Runtime globale | Stato condiviso, difficile multi-scope e testare |
| Pubblicazione su npm | Non necessaria finché i consumatori sono interni |

## Conseguenze

- Ogni cambiamento di comportamento è una release taggata e un aggiornamento della dipendenza nei progetti.
- Gli effetti (email, CRM) si fanno negli hook: il pacchetto garantisce la scrittura, non l'invio.
