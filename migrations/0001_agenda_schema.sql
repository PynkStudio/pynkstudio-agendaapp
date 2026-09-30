-- @pynkstudio/agendaapp 0.1.0 — schema base.
--
-- Una riga di agenda_bookings = un appuntamento prenotato da un ospite.
-- `scope` isola i dati per tenant/progetto; `calendar` raggruppa ciò che non
-- può sovrapporsi (la stessa persona o la stessa stanza).
-- Accesso solo via service role: RLS attiva e nessuna policy.

-- btree_gist serve al vincolo di esclusione su (scope, calendar, intervallo).
-- Su Supabase lo schema `extensions` è già nel search_path; altrove va aggiunto.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create table if not exists public.agenda_bookings (
  id                uuid primary key default gen_random_uuid(),
  scope             text        not null,
  event_type        text        not null,
  calendar          text        not null default 'default',
  status            text        not null default 'confirmed'
                      check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- Fine dell'intervallo occupato: ends_at + buffer del tipo di evento.
  blocked_until     timestamptz not null,
  location          text        not null default 'video'
                      check (location in ('video', 'phone', 'in_person')),
  name              text        not null,
  email             text        not null,
  phone             text,
  topic             text,
  guest_timezone    text,
  answers           jsonb       not null default '{}'::jsonb,
  source            text,
  video_room        text unique,
  video_started_at  timestamptz,
  video_ended_at    timestamptz,
  reminder_sent_at  timestamptz,
  cancelled_at      timestamptz,
  cancelled_by      text check (cancelled_by in ('host', 'guest', 'system')),
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint agenda_bookings_range check (ends_at > starts_at and blocked_until >= ends_at)
);

-- Garanzia anti doppia prenotazione, anche sotto concorrenza: due confermate
-- dello stesso calendario non possono sovrapporsi (SQLSTATE 23P01).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_bookings_no_overlap') then
    alter table public.agenda_bookings
      add constraint agenda_bookings_no_overlap
      exclude using gist (
        scope with =,
        calendar with =,
        tstzrange(starts_at, blocked_until, '[)') with &&
      ) where (status = 'confirmed');
  end if;
end$$;

create index if not exists agenda_bookings_scope_start_idx
  on public.agenda_bookings (scope, starts_at);

create index if not exists agenda_bookings_reminder_idx
  on public.agenda_bookings (starts_at)
  where status = 'confirmed' and reminder_sent_at is null;

create index if not exists agenda_bookings_email_idx
  on public.agenda_bookings (lower(email));

-- Chiusure puntuali decise dall'host (ferie, riunioni interne).
create table if not exists public.agenda_blocks (
  id          uuid primary key default gen_random_uuid(),
  scope       text        not null,
  calendar    text        not null default 'default',
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  created_at  timestamptz not null default now(),
  constraint agenda_blocks_range check (ends_at > starts_at)
);

create index if not exists agenda_blocks_scope_idx
  on public.agenda_blocks (scope, calendar, starts_at);

-- Eventi dei webhook LiveKit, per sapere chi è entrato e quando.
create table if not exists public.agenda_video_events (
  id                    bigserial primary key,
  booking_id            uuid references public.agenda_bookings(id) on delete cascade,
  room                  text        not null,
  event                 text        not null,
  participant_identity  text,
  -- LiveKit ritenta le consegne: l'id evento rende l'inserimento idempotente.
  livekit_event_id      text unique,
  payload               jsonb       not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists agenda_video_events_booking_idx
  on public.agenda_video_events (booking_id, created_at);

create or replace function public.agenda_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists agenda_bookings_touch on public.agenda_bookings;
create trigger agenda_bookings_touch
  before update on public.agenda_bookings
  for each row execute function public.agenda_touch_updated_at();

alter table public.agenda_bookings enable row level security;
alter table public.agenda_blocks enable row level security;
alter table public.agenda_video_events enable row level security;
