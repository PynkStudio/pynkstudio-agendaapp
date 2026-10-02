# Agendaapp — Documentazione

Vault Obsidian del pacchetto `@pynkstudio/agendaapp`. Apri la **root della repo** come vault.

## Ordine di lettura

1. **`AGENTS.md`** (root) — regole per chi modifica il codice, persone e IA. Leggilo per primo.
2. **`README.md`** (root) — cosa fa il pacchetto e avvio rapido.
3. [[panoramica]] — perché esiste, cosa fa e cosa lascia all'app che lo usa.
4. [[architettura]] — entrypoint, confine browser/server, flussi.
5. [[integrare-in-un-progetto]] — guida passo per passo.

## Mappa

| Sezione | Documenti |
|---|---|
| `00-vision/` | [[panoramica]] |
| `02-architecture/` | [[architettura]], [[modello-dati]] |
| `03-features/` | [[prenotazione-e-disponibilita]], [[staff-e-capienza]], [[calendari-collegati]], [[impostazioni]], [[videocall]], [[link-ospite-ed-email]], [[promemoria]] |
| `04-decisions/` | [[04-decisions/README\|indice ADR]] |
| `05-roadmap/` | [[backlog]] |
| `06-integrations/` | [[livekit-self-hosted]], [[supabase]] |
| `08-processes/` | [[integrare-in-un-progetto]], [[rilascio-versione]], [[playground-video]] |
| `templates/` | [[adr-template]], [[feature-template]] |

## Regole di scrittura

- Markdown semplice, link `[[nome file]]`.
- **Mai inventare**: ciò che è dedotto dal codice si scrive come fatto; ciò che non è verificato si marca **Da verificare**.
- Nessun segreto o valore reale di env: solo i nomi.
- Nessun riferimento a un progetto che usa il pacchetto: gli esempi usano `example.com` e scope generici.
- Ogni modifica al codice che cambia comportamento, API pubblica o schema aggiorna i documenti corrispondenti **nello stesso commit** (tabella in `AGENTS.md`).
