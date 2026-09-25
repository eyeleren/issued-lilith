import crypto from "node:crypto";
import path from "node:path";
import { Routes } from "discord.js";
import { createLogger } from "./logger.js";
import { JsonStore } from "./storage/jsonStore.js";

const log = createLogger("commands");

// Skips the PUT unless commands, scope or app changed. Delete <dataDir>/commands-state.json to force it.
export async function registerCommands(client, commands, { dataDir, guildId }) {
	const body = [...commands.values()].map(c => c.data.toJSON());
	const hash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
	const appId = client.application.id;
	const scope = guildId ? `guild:${guildId}` : "global";

	const state = new JsonStore(path.join(dataDir, "commands-state.json"), {}, { debounceMs: 0 });
	const previous = state.data;
	if (previous.appId === appId && previous.scope === scope && previous.hash === hash) {
		log.info(`Slash commands up to date (${scope}, ${body.length} commands), skipping sync`);
		return;
	}

	const route = guildId ? Routes.applicationGuildCommands(appId, guildId) : Routes.applicationCommands(appId);
	await client.rest.put(route, { body });
	log.info(`Registered ${body.length} slash commands (${scope}): ${body.map(c => c.name).join(", ")}`);

	// Switching scope would leave the old set behind and show every command twice.
	if (previous.appId === appId && previous.scope && previous.scope !== scope) {
		const oldRoute = previous.scope === "global"
			? Routes.applicationCommands(appId)
			: Routes.applicationGuildCommands(appId, previous.scope.slice("guild:".length));
		try {
			await client.rest.put(oldRoute, { body: [] });
			log.info(`Cleared commands from previous scope ${previous.scope}`);
		} catch (err) {
			log.warn(`Could not clear commands from ${previous.scope}:`, err.message);
		}
	}

	state.data = { appId, scope, hash, syncedAt: new Date().toISOString() };
	await state.flush();
}
