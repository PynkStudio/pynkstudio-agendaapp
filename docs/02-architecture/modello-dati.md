# Modello dati

Fonti: `migrations/0001_agenda_schema.sql`, `migrations/0002_hosts_settings_calendars.sql`. RLS attiva su tutte le tabelle e **nessuna policy**: ci si accede solo con il client service-role. Vedi [[supabase]].

## `agenda_bookings`

Una riga = un appuntamento prenotato.

| Colonna | Note |
|---|---|
| `id` | uuid, generato dal server (serve per il nome della stanza prima dell'insert) |
| `scope` | tenant/progetto; isola i dati |
| `event_type` | id del tipo di appuntamento dichiarato nella config |
| `calendar` | ciò che non può sovrapporsi (una persona, una stanza). Default `default` |
| `status` | `confirmed`, `cancelled`, `completed`, `no_show` |
| `starts_at`, `ends_at` | istanti UTC |
| `blocked_until` | `ends_at` + pausa del tipo di appuntamento |
| `location` | `video`, `phone`, `in_person` |
| `name`, `email` (minuscolo), `phone`, `topic`, `guest_timezone`, `answers`, `source` | dati dell'ospite |
| `video_room` | `<roomPrefix><id>`, solo per `video`; unico |
| `video_started_at`, `video_ended_at` | dai webhook LiveKit |
| `reminder_sent_at` | marcato da `claimDueReminders` |
| `cancelled_at`, `cancelled_by`, `cancel_reason` | annullamento |

### Vincolo anti sovrapposizione

```sql
exclude using gist (scope with =, calendar with =, tstzrange(starts_at, blocked_until, '[)') with &&)
where (status = 'confirmed')
```

Due prenotazioni confermate dello stesso scope e calendario non possono sovrapporsi, anche se arrivano nello stesso millisecondo. La violazione (SQLSTATE `23P01`) diventa `slot_taken` / HTTP 409. Il calcolo degli slot (`overlapsBusy`) riproduce esattamente questa regola. Vedi [[adr-0003-sovrapposizioni-vietate-dal-database]].

### `host_id`

Dalla 0.3.0 (migration `0002`): persona dello staff che riceve la prenotazione, `null` in modalità posti. In modalità persone `calendar = host:<host_id>`; in modalità posti `calendar = default`, `default#2`, … ([[staff-e-capienza]]).

## `agenda_hosts`

Staff per scope: `external_id` (id nell'app, unico per scope), `name`, `email`, `active`, `weekly` (orari personali, `null` = come il tipo di appuntamento).

## `agenda_event_types`

Impostazioni salvate dalla pagina impostazioni: chiave `(scope, id)`, `settings` jsonb con la forma di `AgendaEventType`. Sovrascrivono il default del codice con lo stesso id.

## `agenda_calendar_connections`

Calendari collegati: `host_id`, `provider` (`google`, `microsoft`, `caldav`, `ics`), `account`, `credentials` **cifrate**, `status` (`ok` / `error`), `last_error`, `last_synced_at`. Vedi [[calendari-collegati]].

## `agenda_blocks`

Chiusure puntuali (ferie, riunioni): `scope`, `calendar` (`*` = tutto lo scope, `host:<id>` = una persona), `starts_at`, `ends_at`, `reason`. Non coperte dal vincolo: il server le controlla prima dell'insert.

## `agenda_video_events`

Eventi dei webhook LiveKit: `booking_id`, `room`, `event`, `participant_identity`, `livekit_event_id` (unico, per ignorare i reinvii), `payload`.

## Nomi delle tabelle

Sovrascrivibili con `tables` nella config; in quel caso vanno rinominati anche vincoli e indici della migration.
