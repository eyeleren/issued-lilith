import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export const DATA_ENV_FILE = "lilith.env";

// `.env` (local runs) never overrides the environment; <DATA_DIR>/lilith.env overrides everything,
// so on the NAS a /restart is enough to apply a config change. Returns the files that were read.
export function loadEnvFiles({ env = process.env, cwd = process.cwd() } = {}) {
	const loaded = [];

	const dotEnv = read(path.resolve(cwd, ".env"));
	if (dotEnv != null) {
		for (const [key, value] of Object.entries(parseEnv(dotEnv))) env[key] ??= value;
		loaded.push(".env");
	}

	const dataFile = path.resolve(cwd, env.DATA_DIR || "./data", DATA_ENV_FILE);
	const dataEnv = read(dataFile);
	if (dataEnv != null) {
		Object.assign(env, parseEnv(dataEnv));
		loaded.push(dataFile);
	}

	return loaded;
}

function read(file) {
	try {
		return fs.readFileSync(file, "utf8");
	} catch (err) {
		if (err.code === "ENOENT") return null;
		throw err;
	}
}
