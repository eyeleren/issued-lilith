import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { clearPendingUpdate, requestUpdate, savePendingUpdate } from "../features/updater.js";
import { isBotAdmin } from "../util/permissions.js";

export default {
	data: new SlashCommandBuilder()
		.setName("update")
		.setDescription("Scarica l'ultima versione e riavvia il bot (solo ADMIN_IDS)"),

	enabled: config => config.watchtower != null,

	async execute(interaction, { config, version, log }) {
		if (!isBotAdmin(interaction.user.id, config)) {
			await interaction.reply({ content: "Non hai il permesso di aggiornare il bot.", flags: MessageFlags.Ephemeral });
			return;
		}
		await interaction.reply({ content: `Lilith: cerco aggiornamenti (ora v${version})…`, flags: MessageFlags.Ephemeral });
		log.info(`/update by ${interaction.user.tag}`);

		savePendingUpdate(config.dataDir, { appId: interaction.applicationId, token: interaction.token, from: version, at: Date.now() });
		let summary;
		try {
			summary = await requestUpdate(config.watchtower);
		} catch (err) {
			clearPendingUpdate(config.dataDir);
			log.warn("/update failed:", err.message);
			await interaction.editReply(err.status === 429
				? "Un aggiornamento è già in corso, riprova tra poco."
				: `Aggiornamento non riuscito: ${err.message}.`);
			return;
		}

		// Still running: Watchtower found nothing to replace, or failed to.
		clearPendingUpdate(config.dataDir);
		await interaction.editReply(summary.failed > 0
			? "Aggiornamento non riuscito, controlla i log di Watchtower."
			: `Nessun aggiornamento: sono già all'ultima versione (v${version}).`);
	}
};
