# Playground della videocall

Pagina di sviluppo per provare `AgendaVideoCall` senza un'app che usa il pacchetto. Non è pubblicata (`playground/` non è in `files`).

## Avvio

1. LiveKit locale in modalità sviluppo (chiavi `devkey` / `secret`):

```bash
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev --bind 0.0.0.0 --node-ip 127.0.0.1
```

2. Playground:

```bash
npm run playground
```

3. Apri due schede, ad esempio:
   - `http://localhost:5180/?name=Ada%20Lovelace&role=guest`
   - `http://localhost:5180/?name=Mario%20Rossi&role=host`

Parametri: `name` (nome mostrato), `role` (`guest` | `host`, lo staff riceve `roomAdmin`), `room` (default `agenda-playground`).

`serve.mjs` compila `playground/app.tsx` con esbuild in modalità watch, serve `src/video/styles.css` e firma i token con `createLivekitToken`. Variabili opzionali: `PORT`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

## Cosa provare a ogni modifica della UI

- Lobby: anteprima, pulsanti, menu dispositivi, avviso con dispositivi bloccati.
- Da solo → in due (layout 1:1) → in tre (griglia).
- Chat (badge non letti), Persone, menu dispositivi nella barra, presentazione schermo.
- Uscita: messaggio «hai lasciato», pagina di nuovo scorrevole.

Nota: un browser senza videocamera mostra gli avatar; video e condivisione schermo vanno provati anche su un browser reale.
