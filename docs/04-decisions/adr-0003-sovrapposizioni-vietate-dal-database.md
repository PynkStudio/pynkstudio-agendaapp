# ADR-0003: Sovrapposizioni vietate dal database

- **Stato:** accettata
- **Data:** 2026-09-30

## Contesto

Un controllo "leggo gli occupati, poi inserisco" lascia passare due prenotazioni simultanee dello stesso orario. Un indice unico sull'inizio non basta con durate o pause diverse.

## Decisione

Vincolo di esclusione `btree_gist` su `(scope, calendar, tstzrange(starts_at, blocked_until))` per le sole confermate; `blocked_until = ends_at + pausa`. Il calcolo degli slot (`overlapsBusy`) replica la stessa regola, così ciò che si mostra libero è ciò che il DB accetta.

## Conseguenze

- Serve l'estensione `btree_gist` (su Supabase è disponibile nello schema `extensions`).
- Le violazioni (`23P01`) diventano `slot_taken`.
- I blocchi dello staff non sono nel vincolo: il server li controlla prima dell'insert (una finestra minima di concorrenza resta, accettata: i blocchi li crea lo staff, raramente).
