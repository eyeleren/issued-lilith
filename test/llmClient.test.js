import assert from "node:assert/strict";
import { test } from "node:test";
import { AllProvidersFailedError, createLlmClient, parseRetryAfter } from "../src/llm/client.js";
import { setLogLevel } from "../src/logger.js";

setLogLevel("silent");

const provider = (name, extra = {}) => ({ name, baseUrl: `http://${name}.test/v1`, apiKey: "k", model: `${name}-model`, timeoutMs: 1000, ...extra });
const options = { temperature: 0.7, maxTokens: 100, maxRetryWaitS: 5 };

const ok = content => () => new Response(JSON.stringify({ model: "m", choices: [{ message: { role: "assistant", content } }] }), { status: 200 });
const status = (code, headers = {}) => () => new Response("err", { status: code, headers });

function fakeFetch(handlers) {
	const calls = [];
	const fetchImpl = async (url, init) => {
		const host = new URL(url).hostname.split(".")[0];
		calls.push({ host, url, body: JSON.parse(init.body), headers: init.headers });
		const handler = handlers[host];
		return handler(calls.filter(c => c.host === host).length);
	};
	return { fetchImpl, calls };
}

test("uses the first provider when it works", async () => {
	const { fetchImpl, calls } = fakeFetch({ groq: ok("ciao") });
	const llm = createLlmClient({ ...options, providers: [provider("groq"), provider("ollama")] }, { fetchImpl });
	const res = await llm.chat([{ role: "user", content: "hi" }]);
	assert.equal(res.content, "ciao");
	assert.equal(res.provider, "groq");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, "http://groq.test/v1/chat/completions");
	assert.equal(calls[0].headers.authorization, "Bearer k");
	assert.equal(calls[0].body.model, "groq-model");
});

test("falls back on 5xx and network errors", async () => {
	const { fetchImpl } = fakeFetch({
		groq: status(503),
		mid: () => { throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }); },
		ollama: ok("fallback")
	});
	const llm = createLlmClient({ ...options, providers: [provider("groq"), provider("mid"), provider("ollama")] }, { fetchImpl });
	const res = await llm.chat([]);
	assert.equal(res.provider, "ollama");
	const state = Object.fromEntries(llm.status().map(s => [s.name, s.cooldownMs]));
	assert.equal(state.groq, 0);
	assert.ok(state.mid > 0);
});

test("429 with short retry-after waits and retries the same provider", async () => {
	const waits = [];
	const { fetchImpl, calls } = fakeFetch({ groq: n => n === 1 ? status(429, { "retry-after": "2" })() : ok("dopo")() });
	const llm = createLlmClient({ ...options, providers: [provider("groq"), provider("ollama")] }, { fetchImpl, sleep: async ms => waits.push(ms) });
	const res = await llm.chat([]);
	assert.equal(res.content, "dopo");
	assert.deepEqual(waits, [2000]);
	assert.equal(calls.length, 2);
});

test("429 with long retry-after skips to next provider and sets cooldown", async () => {
	let now = 1_000_000;
	const { fetchImpl, calls } = fakeFetch({ groq: status(429, { "retry-after": "60" }), ollama: ok("ok") });
	const llm = createLlmClient({ ...options, providers: [provider("groq"), provider("ollama")] }, { fetchImpl, now: () => now, sleep: async () => undefined });
	assert.equal((await llm.chat([])).provider, "ollama");
	await llm.chat([]);
	assert.equal(calls.filter(c => c.host === "groq").length, 1, "groq skipped while cooling down");
	now += 61_000;
	await llm.chat([]);
	assert.equal(calls.filter(c => c.host === "groq").length, 2, "groq retried after cooldown");
});

test("truncated or empty replies fall back to the next provider without a cooldown", async () => {
	const truncated = () => new Response(JSON.stringify({ choices: [{ message: { content: "Uno è un nome, l" }, finish_reason: "length" }] }), { status: 200 });
	const { fetchImpl } = fakeFetch({ groq: truncated, mid: ok("  "), ollama: ok("intera") });
	const llm = createLlmClient({ ...options, providers: [provider("groq"), provider("mid"), provider("ollama")] }, { fetchImpl });
	const res = await llm.chat([]);
	assert.equal(res.content, "intera");
	assert.ok(llm.status().every(s => s.cooldownMs === 0));
});

test("throws AllProvidersFailedError when everything fails", async () => {
	const { fetchImpl } = fakeFetch({ groq: status(500), ollama: status(401) });
	const llm = createLlmClient({ ...options, providers: [provider("groq"), provider("ollama")] }, { fetchImpl });
	await assert.rejects(llm.chat([]), err => err instanceof AllProvidersFailedError && err.errors.length === 2);
});

test("throws AllProvidersFailedError with no providers", async () => {
	const llm = createLlmClient({ ...options, providers: [] });
	await assert.rejects(llm.chat([]), AllProvidersFailedError);
});

test("parseRetryAfter handles seconds and dates", () => {
	assert.equal(parseRetryAfter("3"), 3000);
	assert.equal(parseRetryAfter("0.5"), 500);
	assert.equal(parseRetryAfter(null), null);
	assert.equal(parseRetryAfter("nonsense"), null);
	assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), 4000), 6000);
});
