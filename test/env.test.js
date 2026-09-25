import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadEnvFiles } from "../src/env.js";

function tempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "lilith-env-"));
}

test("data-dir lilith.env overrides the environment, .env does not", () => {
	const cwd = tempDir();
	fs.writeFileSync(path.join(cwd, ".env"), "A=dotenv\nB=dotenv\nDATA_DIR=./store\n");
	fs.mkdirSync(path.join(cwd, "store"));
	fs.writeFileSync(path.join(cwd, "store", "lilith.env"), "B=data\nC=\"con spazi\"\n");
	const env = { A: "compose", B: "compose" };

	const loaded = loadEnvFiles({ env, cwd });

	assert.deepEqual(env, { A: "compose", B: "data", C: "con spazi", DATA_DIR: "./store" });
	assert.deepEqual(loaded, [".env", path.join(cwd, "store", "lilith.env")]);
});

test("missing files are fine", () => {
	const env = { DATA_DIR: "/nope" };
	assert.deepEqual(loadEnvFiles({ env, cwd: tempDir() }), []);
	assert.deepEqual(env, { DATA_DIR: "/nope" });
});
