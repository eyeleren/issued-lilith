import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { announceUpdate, requestUpdate, savePendingUpdate } from "../src/features/updater.js";
import { setLogLevel } from "../src/logger.js";

setLogLevel("silent");

const watchtower = { url: "http://watchtower:8080", token: "secret" };

test("requestUpdate posts to Watchtower with the token and returns the summary", async () => {
	let call;
	const fetchImpl = async (url, init) => {
		call = { url, init };
		return Response.json({ summary: { scanned: 1, updated: 0, failed: 0 } });
	};
	assert.deepEqual(await requestUpdate(watchtower, { fetchImpl }), { scanned: 1, updated: 0, failed: 0 });
	assert.equal(call.url, "http://watchtower:8080/v1/update");
	assert.equal(call.init.method, "POST");
	assert.equal(call.init.headers.authorization, "Bearer secret");
});

test("requestUpdate reports busy, HTTP and network errors", async () => {
	await assert.rejects(requestUpdate(watchtower, { fetchImpl: async () => new Response("", { status: 429 }) }), { status: 429 });
	await assert.rejects(requestUpdate(watchtower, { fetchImpl: async () => new Response("", { status: 401 }) }), /HTTP 401/);
	await assert.rejects(requestUpdate(watchtower, { fetchImpl: async () => { throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }); } }), /unreachable \(ENOTFOUND\)/);
});

function fakeClient() {
	const patches = [];
	return { patches, rest: { patch: async (route, options) => patches.push({ route, content: options.body.content }) } };
}

test("announceUpdate edits the /update reply once, after the new version boots", async () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lilith-upd-"));
	savePendingUpdate(dataDir, { appId: "1", token: "tok", from: "2.9.0", at: 1000 });
	const client = fakeClient();

	await announceUpdate({ config: { dataDir }, version: "2.10.0" }, client, 2000);
	await announceUpdate({ config: { dataDir }, version: "2.10.0" }, client, 3000);

	assert.deepEqual(client.patches, [{ route: "/webhooks/1/tok/messages/@original", content: "Lilith: aggiornata dalla v2.9.0 alla v2.10.0 😈" }]);
	assert.ok(!fs.existsSync(path.join(dataDir, "update-pending.json")));
});

test("announceUpdate skips expired interaction tokens", async () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lilith-upd-"));
	savePendingUpdate(dataDir, { appId: "1", token: "tok", from: "2.9.0", at: 0 });
	const client = fakeClient();
	await announceUpdate({ config: { dataDir }, version: "2.10.0" }, client, 20 * 60_000);
	assert.equal(client.patches.length, 0);
});
