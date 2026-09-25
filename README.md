# issued-lilith

<p align="center"><img src="assets/lilith_profile_pic.png" alt="Lilith" width="180"></p>

**Lilith** è un bot Discord (discord.js v14, Node 22, ESM) pensato per girare h24 in Docker su un NAS, anche ARMv7 a 32 bit come il QNAP TS-x31P3. Il bot non esegue modelli in locale: usa provider LLM esterni tramite API compatibili con OpenAI (Groq come primario, Ollama sul Mac o altri come fallback).

## Funzionalità

- **Chat con LLM**: storico per canale e per DM (persistito su disco), system prompt configurabile, lettura degli allegati testuali, sostituzione di mention, canali ed emoji, risposte divise a 2000 caratteri senza rompere i blocchi di codice, indicatore "sta scrivendo".
- **Fallback tra provider**: lista ordinata. Con timeout, errori, host irraggiungibile o 429 passa al provider successivo; il `retry-after` viene rispettato. Se sono tutti giù risponde "IA momentaneamente offline" e non crasha.
- **Hardban**: se qualcuno sbanna un utente in lista, il bot lo ribanna subito e registra nel mod-log chi aveva tentato lo sban (letto dall'Audit Log).
- **Slash command**: `/help`, `/ping`, `/model`, `/system`, `/reset`, `/hardban`, `/restart` e `/text2img` (quest'ultimo solo se è configurato Stable Diffusion).
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
   - **Ban Members** e **View Audit Log** (per l'hardban).

   In alternativa usa direttamente questo URL (sostituisci `APP_ID`):
   `https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot+applications.commands&permissions=274878024836`
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

Esempio con Groq come primario e Ollama sul Mac come riserva:

```env
LLM_PROVIDERS=groq,ollama
LLM_GROQ_BASE_URL=https://api.groq.com/openai/v1
LLM_GROQ_API_KEY=gsk_...
LLM_GROQ_MODEL=llama-3.3-70b-versatile
LLM_OLLAMA_BASE_URL=http://192.168.1.50:11434/v1
LLM_OLLAMA_MODEL=llama3.2
```

- **Groq**: modelli in produzione a settembre 2026: `llama-3.3-70b-versatile` (default consigliato), `llama-3.1-8b-instant` (più veloce, limiti free più alti), `openai/gpt-oss-120b`, `openai/gpt-oss-20b`. L'elenco aggiornato è su <https://console.groq.com/docs/models>.
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

Il TS-x31P3 ha una CPU ARMv7 a 32 bit: l'immagine si compila sul Mac per `linux/arm/v7` con buildx (emulazione QEMU, già inclusa in Docker Desktop). `node:22-bookworm-slim` è disponibile anche per `arm/v7`.

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
3. Crea la cartella dei dati con i permessi dell'utente del container (uid 1000):
   ```sh
   mkdir -p /share/Container/issued-lilith/data
   chown -R 1000:1000 /share/Container/issued-lilith/data
   ```
4. **Container Station** » *Applications* » *Create*: incolla il `docker-compose.yml` (o, via SSH, `docker compose up -d` in quella cartella). L'immagine `issued-lilith:latest` esiste già, quindi non viene ricompilata.

### Opzione B: GitHub Container Registry (build automatica)

Il workflow `.github/workflows/docker.yml` parte a ogni push su `main`. Esegue lint e test, poi compila l'immagine `linux/arm/v7` e la pubblica su `ghcr.io/eyeleren/issued-lilith` con questi tag:
- `latest` per l'ultima versione di `main`;
- `sha-xxxxxxx` per ogni commit;
- `2.0.0` e `2.0` quando fai push di un tag `v2.0.0`.

Sulle pull request compila soltanto, senza pubblicare. Il push usa il `GITHUB_TOKEN` del workflow, quindi non devi configurare nessun secret.

**Il pacchetto resta privato anche se la repo è pubblica.** Un package appena pubblicato su GHCR è privato, e il collegamento alla repo gli trasmette i permessi di accesso ma non la visibilità. Dopo il primo run controlla su GitHub » profilo » *Packages* » `issued-lilith` » *Package settings*. ⚠️ Non renderlo mai pubblico: GitHub non permette di tornare a privato.

Sul NAS:
1. Crea un Personal Access Token (classic) con il solo scope `read:packages`.
2. Fai login al registry: via SSH con `docker login ghcr.io -u eyeleren` (come password il token), oppure aggiungi il registry `ghcr.io` nelle impostazioni di Container Station.
3. Accanto al `docker-compose.yml`, nel `.env` aggiungi `LILITH_IMAGE=ghcr.io/eyeleren/issued-lilith:latest`.
4. Avvia e, per ogni aggiornamento, lancia `docker compose pull && docker compose up -d`.

#### Versioni

Per rilasciare una versione (con il working tree pulito):

```sh
make release VERSION=patch    # 2.0.0 → 2.0.1 (oppure minor, major, o 2.1.0 esplicito)
git push --follow-tags
```

`make release` esegue lint e test, aggiorna la versione in `package.json` e `package-lock.json`, crea il commit `chore: release vX.Y.Z` e il tag `vX.Y.Z`. Con il push del tag, il workflow:
1. controlla che il tag corrisponda a `package.json`;
2. pubblica l'immagine con i tag `2.0.1`, `2.0` e `2`;
3. crea una GitHub Release con le note generate dai commit.

Sul NAS puoi scegliere quanto essere "fermo" con `LILITH_IMAGE`:

| `LILITH_IMAGE=ghcr.io/eyeleren/issued-lilith:…` | Cosa ricevi con `docker compose pull` |
|---|---|
| `latest` | ogni push su `main` |
| `2` | tutte le release 2.x.y |
| `2.0` | solo le patch 2.0.y |
| `2.0.1` | esattamente quella versione (per tornare indietro) |

La versione in esecuzione compare nei log all'avvio e nella risposta di `/ping`.

Per pubblicare a mano dal Mac, senza passare dalle Actions (serve un token con `write:packages`):

```sh
docker login ghcr.io -u eyeleren
make push-arm REGISTRY_IMAGE=ghcr.io/eyeleren/issued-lilith:latest
```

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
