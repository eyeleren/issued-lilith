import fs from "node:fs";
import path from "node:path";

export class ConfigError extends Error {
	constructor(problems) {
		super(`Invalid configuration:\n${problems.map(p => `  - ${p}`).join("\n")}`);
		this.name = "ConfigError";
		this.problems = problems;
	}
}

const SNOWFLAKE = /^\d{17,20}$/;
const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"];

export function loadConfig(env = process.env) {
	const problems = [];
	const warnings = [];

	const str = (name, fallback = "") => {
		const value = env[name];
		return value == null || value.trim() === "" ? fallback : value.trim();
	};

	const bool = (name, fallback) => {
		const value = str(name).toLowerCase();
		if (value === "") return fallback;
		if (["1", "true", "yes", "on"].includes(value)) return true;
		if (["0", "false", "no", "off"].includes(value)) return false;
		problems.push(`${name} must be true/false (got "${env[name]}")`);
		return fallback;
	};

	const int = (name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
		const value = str(name);
		if (value === "") return fallback;
		const n = Number(value);
		if (!Number.isInteger(n) || n < min || n > max) {
			problems.push(`${name} must be an integer between ${min} and ${max} (got "${value}")`);
			return fallback;
		}
		return n;
	};

	const float = (name, fallback, { min, max }) => {
		const value = str(name);
		if (value === "") return fallback;
		const n = Number(value);
		if (!Number.isFinite(n) || n < min || n > max) {
			problems.push(`${name} must be a number between ${min} and ${max} (got "${value}")`);
			return fallback;
		}
		return n;
	};

	const snowflake = (name) => {
		const value = str(name);
		if (value === "") return null;
		if (!SNOWFLAKE.test(value)) {
			problems.push(`${name} must be a Discord ID (17-20 digits, got "${value}")`);
			return null;
		}
		return value;
	};

	const snowflakeList = (name) => {
		const ids = str(name).split(",").map(s => s.trim()).filter(Boolean);
		const invalid = ids.filter(id => !SNOWFLAKE.test(id));
		if (invalid.length > 0) problems.push(`${name} contains invalid Discord IDs: ${invalid.join(", ")}`);
		return ids.filter(id => SNOWFLAKE.test(id));
	};

	const url = (name, value) => {
		try {
			const parsed = new URL(value);
			if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
			return parsed.toString().replace(/\/+$/, "");
		} catch {
			problems.push(`${name} must be an http(s) URL (got "${value}")`);
			return null;
		}
	};

	const unescape = (value) => value.replace(/\\(n|t|\\)/g, (_, c) => ({ n: "\n", t: "\t", "\\": "\\" })[c]);

	const token = str("DISCORD_TOKEN") || str("TOKEN");
	if (!token) problems.push("DISCORD_TOKEN is required (Developer Portal » Bot » Token)");

	const logLevel = str("LOG_LEVEL", "info").toLowerCase();
	if (!LOG_LEVELS.includes(logLevel)) problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}`);

	const defaultTimeoutMs = int("LLM_TIMEOUT_MS", 30_000, { min: 1000, max: 600_000 });
	const providerNames = str("LLM_PROVIDERS").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
	const providers = [];
	for (const name of new Set(providerNames)) {
		if (!/^[a-z0-9_]+$/.test(name)) {
			problems.push(`LLM_PROVIDERS: invalid provider name "${name}" (use letters, digits, underscore)`);
			continue;
		}
		const prefix = `LLM_${name.toUpperCase()}_`;
		const baseUrl = str(`${prefix}BASE_URL`);
		const model = str(`${prefix}MODEL`);
		if (!baseUrl) problems.push(`${prefix}BASE_URL is required because "${name}" is listed in LLM_PROVIDERS`);
		if (!model) problems.push(`${prefix}MODEL is required because "${name}" is listed in LLM_PROVIDERS`);
		if (!baseUrl || !model) continue;
		providers.push({
			name,
			baseUrl: url(`${prefix}BASE_URL`, baseUrl),
			apiKey: str(`${prefix}API_KEY`) || null,
			model,
			timeoutMs: int(`${prefix}TIMEOUT_MS`, defaultTimeoutMs, { min: 1000, max: 600_000 })
		});
	}
	if (providerNames.length === 0) {
		warnings.push("LLM_PROVIDERS is empty: the bot will start but every chat reply will say the AI is offline");
	}

	let systemPrompt = unescape(str("SYSTEM"));
	const systemFile = str("SYSTEM_FILE");
	if (systemFile) {
		try {
			systemPrompt = fs.readFileSync(path.resolve(systemFile), "utf8").trim();
		} catch (err) {
			problems.push(`SYSTEM_FILE cannot be read (${systemFile}): ${err.message}`);
		}
	}

	const stableDiffusion = str("STABLE_DIFFUSION").split(",").map(s => s.trim()).filter(Boolean)
		.map(u => url("STABLE_DIFFUSION", u)).filter(Boolean);

	const channels = snowflakeList("CHANNELS");
	const allowDms = bool("ALLOW_DMS", true);
	if (channels.length === 0) {
		warnings.push(allowDms
			? "CHANNELS is empty: the bot will chat only in DMs"
			: "CHANNELS is empty and ALLOW_DMS=false: the bot will never chat");
	}

	const config = {
		discord: {
			token,
			guildId: snowflake("GUILD_ID")
		},
		logLevel: LOG_LEVELS.includes(logLevel) ? logLevel : "info",
		dataDir: path.resolve(str("DATA_DIR", "./data")),
		llm: {
			providers,
			temperature: float("LLM_TEMPERATURE", 0.7, { min: 0, max: 2 }),
			maxTokens: int("LLM_MAX_TOKENS", 1024, { min: 16, max: 131_072 }),
			maxRetryWaitS: int("LLM_MAX_RETRY_WAIT_S", 10, { min: 0, max: 300 }),
			offlineMessage: str("OFFLINE_MESSAGE", "⚠️ IA momentaneamente offline, riprova tra poco.")
		},
		chat: {
			channels,
			allowDms,
			requiresMention: bool("REQUIRES_MENTION", true),
			systemPrompt,
			creatorId: snowflake("CREATOR_ID"),
			creatorName: str("CREATOR_NAME"),
			initialPrompt: unescape(str("INITIAL_PROMPT")),
			showStartOfConversation: bool("SHOW_START_OF_CONVERSATION", false),
			historyMaxMessages: int("HISTORY_MAX_MESSAGES", 20, { min: 2, max: 500 }),
			attachmentMaxBytes: int("ATTACHMENT_MAX_BYTES", 100_000, { min: 0, max: 8_000_000 })
		},
		presence: {
			activityMessage: str("ACTIVITY_MESSAGE")
		},
		greeting: {
			channelId: snowflake("GREETING_CHANNEL_ID"),
			commanderRoleId: snowflake("COMMANDER_ROLE_ID"),
			message: unescape(str("GREETING_MESSAGE", "Lilith: LOGIN! A disposizione {role}"))
		},
		admins: snowflakeList("ADMIN_IDS"),
		modlogChannelId: snowflake("MODLOG_CHANNEL_ID"),
		stableDiffusion: {
			urls: stableDiffusion,
			timeoutMs: int("STABLE_DIFFUSION_TIMEOUT_MS", 120_000, { min: 1000, max: 900_000 })
		}
	};

	if (problems.length > 0) throw new ConfigError(problems);
	return { config, warnings };
}
