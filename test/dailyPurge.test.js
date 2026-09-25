import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRunAt, previousRunAt, purgeChannel } from "../src/features/dailyPurge.js";
import { setLogLevel } from "../src/logger.js";

setLogLevel("silent");
process.env.TZ = "Europe/Rome";

const at = iso => new Date(iso);

test("next and previous run follow Europe/Rome local time, DST included", () => {
	const time = { hour: 5, minute: 0 };
	assert.equal(nextRunAt(time, at("2026-09-25T02:00:00Z")).toISOString(), "2026-09-25T03:00:00.000Z");
	assert.equal(nextRunAt(time, at("2026-09-25T03:00:00Z")).toISOString(), "2026-09-26T03:00:00.000Z");
	assert.equal(nextRunAt(time, at("2026-10-24T12:00:00Z")).toISOString(), "2026-10-25T04:00:00.000Z");
	assert.equal(previousRunAt(time, at("2026-09-25T02:00:00Z")).toISOString(), "2026-09-24T03:00:00.000Z");
});

function fakeChannel(messages, pinned = []) {
	const store = new Map(messages.map(m => [m.id, m]));
	const deleted = [];
	const col = list => {
		const map = new Map(list.map(m => [m.id, m]));
		map.first = () => list[0];
		map.last = () => list.at(-1);
		return map;
	};
	return {
		deleted,
		messages: {
			fetchPins: async () => ({ items: pinned.map(id => ({ message: { id }, pinnedTimestamp: 1 })), hasMore: false }),
			fetch: async ({ after, before, limit }) => {
				const sorted = [...store.values()].sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
				const from = before ? sorted.filter(m => BigInt(m.id) < BigInt(before)) : sorted;
				return col(from.slice(0, limit));
			}
		},
		bulkDelete: async ids => ids.forEach(id => { deleted.push(id); store.delete(id); }),
		oldDelete: id => { deleted.push(id); store.delete(id); }
	};
}

test("purge keeps pinned messages only, including the first one if pinned", async () => {
	const now = Date.now();
	const msgs = Array.from({ length: 250 }, (_, i) => ({ id: String(1000 + i), createdTimestamp: now - 1000 }));
	const channel = fakeChannel(msgs, ["1000", "1100"]);
	const count = await purgeChannel(channel);
	assert.equal(count, 248);
	assert.ok(!channel.deleted.includes("1000"), "pinned first message kept");
	assert.ok(!channel.deleted.includes("1100"), "pinned message kept");
});

test("unpinned first message is deleted too", async () => {
	const now = Date.now();
	const channel = fakeChannel([{ id: "3000", createdTimestamp: now }, { id: "3001", createdTimestamp: now }]);
	assert.equal(await purgeChannel(channel), 2);
	assert.deepEqual(channel.deleted.sort(), ["3000", "3001"]);
});

test("messages older than 14 days are deleted one by one", async () => {
	const now = Date.now();
	const oldest = { id: "2000", createdTimestamp: now - 30 * 86_400_000 };
	const old = { id: "2001", createdTimestamp: now - 20 * 86_400_000 };
	const channel = fakeChannel([oldest, old, { id: "2002", createdTimestamp: now }]);
	for (const m of [oldest, old]) m.delete = async () => channel.oldDelete(m.id);
	const count = await purgeChannel(channel);
	assert.equal(count, 3);
	assert.deepEqual(channel.deleted.sort(), ["2000", "2001", "2002"]);
});
