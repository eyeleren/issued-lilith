import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Client, GatewayIntentBits, Partials, Status } from "discord.js";
import { ConfigError, loadConfig } from "./config.js";
import { createChatHandler } from "./features/chat.js";
import { HardbanStore } from "./features/hardban.js";
import { createLlmClient } from "./llm/client.js";
import { Conversations } from "./llm/conversations.js";
import { loadCommands, loadEvents } from "./loader.js";
import { createLogger, setLogLevel } from "./logger.js";
import { flushAllStores } from "./storage/jsonStore.js";

const log = createLogger("main");
const { version } = createRequire(import.meta.url)("../package.json");
const HEARTBEAT_INTERVAL_MS = 30_000;

// Local runs read .env; in Docker the variables come from compose's env_file.
try {
	process.loadEnvFile();
} catch (err) {
	if (err.code !== "ENOENT") throw err;
}

let config;
try {
	const loaded = loadConfig();
	config = loaded.config;
	setLogLevel(config.logLevel);
	for (const warning of loaded.warnings) log.warn(warning);
} catch (err) {
	if (err instanceof ConfigError) {
		log.error(err.message);
		process.exit(1);
	}
	throw err;
}

log.info(`issued-lilith v${version}, Node ${process.version} (${process.arch})`);

try {
	fs.mkdirSync(config.dataDir, { recursive: true });
	fs.accessSync(config.dataDir, fs.constants.W_OK);
} catch (err) {
	log.error(`Data directory ${config.dataDir} is not writable (${err.code}). In Docker: chown -R 1000:1000 ./data on the host.`);
	process.exit(1);
}

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildModeration,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent
	],
	// DM channels are not cached until the first message, so they arrive as partials.
	partials: [Partials.Channel],
	allowedMentions: { parse: [], repliedUser: false }
});

const llm = createLlmClient(config.llm);
const conversations = new Conversations(config.dataDir, config.chat.historyMaxMessages);
const hardbans = new HardbanStore(config.dataDir);
const commands = await loadCommands(config);

let shuttingDown = false;
async function shutdown(reason, code = 0) {
	if (shuttingDown) return;
	shuttingDown = true;
	log.info(`Shutting down (${reason})`);
	await flushAllStores();
	await client.destroy().catch(() => undefined);
	process.exit(code);
}

const ctx = { config, client, llm, conversations, hardbans, commands, shutdown, log, version };
ctx.handleMessage = createChatHandler(ctx);

const events = await loadEvents(client, ctx);
log.debug(`Events: ${events.join(", ")} · Commands: ${[...commands.keys()].join(", ")}`);

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", err => log.error("Unhandled rejection:", err));
process.on("uncaughtException", err => {
	log.error("Uncaught exception:", err);
	shutdown("uncaught exception", 1);
});

// Read by scripts/healthcheck.js; only touched while the gateway is connected.
const heartbeatFile = path.join(config.dataDir, ".heartbeat");
setInterval(() => {
	if (client.ws.status !== Status.Ready) return;
	fs.writeFile(heartbeatFile, String(Date.now()), err => {
		if (err) log.warn("Heartbeat write failed:", err.message);
	});
}, HEARTBEAT_INTERVAL_MS).unref();

try {
	await client.login(config.discord.token);
} catch (err) {
	log.error("Discord login failed:", err.message);
	await flushAllStores();
	process.exit(1);
}
