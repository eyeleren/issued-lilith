import { MessageFlags, SlashCommandBuilder } from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("reset")
		.setDescription("Cancella la conversazione con Lilith in questo canale"),

	async execute(interaction, { conversations }) {
		const cleared = conversations.clear(interaction.channelId);
		await interaction.reply({
			content: cleared > 0 ? `Conversazione cancellata (${cleared} messaggi).` : "Nessun messaggio da cancellare.",
			flags: MessageFlags.Ephemeral
		});
	}
};
