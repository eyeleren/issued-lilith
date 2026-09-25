import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { renderSystemPrompt } from "../llm/prompt.js";
import { splitMessage } from "../util/splitMessage.js";

export default {
	data: new SlashCommandBuilder()
		.setName("system")
		.setDescription("Mostra il system prompt in uso"),

	async execute(interaction, { config }) {
		const prompt = renderSystemPrompt(config.chat.systemPrompt);
		const chunks = splitMessage(prompt ? `System prompt:\n\n${prompt}` : "Nessun system prompt impostato.");
		await interaction.reply({ content: chunks[0], flags: MessageFlags.Ephemeral });
		for (const chunk of chunks.slice(1)) {
			await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
		}
	}
};
