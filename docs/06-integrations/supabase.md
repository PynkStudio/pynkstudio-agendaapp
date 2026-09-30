# Supabase / Postgres

- Il pacchetto riceve un client con `from(table)` compatibile con `@supabase/supabase-js` (`AgendaDb`), senza dipenderne.
- Va passato un client **service-role**: le tabelle hanno RLS attiva e nessuna policy.
- Le operazioni usate: `select`, `insert`, `update`, `delete`, filtri `eq/is/in/gt/gte/lt/lte`, `order`, `single/maybeSingle`.
- Migration: `migrations/0001_agenda_schema.sql`. Il pacchetto non migra da solo: l'app copia/applica le migration col proprio strumento.
- Con Postgres non Supabase serve uno schema `extensions` nel `search_path` o una modifica alla riga `create extension`.

Vedi [[modello-dati]].
