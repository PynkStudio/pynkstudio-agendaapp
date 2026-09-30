# ADR-0002: LiveKit senza SDK server

- **Stato:** accettata
- **Data:** 2026-09-30

## Contesto

Lato server servono solo due cose da LiveKit: firmare token d'accesso e verificare i webhook. Entrambi sono JWT HS256 con l'API secret.

## Decisione

Implementarli su `node:crypto` (`src/video/livekit.ts`), confronti a tempo costante, verifica fail-closed. La UI usa invece `@livekit/components-react` e `livekit-client` come **peer dependency opzionali**, importate solo da `src/video/react.tsx`.

## Alternative valutate

| Alternativa | Contro |
|---|---|
| `livekit-server-sdk` | Dipendenza pesante per due funzioni; versione da allineare in ogni progetto |
| UI video scritta da zero | Molto lavoro per replicare ciò che i componenti ufficiali già fanno |

## Conseguenze

- Se servono API di gestione stanze (espellere, registrare), andranno aggiunte: via Twirp HTTP con lo stesso JWT o introducendo l'SDK. Vedi [[backlog]].
- I test di firma/verifica sono in `src/video/__tests__/`.
