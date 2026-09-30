# Decisioni architetturali (ADR)

Una decisione rilevante = un file `adr-NNNN-titolo.md` dal modello [[adr-template]]. Le ADR non si riscrivono: se una decisione cambia, se ne scrive una nuova che sostituisce la precedente.

| # | Decisione |
|---|---|
| 0001 | [[adr-0001-pacchetto-a-configurazione-esplicita]] — pacchetto esterno, configurazione esplicita, niente globali |
| 0002 | [[adr-0002-livekit-senza-sdk-server]] — token e webhook LiveKit su `node:crypto` |
| 0003 | [[adr-0003-sovrapposizioni-vietate-dal-database]] — vincolo di esclusione Postgres |
| 0004 | [[adr-0004-token-ospite-derivato]] — link ospite derivato con HMAC, non salvato |
