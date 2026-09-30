# AGENTS.md — Agendaapp

This repository contains the reusable agenda and video call package consumed by host applications.

Read this file, `README.md` and `docs/START-HERE.md` before changing any code.

## Purpose

`@pynkstudio/agendaapp` is a shared dependency, not an application. It must stay host-agnostic.

Host applications provide: the Supabase service client, the scope (tenant) of every request, staff
authentication, event types, notifications (email, WhatsApp, push), CRM side effects, links and styling.

**No reference to any consumer project** anywhere in this repo — code, comments, docs, examples,
deploy files. Examples use `example.com` and generic scopes.

## Dependency Boundary

- Never import from a consumer repo (`@/lib/...`, `@/components/...`).
- No project values in code: time zones, hours, domains, copy, colors and URLs come from config or props.
  If something project-specific is needed, add an optional field with a default.
- Supabase is typed structurally (`AgendaDb`) and injected. Do not add `@supabase/supabase-js` as a dependency.
- LiveKit server logic stays on `node:crypto`. The React video UI uses `@livekit/components-react` and
  `livekit-client` as **optional peer dependencies**; nothing outside `src/video/react.tsx` may import them.

## Browser / Server Split

- `src/core/**` and `src/react/**` must stay importable in the browser: no `node:*`, no DB access.
- `src/server/**`, `src/http/**`, `src/video/livekit.ts`, `src/video/server.ts` are server-only.
- Use explicit `.js` extensions on relative imports: `dist/` is loaded directly by Node ESM.

## Invariants

- Slot validity is re-checked server-side (`isBookableStart`). Never trust a start time from a client.
- Double booking is prevented by the `agenda_bookings_no_overlap` exclusion constraint. `overlapsBusy`
  must keep mirroring it: a booking occupies `[starts_at, blocked_until)`.
- Guest tokens are derived with HMAC from `signingSecret` and the booking id. Changing the derivation
  invalidates every link already emailed: that is a breaking change.
- Hooks never undo a write; their errors are logged.
- The guest link (`guestUrl`) must stay available to `onBookingCreated`, to `createBooking`'s result and
  through `guestUrlFor`: consumers put it in confirmation and reminder emails, and it is the guest's only
  way into the video room. Never remove it from those three places.
- Webhook verification is fail-closed.

## Public API

Treat as public: `/core`, `/server`, `/http`, `/video/server`, `/video/react`, `/react`, `/migrations/*`.
Do not remove or rename exports without a major version bump. Prefer optional additions.

## Database

Migrations live in `migrations/`, numbered. No runtime auto-migration. Schema changes should be
backward-compatible; document consumer steps in the commit message.

## Build Artifacts And Versioning

`dist/` is committed because consumers install GitHub tag tarballs. SemVer. Before tagging:

```bash
npm run typecheck
npm run test
npm run build
for e in core/index server/index http/index video/server; do node --input-type=module -e "import('./dist/$e.js')"; done
```

For runtime or route changes, also verify one consumer app builds against the new tag.

## Documentation (Obsidian vault)

The repo root is an Obsidian vault; docs live in `docs/` (see `docs/START-HERE.md`), written in Italian.
Update them **in the same commit** as the code:

| Code change | Doc to update |
| --- | --- |
| Public API (exports, config fields, handler contracts) | `README.md`, `docs/02-architecture/architettura.md`, the feature doc |
| Slots, bookings, cancellation | `docs/03-features/prenotazione-e-disponibilita.md` |
| Video access, tokens, webhook | `docs/03-features/videocall.md` |
| Guest link / what emails must contain | `docs/03-features/link-ospite-ed-email.md` |
| Reminders | `docs/03-features/promemoria.md` |
| Schema / migrations | `docs/02-architecture/modello-dati.md`, `CHANGELOG.md` |
| `deploy/livekit/` | `docs/06-integrations/livekit-self-hosted.md` |
| A relevant design decision | new ADR in `docs/04-decisions/` from `docs/templates/adr-template.md` |
| Integration steps for consumers | `docs/08-processes/integrare-in-un-progetto.md` |

Never invent: what is not verified is written as **Da verificare**. No secrets or real env values.
