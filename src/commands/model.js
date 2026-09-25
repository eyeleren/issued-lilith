import { MessageFlags, SlashCommandBuilder } from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("model")
		.setDescription("Mostra i provider LLM e i modelli in uso"),

	async execute(interaction, { llm }) {
		const status = llm.status();
		const lines = status.length === 0
			? ["Nessun provider configurato (LLM_PROVIDERS vuoto)."]
			: status.map((p, i) => {
				const state = p.cooldownMs > 0 ? `⏸️ in pausa ${Math.ceil(p.cooldownMs / 1000)}s` : "✅ disponibile";
				return `${i + 1}. **${p.name}** · \`${p.model}\` · ${state}`;
			});
		await interaction.reply({
			content: `Provider in ordine di fallback:\n${lines.join("\n")}`,
			flags: MessageFlags.Ephemeral
		});
	}
};
