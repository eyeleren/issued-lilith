import path from "node:path";
import { AuditLogEvent, EmbedBuilder, RESTJSONErrorCodes } from "discord.js";
import { createLogger } from "../logger.js";
import { JsonStore } from "../storage/jsonStore.js";

const log = createLogger("hardban");

const AUDIT_MAX_AGE_MS = 30_000;
const AUDIT_ATTEMPTS = 3;
const AUDIT_RETRY_DELAY_MS = 1000;
const MAX_REASON_LENGTH = 512;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const truncate = (text, max) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

export class HardbanStore {
	#store;

	constructor(dataDir) {
		this.#store = new JsonStore(path.join(dataDir, "hardbans.json"), { guilds: {} }, { debounceMs: 0 });
	}

	get(guildId, userId) {
		return this.#store.data.guilds[guildId]?.[userId] ?? null;
	}

	list(guildId) {
		return Object.entries(this.#store.data.guilds[guildId] ?? {}).map(([userId, entry]) => ({ userId, ...entry }));
	}

	add(guildId, userId, entry) {
		const guild = this.#store.data.guilds[guildId] ??= {};
		const existed = userId in guild;
		guild[userId] = { ...entry, addedAt: new Date().toISOString() };
		this.#store.save();
		return !existed;
	}

	remove(guildId, userId) {
		const guild = this.#store.data.guilds[guildId];
		if (!guild || !(userId in guild)) return false;
		delete guild[userId];
		if (Object.keys(guild).length === 0) delete this.#store.data.guilds[guildId];
		this.#store.save();
		return true;
	}
}

export async function isBanned(guild, userId) {
	try {
		await guild.bans.fetch({ user: userId, force: true });
		return true;
	} catch (err) {
		if (err.code === RESTJSONErrorCodes.UnknownBan) return false;
		throw err;
	}
}

// The audit log entry can land a moment after the gateway event, hence the retries.
async function findUnbanExecutor(guild, userId) {
	for (let attempt = 1; attempt <= AUDIT_ATTEMPTS; attempt++) {
		try {
			const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 10 });
			const entry = logs.entries.find(e => e.targetId === userId && Date.now() - e.createdTimestamp < AUDIT_MAX_AGE_MS);
			if (entry) return entry.executor ?? (entry.executorId ? await guild.client.users.fetch(entry.executorId).catch(() => null) : null);
		} catch (err) {
			if (err.code === RESTJSONErrorCodes.MissingPermissions) {
				log.warn(`Missing View Audit Log permission in ${guild.name}`);
				return null;
			}
			log.warn("Audit log lookup failed:", err.message);
		}
		if (attempt < AUDIT_ATTEMPTS) await sleep(AUDIT_RETRY_DELAY_MS);
	}
	return null;
}

export async function sendModlog(client, channelId, embed) {
	if (!channelId) return;
	try {
		const channel = await client.channels.fetch(channelId);
		if (!channel?.isTextBased()) {
			log.warn(`MODLOG_CHANNEL_ID ${channelId} is not a text channel`);
			return;
		}
		await channel.send({ embeds: [embed] });
	} catch (err) {
		log.warn("Could not write to the mod-log channel:", err.message);
	}
}

export async function handleBanRemove(ban, { hardbans, config }) {
	const { guild, user } = ban;
	const entry = hardbans.get(guild.id, user.id);
	if (!entry) return;

	const executor = await findUnbanExecutor(guild, user.id);
	if (executor?.id === guild.client.user.id) return;

	const who = executor ? `${executor.tag} (${executor.id})` : "sconosciuto";
	const reason = truncate(`Hardban: sban di ${who} annullato. Motivo originale: ${entry.reason || "nessuno"}`, MAX_REASON_LENGTH);

	const embed = new EmbedBuilder()
		.addFields(
			{ name: "Utente", value: `<@${user.id}> \`${user.tag ?? entry.tag ?? user.id}\` (${user.id})` },
			{ name: "Sbannato da", value: executor ? `<@${executor.id}> \`${executor.tag}\`` : "sconosciuto (manca View Audit Log?)" },
			{ name: "Motivo hardban", value: truncate(entry.reason || "nessuno", 1024) }
		)
		.setTimestamp();

	try {
		await guild.bans.create(user.id, { reason });
		log.info(`Re-banned ${user.id} in ${guild.name}, unban by ${who}`);
		embed.setColor(0xc0392b).setTitle("🔨 Hardban: utente ribannato");
	} catch (err) {
		log.error(`Failed to re-ban ${user.id} in ${guild.name}:`, err.message);
		embed.setColor(0xe67e22).setTitle("⚠️ Hardban: re-ban FALLITO")
			.addFields({ name: "Errore", value: truncate(err.message, 1024) });
	}
	await sendModlog(guild.client, config.modlogChannelId, embed);
}
