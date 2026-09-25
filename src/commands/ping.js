import { MessageFlags, SlashCommandBuilder } from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("ping")
		.setDescription("Latenza del bot"),

	async execute(interaction, { version }) {
		const response = await interaction.reply({ content: "Ping…", flags: MessageFlags.Ephemeral, withResponse: true });
		const roundtrip = response.resource.message.createdTimestamp - interaction.createdTimestamp;
		const ws = interaction.client.ws.ping;
		await interaction.editReply(`Pong! Roundtrip: ${roundtrip}ms · Gateway: ${ws >= 0 ? `${ws}ms` : "n/d"} · v${version}`);
	}
};
