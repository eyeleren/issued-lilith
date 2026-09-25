import { createLogger } from "../logger.js";

const log = createLogger("llm");

const UNREACHABLE_COOLDOWN_MS = 30_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

export class ProviderError extends Error {
	constructor(provider, message, { status = null, retryAfterMs = null, cause } = {}) {
		super(`[${provider}] ${message}`, { cause });
		this.name = "ProviderError";
		this.provider = provider;
		this.status = status;
		this.retryAfterMs = retryAfterMs;
	}
}

export class AllProvidersFailedError extends Error {
	constructor(errors) {
		super(errors.length > 0
			? `All LLM providers failed: ${errors.map(e => e.message).join("; ")}`
			: "No LLM provider available");
		this.name = "AllProvidersFailedError";
		this.errors = errors;
	}
}

export function parseRetryAfter(value, now = Date.now()) {
	if (value == null || value === "") return null;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
	const date = Date.parse(value);
	if (Number.isNaN(date)) return null;
	return Math.max(0, date - now);
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createLlmClient(options, { fetchImpl = globalThis.fetch, sleep = defaultSleep, now = Date.now } = {}) {
	const { providers, temperature, maxTokens, maxRetryWaitS } = options;
	const cooldownUntil = new Map();

	async function requestOnce(provider, messages) {
		const headers = { "content-type": "application/json" };
		if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

		let res;
		try {
			res = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					model: provider.model,
					messages,
					temperature,
					max_tokens: maxTokens,
					stream: false
				}),
				signal: AbortSignal.timeout(provider.timeoutMs)
			});
		} catch (err) {
			const reason = err.name === "TimeoutError" ? `timed out after ${provider.timeoutMs}ms` : `unreachable (${err.cause?.code ?? err.message})`;
			throw new ProviderError(provider.name, reason, { cause: err });
		}

		if (!res.ok) {
			const detail = (await res.text().catch(() => "")).slice(0, 300);
			throw new ProviderError(provider.name, `HTTP ${res.status}${detail ? `: ${detail}` : ""}`, {
				status: res.status,
				retryAfterMs: parseRetryAfter(res.headers.get("retry-after"), now())
			});
		}

		let body;
		try {
			body = await res.json();
		} catch (err) {
			throw new ProviderError(provider.name, "invalid JSON response", { status: res.status, cause: err });
		}
		const choice = body?.choices?.[0];
		if (!choice?.message) throw new ProviderError(provider.name, "response has no choices[0].message", { status: res.status });

		// A cut-off or empty reply ends up in the history and the model starts imitating it,
		// so it counts as a failure: the next provider gets a go, without a cooldown.
		const content = typeof choice.message.content === "string" ? choice.message.content : "";
		if (choice.finish_reason === "length") throw new ProviderError(provider.name, "reply truncated (finish_reason=length)", { status: res.status });
		if (!content.trim()) throw new ProviderError(provider.name, "empty reply", { status: res.status });

		return {
			content,
			provider: provider.name,
			model: body.model ?? provider.model,
			usage: body.usage ?? null
		};
	}

	async function tryProvider(provider, messages) {
		try {
			return await requestOnce(provider, messages);
		} catch (err) {
			if (err.status === 429 && err.retryAfterMs != null && err.retryAfterMs <= maxRetryWaitS * 1000) {
				log.warn(`${provider.name} rate limited, retrying in ${err.retryAfterMs}ms`);
				await sleep(err.retryAfterMs);
				return await requestOnce(provider, messages);
			}
			throw err;
		}
	}

	function applyCooldown(provider, err) {
		let ms = 0;
		if (err.status === 429) ms = err.retryAfterMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
		else if (err.status == null) ms = UNREACHABLE_COOLDOWN_MS;
		if (ms > 0) {
			cooldownUntil.set(provider.name, now() + ms);
			log.warn(`${provider.name} on cooldown for ${Math.ceil(ms / 1000)}s`);
		}
	}

	return {
		async chat(messages) {
			const errors = [];
			for (const provider of providers) {
				const until = cooldownUntil.get(provider.name) ?? 0;
				if (until > now()) {
					log.debug(`Skipping ${provider.name}, cooling down for ${Math.ceil((until - now()) / 1000)}s`);
					continue;
				}
				try {
					const result = await tryProvider(provider, messages);
					cooldownUntil.delete(provider.name);
					log.debug(`Answered by ${provider.name} (${result.model})`);
					return result;
				} catch (err) {
					const error = err instanceof ProviderError ? err : new ProviderError(provider.name, err.message, { cause: err });
					log.warn(`Provider failed: ${error.message}`);
					applyCooldown(provider, error);
					errors.push(error);
				}
			}
			throw new AllProvidersFailedError(errors);
		},

		status() {
			return providers.map(p => ({
				name: p.name,
				model: p.model,
				cooldownMs: Math.max(0, (cooldownUntil.get(p.name) ?? 0) - now())
			}));
		}
	};
}
