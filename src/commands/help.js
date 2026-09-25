import { MessageFlags, SlashCommandBuilder } from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("help")
		.setDescription("Come usare Lilith"),

	async execute(interaction, { config, commands }) {
		const list = [...commands.values()]
			.map(c => `- \`/${c.data.name}\` · ${c.data.description}`)
			.join("\n");
		const how = config.chat.requiresMention
			? "Menzionami in un canale abilitato, rispondi a un mio messaggio o scrivimi in DM."
			: "Scrivi in un canale abilitato, rispondi a un mio messaggio o scrivimi in DM.";
		await interaction.reply({ content: `${how}\n\n**Comandi**\n${list}`, flags: MessageFlags.Ephemeral });
	}
};
