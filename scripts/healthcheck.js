import fs from "node:fs";
import path from "node:path";

const MAX_AGE_MS = 120_000;
const file = path.resolve(process.env.DATA_DIR || "./data", ".heartbeat");

try {
	const age = Date.now() - fs.statSync(file).mtimeMs;
	if (age > MAX_AGE_MS) {
		console.error(`heartbeat is ${Math.round(age / 1000)}s old`);
		process.exit(1);
	}
} catch (err) {
	console.error(`no heartbeat: ${err.message}`);
	process.exit(1);
}
