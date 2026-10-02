-- @pynkstudio/agendaapp 0.4.0 — calendario di destinazione per lo staff.
-- Additiva. Da applicare prima di aggiornare il pacchetto (le query leggono external_event).

-- Dove scrivere le call assegnate a una persona: una sua connessione e un calendario di quella connessione.
alter table public.agenda_hosts
  add column if not exists write_connection_id uuid references public.agenda_calendar_connections(id) on delete set null,
  add column if not exists write_calendar_id text,
  add column if not exists write_calendar_name text;

-- Evento creato nel calendario della persona: serve per toglierlo se la call viene annullata.
alter table public.agenda_bookings
  add column if not exists external_event jsonb;
