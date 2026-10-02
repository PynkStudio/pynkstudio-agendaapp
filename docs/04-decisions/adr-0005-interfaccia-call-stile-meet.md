# ADR-0005: Interfaccia della call propria, stile Meet

- **Stato:** accettata
- **Data:** 2026-10-02

## Contesto

La 0.1.0 usava i prefab di LiveKit (`PreJoin`, `VideoConference`). Funzionano, ma: il nome in lobby era modificabile pur non contando nulla (quello vero è nel token); layout e comandi non somigliano alle app di riunione che i clienti conoscono; lo stile richiedeva di forzare le classi `lk-*`.

Richiesta: una call che si apra con la vista classica alla Google Meet, con nome fisso (staff: nome e cognome; ospite: i dati del modulo, azienda compresa) e tutti i comandi abituali.

## Decisione

1. Lobby e stanza scritte nel pacchetto (`src/video/lobby.tsx`, `room.tsx`) usando **solo hook e componenti di base** di `@livekit/components-react` (`useTracks`, `useTrackToggle`, `useMediaDeviceSelect`, `VideoTrack`, `useChat`, `RoomAudioRenderer`, `StartAudio`…), non i prefab.
2. Layout come Meet: solo / 1:1 con riquadro personale / griglia / presentazione.
3. Il nome mostrato è deciso dal server: `guestDisplayName` per l'ospite, `authorizeHost` per lo staff. In lobby è solo letto.
4. Stile proprio (`styles.css`) con colori neutri dietro variabili `--agv-*`; icone SVG disegnate nel pacchetto, nessuna libreria di icone.
5. Schermo intero via portale su `document.body`.
6. Un playground di sviluppo (`playground/`, fuori dal pacchetto pubblicato) per provare la UI con un LiveKit locale.

## Alternative valutate

| Alternativa | Pro | Contro |
|---|---|---|
| Restare sui prefab | Zero codice | Aspetto e comportamento non controllabili; nome modificabile fuorviante |
| Prefab + CSS pesante | Poco codice | Fragile: dipende dalle classi interne di LiveKit, che cambiano tra versioni |
| UI scritta sopra `livekit-client` senza componenti React | Nessuna peer React LiveKit | Molto più codice per gestire tracce, sottoscrizioni, dispositivi |

## Conseguenze

- Cambiare l'aspetto della call è un rilascio del pacchetto; i colori invece si cambiano dall'app con `--agv-*`.
- `@livekit/components-styles` non serve più agli host.
- Breaking per la 0.1.0: `displayName` diventa obbligatorio in `AgendaVideoCall`.
