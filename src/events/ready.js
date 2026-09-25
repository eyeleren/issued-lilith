import { ActivityType, Events } from "discord.js";
import { announceUpdate } from "../features/updater.js";
import { registerCommands } from "../registerCommands.js";

async function sendGreeting(client, { channelId, commanderRoleId, message }, log) {
	if (!channelId) return;
	try {
		const channel = await client.channels.fetch(channelId);
		if (!channel?.isSendable()) {
			log.warn(`GREETING_CHANNEL_ID ${channelId} is not a channel I can write in`);
			return;
		}
		const content = message.replaceAll("{role}", commanderRoleId ? `<@&${commanderRoleId}>` : "").trim();
		await channel.send({
			content,
			allowedMentions: { roles: commanderRoleId ? [commanderRoleId] : [] }
		});
	} catch (err) {
		log.warn("Could not send greeting:", err.message);
	}
}

export default {
	name: Events.ClientReady,
	once: true,

	async execute(ctx, client) {
		const { config, commands, log } = ctx;
		log.info(`Logged in as ${client.user.tag}, in ${client.guilds.cache.size} guild(s)`);

		if (config.presence.activityMessage) {
			client.user.setPresence({
				status: "online",
				activities: [{ name: config.presence.activityMessage, type: ActivityType.Custom }]
			});
		}

		try {
			await registerCommands(client, commands, { dataDir: config.dataDir, guildId: config.discord.guildId });
		} catch (err) {
			log.error("Slash command registration failed:", err);
		}

		await sendGreeting(client, config.greeting, log);
		await announceUpdate(ctx, client);

		await ctx.dailyPurge.start().catch(err => log.error("Daily purge setup failed:", err));
	}
};
