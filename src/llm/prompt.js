// Rendered per request so <date> never goes stale in a long-running container.
export function renderSystemPrompt(template, now = new Date()) {
	return template ? template.replace(/<date>/gi, now.toUTCString()) : "";
}

// Uses only message.mentions and the channel cache: no member fetch, no GuildMembers intent.
export function cleanContent(message, botUserId, botRoleId = null) {
	const mentions = message.mentions;
	const guild = message.guild;

	let content = message.content.replace(new RegExp(`<@!?${botUserId}>`, "g"), "");
	if (botRoleId) content = content.replaceAll(`<@&${botRoleId}>`, "");

	return content
		.replace(/<@!?(\d+)>/g, (_, id) => {
			const member = mentions?.members?.get(id);
			const user = mentions?.users?.get(id);
			const name = member?.displayName ?? user?.globalName ?? user?.username;
			return name ? `@${name}` : "@utente-sconosciuto";
		})
		.replace(/<@&(\d+)>/g, (_, id) => {
			const role = mentions?.roles?.get(id) ?? guild?.roles.cache.get(id);
			return role ? `@${role.name}` : "@ruolo-sconosciuto";
		})
		.replace(/<#(\d+)>/g, (_, id) => {
			const channel = guild?.channels.cache.get(id) ?? message.client.channels.cache.get(id);
			return channel?.name ? `#${channel.name}` : "#canale-sconosciuto";
		})
		.replace(/<a?:(\w+):\d+>/g, (_, name) => `:${name}:`)
		.trim();
}

export function stripReasoning(text) {
	return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
