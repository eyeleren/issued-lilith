import fs from "node:fs";
import path from "node:path";
import { Routes } from "discord.js";
import { createLogger } from "../logger.js";

const log = createLogger("updater");

// Pulling the image on the NAS can take a while; Watchtower answers only when it is done.
const UPDATE_TIMEOUT_MS = 10 * 60_000;
// Interaction tokens last 15 minutes: past that the original reply can no longer be edited.
const TOKEN_TTL_MS = 14 * 60_000;
const PENDING_FILE = "update-pending.json";

export class UpdateError extends Error {
	constructor(message, { status = null } = {}) {
		super(message);
		this.name = "UpdateError";
		this.status = status;
	}
}

// If a new image exists Watchtower replaces this container before answering, so the process
// dies here and announceUpdate() finishes the job on the next boot. Returns only when nothing changed.
export async function requestUpdate({ url, token }, { fetchImpl = globalThis.fetch } = {}) {
	let res;
	try {
		res = await fetchImpl(`${url}/v1/update`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS)
		});
	} catch (err) {
		throw new UpdateError(err.name === "TimeoutError" ? "Watchtower timed out" : `Watchtower unreachable (${err.cause?.code ?? err.message})`);
	}
	if (res.status === 429) throw new UpdateError("update already in progress", { status: 429 });
	if (!res.ok) throw new UpdateError(`Watchtower answered HTTP ${res.status}`, { status: res.status });

	const body = await res.json().catch(() => ({}));
	return body.summary ?? {};
}

export function savePendingUpdate(dataDir, pending) {
	fs.writeFileSync(path.join(dataDir, PENDING_FILE), JSON.stringify(pending));
}

export function clearPendingUpdate(dataDir) {
	fs.rmSync(path.join(dataDir, PENDING_FILE), { force: true });
}

export async function announceUpdate({ config, version }, client, now = Date.now()) {
	const file = path.join(config.dataDir, PENDING_FILE);
	let pending;
	try {
		pending = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (err) {
		if (err.code !== "ENOENT") log.warn("Unreadable pending update:", err.message);
		return;
	} finally {
		fs.rmSync(file, { force: true });
	}

	const content = pending.from === version
		? `Lilith: riavviata, ma la versione è sempre la v${version}.`
		: `Lilith: aggiornata dalla v${pending.from} alla v${version} 😈`;
	log.info(content);
	if (now - pending.at > TOKEN_TTL_MS) return;

	try {
		await client.rest.patch(Routes.webhookMessage(pending.appId, pending.token), { body: { content }, auth: false });
	} catch (err) {
		log.warn("Could not edit the /update reply:", err.message);
	}
}
