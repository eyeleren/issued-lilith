import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { isGuildAdmin } from "../util/permissions.js";

export default {
	enabled: config => config.dailyPurge.channels.length > 0,

	data: new SlashCommandBuilder()
		.setName("purge")
		.setDescription("Svuota subito questo canale come la pulizia giornaliera (solo admin)")
		.setContexts(InteractionContextType.Guild),

	async execute(interaction, { config, dailyPurge }) {
		if (!isGuildAdmin(interaction, config)) {
			await interaction.reply({ content: "Solo gli admin possono svuotare il canale.", flags: MessageFlags.Ephemeral });
			return;
		}
		if (!config.dailyPurge.channels.includes(interaction.channelId)) {
			await interaction.reply({ content: "Questo canale non è tra quelli con la pulizia giornaliera (`DAILY_PURGE_CHANNELS`).", flags: MessageFlags.Ephemeral });
			return;
		}
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const deleted = await dailyPurge.runChannel(interaction.channelId);
		await interaction.editReply(`Canale svuotato: ${deleted} messaggi eliminati, messaggi fissati conservati.`);
	}
};
