import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, loadConfig } from "../src/config.js";

test("minimal config: only the token", () => {
	const { config, warnings } = loadConfig({ DISCORD_TOKEN: "x" });
	assert.equal(config.llm.providers.length, 0);
	assert.equal(config.chat.requiresMention, true);
	assert.equal(config.chat.historyMaxMessages, 20);
	assert.equal(config.stableDiffusion.urls.length, 0);
	assert.ok(warnings.length >= 2);
});

test("parses providers in order", () => {
	const { config } = loadConfig({
		DISCORD_TOKEN: "x",
		LLM_PROVIDERS: "groq, ollama",
		LLM_GROQ_BASE_URL: "https://api.groq.com/openai/v1/",
		LLM_GROQ_API_KEY: "gsk",
		LLM_GROQ_MODEL: "llama-3.3-70b-versatile",
		LLM_OLLAMA_BASE_URL: "http://host.docker.internal:11434/v1",
		LLM_OLLAMA_MODEL: "llama3.2",
		LLM_OLLAMA_TIMEOUT_MS: "90000"
	});
	assert.deepEqual(config.llm.providers.map(p => p.name), ["groq", "ollama"]);
	assert.equal(config.llm.providers[0].baseUrl, "https://api.groq.com/openai/v1");
	assert.equal(config.llm.providers[1].apiKey, null);
	assert.equal(config.llm.providers[1].timeoutMs, 90000);
});

test("reports every problem at once", () => {
	assert.throws(() => loadConfig({
		LLM_PROVIDERS: "groq",
		CHANNELS: "123,abc",
		REQUIRES_MENTION: "maybe"
	}), err => err instanceof ConfigError && err.problems.length === 5);
});

test("unescapes \\n in SYSTEM", () => {
	const { config } = loadConfig({ DISCORD_TOKEN: "x", SYSTEM: "riga1\\nriga2" });
	assert.equal(config.chat.systemPrompt, "riga1\nriga2");
});

test("daily purge time and channels", () => {
	const { config } = loadConfig({ DISCORD_TOKEN: "x", DAILY_PURGE_CHANNELS: "1253071374055112825", DAILY_PURGE_TIME: "5:30" });
	assert.deepEqual(config.dailyPurge, { channels: ["1253071374055112825"], time: { hour: 5, minute: 30 } });
	assert.deepEqual(loadConfig({ DISCORD_TOKEN: "x" }).config.dailyPurge.time, { hour: 5, minute: 0 });
	assert.throws(() => loadConfig({ DISCORD_TOKEN: "x", DAILY_PURGE_TIME: "25:00" }), ConfigError);
});

test("Watchtower is enabled only with both URL and token", () => {
	assert.equal(loadConfig({ DISCORD_TOKEN: "x" }).config.watchtower, null);
	const half = loadConfig({ DISCORD_TOKEN: "x", WATCHTOWER_URL: "http://watchtower:8080" });
	assert.equal(half.config.watchtower, null);
	assert.ok(half.warnings.some(w => w.includes("WATCHTOWER_TOKEN")));
	const full = loadConfig({ DISCORD_TOKEN: "x", WATCHTOWER_URL: "http://watchtower:8080/", WATCHTOWER_TOKEN: "t" });
	assert.deepEqual(full.config.watchtower, { url: "http://watchtower:8080", token: "t" });
});
