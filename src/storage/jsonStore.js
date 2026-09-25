import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createLogger } from "../logger.js";

const log = createLogger("store");
const stores = new Set();

export function flushAllStores() {
	return Promise.allSettled([...stores].map(store => store.flush()));
}

// Temp file + rename, so a crash mid-write never leaves a truncated file.
export class JsonStore {
	#file;
	#debounceMs;
	#timer = null;
	#writing = Promise.resolve();

	constructor(file, defaults = {}, { debounceMs = 1000 } = {}) {
		this.#file = file;
		this.#debounceMs = debounceMs;
		this.data = this.#load(defaults);
		stores.add(this);
	}

	#load(defaults) {
		try {
			return JSON.parse(fs.readFileSync(this.#file, "utf8"));
		} catch (err) {
			if (err.code !== "ENOENT") {
				// Keep the unreadable file around for inspection instead of silently overwriting it.
				const backup = `${this.#file}.corrupt-${Date.now()}`;
				try {
					fs.renameSync(this.#file, backup);
					log.error(`Could not read ${this.#file}, starting empty (old file moved to ${backup}):`, err.message);
				} catch (renameErr) {
					log.error(`Could not read ${this.#file} (${err.message}) nor move it aside (${renameErr.message}), starting empty`);
				}
			}
			return structuredClone(defaults);
		}
	}

	save() {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.flush().catch(err => log.error(`Failed to save ${this.#file}:`, err));
		}, this.#debounceMs);
		this.#timer.unref?.();
	}

	flush() {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		const snapshot = JSON.stringify(this.data, null, "\t");
		this.#writing = this.#writing.catch(() => undefined).then(async () => {
			await fsp.mkdir(path.dirname(this.#file), { recursive: true });
			const tmp = `${this.#file}.tmp`;
			await fsp.writeFile(tmp, snapshot);
			await fsp.rename(tmp, this.#file);
		});
		return this.#writing;
	}
}
