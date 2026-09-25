import { PermissionFlagsBits } from "discord.js";

export function isBotAdmin(userId, config) {
	return config.admins.includes(userId);
}

export function isGuildAdmin(interaction, config) {
	return isBotAdmin(interaction.user.id, config)
		|| interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
}
