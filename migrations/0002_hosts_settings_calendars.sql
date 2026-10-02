-- @pynkstudio/agendaapp 0.3.0 — staff, impostazioni salvate, calendari collegati.
-- Tutto additivo: le prenotazioni esistenti restano valide.

-- Persone dello staff che possono ricevere prenotazioni.
create table if not exists public.agenda_hosts (
  id           uuid primary key default gen_random_uuid(),
  scope        text        not null,
  -- Id della persona nell'app che usa il pacchetto (es. id utente).
  external_id  text,
  name         text        not null,
  email        text,
  active       boolean     not null default true,
  -- Orari personali; null = stessi orari del tipo di appuntamento.
  weekly       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint agenda_hosts_external_unique unique (scope, external_id)
);

-- Tipi di appuntamento modificabili dalla pagina impostazioni.
-- `settings` ha la forma di AgendaEventType (senza scope).
create table if not exists public.agenda_event_types (
  scope       text        not null,
  id          text        not null,
  settings    jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (scope, id)
);

-- Calendari esterni collegati da un membro dello staff.
create table if not exists public.agenda_calendar_connections (
  id              uuid primary key default gen_random_uuid(),
  scope           text        not null,
  host_id         uuid        not null references public.agenda_hosts(id) on delete cascade,
  provider        text        not null check (provider in ('google', 'microsoft', 'caldav', 'ics')),
  -- Etichetta leggibile: email dell'account o nome del feed.
  account         text,
  -- Credenziali cifrate (AES-256-GCM) dal pacchetto: token OAuth, password CalDAV o URL del feed.
  credentials     text        not null,
  status          text        not null default 'ok' check (status in ('ok', 'error')),
  last_error      text,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists agenda_calendar_connections_host_idx
  on public.agenda_calendar_connections (scope, host_id);

alter table public.agenda_bookings
  add column if not exists host_id uuid references public.agenda_hosts(id) on delete set null;

create index if not exists agenda_bookings_host_idx
  on public.agenda_bookings (host_id, starts_at)
  where host_id is not null;

drop trigger if exists agenda_hosts_touch on public.agenda_hosts;
create trigger agenda_hosts_touch
  before update on public.agenda_hosts
  for each row execute function public.agenda_touch_updated_at();

drop trigger if exists agenda_calendar_connections_touch on public.agenda_calendar_connections;
create trigger agenda_calendar_connections_touch
  before update on public.agenda_calendar_connections
  for each row execute function public.agenda_touch_updated_at();

alter table public.agenda_hosts enable row level security;
alter table public.agenda_event_types enable row level security;
alter table public.agenda_calendar_connections enable row level security;
