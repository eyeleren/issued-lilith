import path from "node:path";
import { createLogger } from "../logger.js";
import { JsonStore } from "../storage/jsonStore.js";

const log = createLogger("purge");

const BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60_000;
const PAGE_SIZE = 100;

/** Next occurrence of hour:minute in the process time zone (TZ), strictly after `now`. */
export function nextRunAt({ hour, minute }, now = new Date()) {
	const next = new Date(now);
	next.setHours(hour, minute, 0, 0);
	if (next <= now) next.setDate(next.getDate() + 1);
	return next;
}

export function previousRunAt({ hour, minute }, now = new Date()) {
	const prev = new Date(now);
	prev.setHours(hour, minute, 0, 0);
	if (prev > now) prev.setDate(prev.getDate() - 1);
	return prev;
}

async function pinnedIds(channel) {
	const ids = new Set();
	let before;
	for (;;) {
		const page = await channel.messages.fetchPins({ before, limit: 50, cache: false });
		for (const pin of page.items) ids.add(pin.message.id);
		if (!page.hasMore || page.items.length === 0) break;
		before = page.items.at(-1).pinnedTimestamp;
	}
	return ids;
}

export async function purgeChannel(channel) {
	const keep = await pinnedIds(channel);

	let deleted = 0;
	let before;
	for (;;) {
		const page = await channel.messages.fetch({ limit: PAGE_SIZE, before, cache: false });
		if (page.size === 0) break;
		before = page.last().id;

		const targets = [...page.values()].filter(m => !keep.has(m.id));
		const recent = targets.filter(m => Date.now() - m.createdTimestamp < BULK_MAX_AGE_MS);
		const old = targets.filter(m => !recent.includes(m));

		if (recent.length > 0) {
			await channel.bulkDelete(recent.map(m => m.id));
			deleted += recent.length;
		}
		// Discord only bulk-deletes messages younger than 14 days; older ones go one by one.
		for (const message of old) {
			await message.delete().catch(err => log.warn(`Could not delete ${message.id}:`, err.message));
			deleted += 1;
		}
		if (page.size < PAGE_SIZE) break;
	}
	return deleted;
}

export function createDailyPurge({ client, config, conversations }) {
	const { channels, time } = config.dailyPurge;
	const state = new JsonStore(path.join(config.dataDir, "purge-state.json"), { lastRunAt: null }, { debounceMs: 0 });
	let timer = null;

	async function runChannel(channelId) {
		const channel = await client.channels.fetch(channelId);
		if (!channel?.isTextBased() || !channel.messages) throw new Error(`${channelId} is not a text channel`);
		const deleted = await purgeChannel(channel);
		conversations.clear(channelId);
		log.info(`#${channel.name}: deleted ${deleted} messages, conversation reset`);
		return deleted;
	}

	async function runAll(reason) {
		log.info(`Daily purge started (${reason})`);
		for (const channelId of channels) {
			try {
				await runChannel(channelId);
			} catch (err) {
				log.error(`Purge of ${channelId} failed:`, err.message);
			}
		}
		state.data.lastRunAt = new Date().toISOString();
		await state.flush();
	}

	function schedule() {
		const at = nextRunAt(time);
		log.info(`Next daily purge: ${at.toString()}`);
		timer = setTimeout(async () => {
			await runAll("scheduled");
			schedule();
		}, at.getTime() - Date.now());
		timer.unref?.();
	}

	return {
		runChannel,

		async start() {
			if (channels.length === 0) return;
			// Catch up if the bot was down at the scheduled time.
			const last = state.data.lastRunAt ? new Date(state.data.lastRunAt) : null;
			if (!last) {
				state.data.lastRunAt = new Date().toISOString();
				await state.flush();
			} else if (last < previousRunAt(time)) {
				await runAll("missed while offline");
			}
			schedule();
		},

		stop() {
			if (timer) clearTimeout(timer);
		}
	};
}
