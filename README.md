# issued-lilith

<p align="center"><img src="assets/lilith_profile_pic.png" alt="Lilith" width="180"></p>

**Lilith** è un bot Discord (discord.js v14, Node 22, ESM) pensato per girare h24 in Docker su un NAS, anche ARMv7 a 32 bit come il QNAP TS-x31P3. Il bot non esegue modelli in locale: usa provider LLM esterni tramite API compatibili con OpenAI (Groq come primario, Ollama sul Mac o altri come fallback).

## Funzionalità

- **Chat con LLM**: storico per canale e per DM (persistito su disco), system prompt configurabile, lettura degli allegati testuali, sostituzione di mention, canali ed emoji, risposte divise a 2000 caratteri senza rompere i blocchi di codice, indicatore "sta scrivendo".
- **Fallback tra provider**: lista ordinata. Con timeout, errori, host irraggiungibile o 429 passa al provider successivo; il `retry-after` viene rispettato. Se sono tutti giù risponde "IA momentaneamente offline" e non crasha.
- **Hardban**: se qualcuno sbanna un utente in lista, il bot lo ribanna subito e registra nel mod-log chi aveva tentato lo sban (letto dall'Audit Log).
- **Slash command**: `/help`, `/ping`, `/model`, `/system`, `/reset`, `/hardban`, `/restart` e `/text2img` (quest'ultimo solo se è configurato Stable Diffusion).
- **Pulizia giornaliera**: ogni giorno a un'ora fissa (default 05:00, ora italiana) svuota i canali scelti, conservando solo i messaggi fissati, e azzera la memoria della conversazione. È una "chat del giorno". Se il bot era spento a quell'ora, recupera la pulizia al riavvio.
- Stato personalizzato e messaggio di benvenuto al login con mention di un ruolo.

## Comandi

| Comando | Chi | Cosa fa |
|---|---|---|
| `/help` | tutti | Spiega come usare il bot ed elenca i comandi |
| `/ping` | tutti | Latenza (roundtrip e gateway) |
| `/model` | tutti | Provider in ordine di fallback, modelli, eventuale cooldown |
| `/system` | tutti | Mostra il system prompt (ephemeral) |
| `/reset` | tutti | Cancella la conversazione del canale o DM corrente |
| `/hardban add utente\|id [motivo]` | admin | Aggiunge l'utente alla lista e lo banna se non è già bannato |
| `/hardban remove utente\|id` | admin | Toglie l'utente dalla lista (il ban resta) |
| `/hardban list` | admin | Mostra la lista del server |
| `/purge` | admin | Svuota subito il canale corrente, se è tra quelli con pulizia giornaliera |
| `/restart` | `ADMIN_IDS` | Salva i dati ed esce; Docker riavvia il container |
| `/text2img prompt …` | tutti | Genera immagini con AUTOMATIC1111 (solo se c'è `STABLE_DIFFUSION`) |

"Admin" significa: ID presente in `ADMIN_IDS` **oppure** permesso Administrator nel server.

Per parlare con Lilith in chat: menzionala in un canale presente in `CHANNELS` (o anche senza mention, se `REQUIRES_MENTION=false`), rispondi a un suo messaggio oppure scrivile in DM. I thread dentro un canale abilitato funzionano come il canale.

## Setup sul Discord Developer Portal

1. Crea un'applicazione su <https://discord.com/developers/applications>.
2. **Bot** » *Reset Token*: il valore va in `DISCORD_TOKEN`. Non condividerlo mai.
3. **Bot** » *Privileged Gateway Intents*: attiva **Message Content Intent**. *Server Members Intent* e *Presence Intent* non servono.
4. **Installation** (o OAuth2 » URL Generator): scope `bot` e `applications.commands`, con questi permessi:
   - View Channels, Send Messages, Send Messages in Threads, Read Message History, Embed Links, Attach Files (per la chat e `/text2img`);
   - **Ban Members** e **View Audit Log** (per l'hardban);
   - **Manage Messages** (per la pulizia giornaliera).

   In alternativa usa direttamente questo URL (sostituisci `APP_ID`):
   `https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot+applications.commands&permissions=274878033028`
5. Nel server, il **ruolo del bot deve stare sopra** i ruoli degli utenti che deve bannare.

Intents usati dal bot: `Guilds`, `GuildMessages`, `DirectMessages`, `MessageContent` (privilegiato) e `GuildModeration` (per `guildBanRemove`). `GuildMembers` non serve: i nomi delle mention li prende dal messaggio stesso.

Per copiare gli ID (canali, ruoli, utenti): Impostazioni Discord » Avanzate » **Modalità sviluppatore**, poi tasto destro » *Copia ID*.

## Configurazione

Copia `.env.example` in `.env` (`make env`) e compilalo. Il file è commentato variabile per variabile; quelle principali:

| Variabile | Default | Note |
|---|---|---|
| `DISCORD_TOKEN` | **obbligatoria** | Token del bot |
| `GUILD_ID` | — | Solo per lo sviluppo: registra i comandi su questa guild (effetto immediato). Vuota = registrazione globale |
| `ADMIN_IDS` | — | ID separati da virgola: `/restart` e `/hardban` |
| `CREATOR_ID` | — | ID Discord del creatore: i suoi messaggi arrivano al modello marcati `[creatore]`, così Lilith lo riconosce anche se qualcuno copia il suo nickname |
| `CREATOR_NAME` | — | Alias del creatore: il bot lo conosce e può usarlo, oltre al nome visualizzato che il creatore ha in quel momento |
| `LLM_PROVIDERS` | — | Lista ordinata, es. `groq,ollama`. Vedi sotto |
| `LLM_TIMEOUT_MS` | `30000` | Timeout per richiesta (sovrascrivibile con `LLM_<NOME>_TIMEOUT_MS`) |
| `LLM_MAX_RETRY_WAIT_S` | `10` | Con un 429, attesa massima accettata prima di riprovare lo stesso provider |
| `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` | `0.7` / `1024` | |
| `CHANNELS` | — | Canali abilitati alla chat, separati da virgola |
| `ALLOW_DMS` | `true` | Risponde nei DM |
| `REQUIRES_MENTION` | `true` | Nei canali risponde solo se menzionata (i reply ai suoi messaggi funzionano sempre) |
| `HISTORY_MAX_MESSAGES` | `20` | Messaggi (utente + bot) tenuti per canale |
| `SYSTEM` / `SYSTEM_FILE` | — | System prompt su una riga (`\n` per andare a capo, `<date>` = data/ora corrente) oppure da file |
| `INITIAL_PROMPT` | — | Testo anteposto al primo messaggio di ogni conversazione |
| `SHOW_START_OF_CONVERSATION` | `false` | Mostra una nota al primo messaggio |
| `ATTACHMENT_MAX_BYTES` | `100000` | Dimensione massima degli allegati di testo (0 = ignora) |
| `ACTIVITY_MESSAGE` | — | Stato personalizzato |
| `GREETING_CHANNEL_ID`, `COMMANDER_ROLE_ID`, `GREETING_MESSAGE` | — | Messaggio al login; `{role}` diventa la mention del ruolo |
| `DAILY_PURGE_CHANNELS` | — | Canali da svuotare ogni giorno (restano solo i messaggi fissati) |
| `DAILY_PURGE_TIME` / `TZ` | `05:00` / UTC | Ora della pulizia e fuso orario: imposta `TZ=Europe/Rome` |
| `MODLOG_CHANNEL_ID` | — | Canale dove vengono registrati re-ban e modifiche alla lista hardban |
| `STABLE_DIFFUSION` | — | URL di AUTOMATIC1111 (`--api`); vuota = niente `/text2img` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `DATA_DIR` | `./data` | In Docker è `/app/data` |

La configurazione viene validata all'avvio: se qualcosa non va, il bot elenca **tutti** i problemi insieme ed esce.

### Dati persistiti (`data/`)

- `conversations.json`: storico delle chat per canale;
- `hardbans.json`: lista hardban per guild;
- `commands-state.json`: hash degli slash command registrati. Il PUT verso Discord parte solo quando i comandi o lo scope cambiano; cancella questo file per forzare una nuova registrazione;
- `.heartbeat`: usato dall'healthcheck di Docker.

Le scritture sono atomiche (file temporaneo + rename): un riavvio a metà scrittura non corrompe i file.

## Provider LLM

Il bot usa un solo client per l'endpoint `POST {BASE_URL}/chat/completions`, quindi qualsiasi provider compatibile con OpenAI va bene. Per ogni nome in `LLM_PROVIDERS` servono:

```env
LLM_<NOME>_BASE_URL=...      # obbligatoria, fino a /v1
LLM_<NOME>_MODEL=...         # obbligatoria
LLM_<NOME>_API_KEY=...       # se il provider la richiede
LLM_<NOME>_TIMEOUT_MS=...    # opzionale
```

Esempio: due modelli Groq con la stessa chiave (un modello veloce e uno stabile di riserva; Groq conta i limiti per modello) e Ollama sul Mac come ultima spiaggia:

```env
LLM_PROVIDERS=groq,groq_oss,ollama
LLM_GROQ_BASE_URL=https://api.groq.com/openai/v1
LLM_GROQ_API_KEY=gsk_...
LLM_GROQ_MODEL=qwen/qwen3.8-27b
LLM_GROQ_OSS_BASE_URL=https://api.groq.com/openai/v1
LLM_GROQ_OSS_API_KEY=gsk_...
LLM_GROQ_OSS_MODEL=openai/gpt-oss-120b
LLM_OLLAMA_BASE_URL=http://192.168.1.50:11434/v1
LLM_OLLAMA_MODEL=llama3.2
```

- **Groq**: i modelli disponibili **dipendono dall'account** e non sempre coincidono con quelli della [documentazione](https://console.groq.com/docs/models). Controlla i tuoi con `curl -H "Authorization: Bearer gsk_..." https://api.groq.com/openai/v1/models`. Con un modello non disponibile Groq risponde `404 model_not_found` e il bot passa al provider successivo. I modelli "preview" (es. `qwen/qwen3.8-27b`) possono sparire con poco preavviso: tieni un modello di produzione (es. `openai/gpt-oss-120b`) come riserva.
- **Ollama sul Mac**: il NAS e il Mac sono macchine diverse, quindi usa l'IP LAN del Mac e avvia Ollama in ascolto sulla rete (`OLLAMA_HOST=0.0.0.0 ollama serve`, oppure `launchctl setenv OLLAMA_HOST 0.0.0.0` se usi l'app). `host.docker.internal` punta al NAS stesso, quindi serve solo se Ollama gira sul NAS.
- **Cambiare provider**: modifica l'ordine di `LLM_PROVIDERS` o aggiungi un nome nuovo con le sue variabili (es. `openrouter`), poi riavvia il container. Non serve toccare il codice.

Come funziona il fallback: i provider vengono provati in ordine.
- Timeout o host irraggiungibile: passa al provider successivo e mette quello caduto in pausa per 30s.
- Risposte 4xx/5xx: passa al successivo.
- 429 con `retry-after` ≤ `LLM_MAX_RETRY_WAIT_S`: aspetta e riprova una volta lo stesso provider; altrimenti lo mette in pausa fino alla scadenza indicata (60s se l'header manca) e passa al successivo.

`/model` mostra lo stato di ogni provider. I blocchi `<think>…</think>` dei modelli di reasoning vengono tolti dalla risposta.

## Avvio in locale

Requisiti: Node 22.

```sh
make env        # crea .env da .env.example
npm ci
npm run dev     # oppure: npm start
```

Mentre sviluppi, imposta `GUILD_ID` con l'ID del tuo server di test: i comandi compaiono subito.

Altri comandi: `npm run lint`, `npm test`, `make check` (lint + test), `make help`.

## Deploy sul QNAP (Container Station)

Il TS-x31P3 ha una CPU ARMv7 a 32 bit: l'immagine si compila per `linux/arm/v7` (con buildx sul Mac o nelle GitHub Actions).

⚠️ **Il kernel del QNAP usa pagine di memoria da 32 KB.** Un programma si avvia solo se è compilato con segmenti allineati ad almeno 32 KB; altrimenti il container muore subito con `error while loading shared libraries: libc.so.6: ELF load command address/offset not page-aligned`. Per questo l'immagine usa **`node:22-bullseye-slim`**, dove tutti i file sono allineati a 64 KB. Non usarne altre:
- `bookworm`: la sua libc è allineata a 4 KB;
- `alpine`: tutti i file sono allineati a 4 KB.

Il workflow controlla l'allineamento di ogni file dell'immagine (`.github/scripts/check-elf-alignment.sh`) e non pubblica se ne trova uno sotto i 32 KB. Debian 11 bullseye non riceve più aggiornamenti di sicurezza da agosto 2026: per un bot senza porte esposte il rischio è basso, ma quando uscirà un'immagine Node compatibile con pagine da 32 KB conviene passarci.

### Opzione A: esportare un `.tar` da importare

```sh
make save-arm   # crea issued-lilith-armv7.tar
```

Equivale a:

```sh
docker buildx create --name lilith-builder --driver docker-container   # solo la prima volta
docker buildx build --builder lilith-builder --platform linux/arm/v7 --provenance=false \
  -t issued-lilith:latest --output type=docker,dest=issued-lilith-armv7.tar .
```

Poi, sul QNAP:
1. **Container Station** » *Images* » *Import*, e seleziona il `.tar` (oppure via SSH: `docker load -i issued-lilith-armv7.tar`).
2. Copia sul NAS, per esempio in `/share/Container/issued-lilith/`, i file `docker-compose.yml` e `.env`.
3. **Container Station** » *Applications* » *Create*: incolla il `docker-compose.yml` (o, via SSH, `docker compose up -d` in quella cartella). L'immagine `issued-lilith:latest` esiste già, quindi non viene ricompilata.

### Opzione B: GitHub Container Registry (build automatica)

A ogni push su `main`, il workflow `.github/workflows/docker.yml`:
1. esegue lint e test;
2. compila l'immagine `linux/arm/v7` e la pubblica su `ghcr.io/eyeleren/issued-lilith` con i tag `latest` e `sha-xxxxxxx`;
3. se la versione di `package.json` non ha ancora un tag, aggiunge all'immagine i tag `2.3.0` e `2`, poi crea il tag git `v2.3.0` e una GitHub Release con le note generate dai commit.

Sulle pull request compila soltanto, senza pubblicare.

#### Versioni automatiche

Come in issued-app, l'hook `.githooks/pre-commit` aumenta la **minor** di `package.json` a ogni commit (`2.3.0` → `2.4.0`) e la aggiunge al commit. Funziona anche da GitHub Desktop: è scritto solo in `sh` e `awk`, senza `node`.
- L'hook si installa con `npm install` (script `prepare`, che imposta `core.hooksPath`). Su un clone nuovo basta lanciarlo una volta.
- Merge, rebase e cherry-pick non incrementano la versione. Per saltare l'incremento: `SKIP_VERSION_BUMP=1` oppure `--no-verify`.
- La major si cambia a mano in `package.json`.

Di tag e Release si occupa il workflow: non serve fare push di tag.

#### Visibilità

Il pacchetto è **pubblico**: un pacchetto creato da un workflow eredita la visibilità della repo, e da pubblico non può più tornare privato. Contiene solo il codice già presente nella repo. `.env`, `data/` e `.git` sono esclusi da `.dockerignore`: **non mettere mai segreti nel Dockerfile** (`ENV`/`ARG`), perché finirebbero in un'immagine scaricabile da chiunque.

#### Sul NAS, solo dall'interfaccia web

1. **File Station**: nella cartella condivisa `Container` crea la cartella `issued-lilith` e, al suo interno, la cartella `data`. Copia il tuo `.env` con il nome visibile `lilith.env` (`cp .env lilith.env`, ignorato da git) e caricalo in `issued-lilith`.
   Il risultato deve essere `/share/Container/issued-lilith/lilith.env` più `/share/Container/issued-lilith/data/`.
2. **Container Station** » *Applications* » *Create*: dai all'applicazione il nome `issued-lilith`, incolla il contenuto di [`docker-compose.qnap.yml`](docker-compose.qnap.yml) e clicca *Create*. Container Station scarica l'immagine da ghcr.io (è pubblica, quindi non serve login) e avvia il bot.
3. Gli aggiornamenti sono **automatici**: il compose include [Watchtower](https://github.com/nicholas-fedor/watchtower), il fork mantenuto dell'originale `containrrr/watchtower`, ormai abbandonato. Ogni giorno alle 4:30 (ora italiana) controlla se su ghcr.io c'è un'immagine `:2` nuova e, se c'è, la scarica, ricrea il container di Lilith con la stessa configurazione e cancella l'immagine vecchia.
   - Tocca solo i container con l'etichetta `com.centurylinklabs.watchtower.enable=true`, cioè solo Lilith.
   - Per avere Watchtower accesso al Docker del NAS (`/var/run/docker.sock`): è il modo standard in cui funziona, ma significa che controlla Docker, quindi usa solo l'immagine indicata.
   - Il suo eseguibile è compatibile con le pagine da 32 KB del QNAP (verificato con `check-elf-alignment.sh`).
   - Dopo un aggiornamento Lilith si riavvia e manda di nuovo il messaggio di benvenuto; la pulizia delle 5:00 lo toglie poco dopo.

Non serve sistemare i permessi della cartella `data`: al primo avvio il container la assegna all'utente `node` (uid 1000) e poi gira come quell'utente, non come root.

Il tag dell'immagine in `docker-compose.qnap.yml` decide quali aggiornamenti ricevi:

| `image: ghcr.io/eyeleren/issued-lilith:…` | Cosa ricevi aggiornando |
|---|---|
| `latest` | ogni push su `main` |
| `2` | ogni versione 2.x (default) |
| `2.3.0` | esattamente quella versione (per tornare indietro) |

Con SSH, lo stesso si fa con il `docker-compose.yml` normale (`LILITH_IMAGE` nel `.env`) e `docker compose pull && docker compose up -d`.

La versione in esecuzione compare nei log all'avvio e nella risposta di `/ping`.

### Il compose in breve

- `restart: unless-stopped` e `init: true`;
- volume `./data:/app/data`, variabili da `env_file: .env`;
- `extra_hosts: host.docker.internal:host-gateway`;
- limite di 256 MB di RAM (heap Node a 192 MB) e 1 CPU;
- log ruotati (10 MB × 3).

L'healthcheck è definito nel Dockerfile: il container risulta *healthy* finché il bot è connesso al gateway e aggiorna `data/.heartbeat`.

Il bot gestisce `SIGTERM` salvando i dati prima di uscire. `/restart` esce con codice 75 e Docker lo riavvia (vale sia con `unless-stopped` sia con `on-failure`). Per spegnerlo davvero: `docker compose stop` o Container Station.

## Hardban: come funziona

1. `/hardban add` salva l'utente nella lista della guild (`data/hardbans.json`) e lo banna se non lo è già. Funziona anche con utenti che non sono nel server: basta l'ID.
2. Quando arriva un evento `guildBanRemove` per un utente in lista, il bot cerca nell'Audit Log (`MemberBanRemove`) chi ha rimosso il ban e lo ribanna con un motivo del tipo `Hardban: sban di mod#1234 (id) annullato. Motivo originale: …`.
3. Se `MODLOG_CHANNEL_ID` è impostato, invia lì un embed con l'utente, chi aveva sbannato e l'esito. Anche aggiunte e rimozioni dalla lista finiscono nel mod-log.
4. Per sbannare davvero qualcuno: prima `/hardban remove`, poi lo sban normale.

Permessi necessari: **Ban Members** e **View Audit Log**, con il ruolo del bot sopra quello del bersaglio.

## Credits

- Riscrittura da zero di un fork personale di [mekb-turtle/discord-ai-bot](https://github.com/mekb-turtle/discord-ai-bot) (ora [238SAMIxD/discord-ai-bot](https://github.com/238SAMIxD/discord-ai-bot)), che ha ispirato le funzionalità di chat originali. Grazie ai suoi autori. Quel progetto non pubblica una licenza, perciò qui non è stato riusato né adattato il suo codice: tutto il codice di questa repo è stato scritto ex novo.
- Basato su [discord.js](https://discord.js.org).

## Licenza

[MIT](LICENSE) © 2026 Simone Zanon
