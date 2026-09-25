import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { isBotAdmin } from "../util/permissions.js";

// Non-zero so Docker restarts it under both `unless-stopped` and `on-failure`.
export const RESTART_EXIT_CODE = 75;

export default {
	data: new SlashCommandBuilder()
		.setName("restart")
		.setDescription("Riavvia il bot (solo ADMIN_IDS)"),

	async execute(interaction, { config, shutdown }) {
		if (!isBotAdmin(interaction.user.id, config)) {
			await interaction.reply({ content: "Non hai il permesso di riavviare il bot.", flags: MessageFlags.Ephemeral });
			return;
		}
		await interaction.reply({ content: "Lilith: RESTART in corso…", flags: MessageFlags.Ephemeral });
		await shutdown(`/restart by ${interaction.user.tag}`, RESTART_EXIT_CODE);
	}
};
