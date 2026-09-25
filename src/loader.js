import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcDir = path.dirname(fileURLToPath(import.meta.url));

async function importDir(dir) {
	const files = (await fs.readdir(path.join(srcDir, dir))).filter(f => f.endsWith(".js")).sort();
	const modules = [];
	for (const file of files) {
		const mod = await import(pathToFileURL(path.join(srcDir, dir, file)).href);
		if (!mod.default) throw new Error(`${dir}/${file} has no default export`);
		modules.push({ file, module: mod.default });
	}
	return modules;
}

export async function loadCommands(config) {
	const commands = new Map();
	for (const { file, module: command } of await importDir("commands")) {
		if (!command.data || typeof command.execute !== "function") {
			throw new Error(`commands/${file} must export { data, execute }`);
		}
		if (command.enabled && !command.enabled(config)) continue;
		commands.set(command.data.name, command);
	}
	return commands;
}

export async function loadEvents(client, ctx) {
	const names = [];
	for (const { file, module: event } of await importDir("events")) {
		if (!event.name || typeof event.execute !== "function") {
			throw new Error(`events/${file} must export { name, execute }`);
		}
		const listener = (...args) => {
			Promise.resolve(event.execute(ctx, ...args)).catch(err => ctx.log.error(`Unhandled error in ${event.name}:`, err));
		};
		if (event.once) client.once(event.name, listener);
		else client.on(event.name, listener);
		names.push(event.name);
	}
	return names;
}
