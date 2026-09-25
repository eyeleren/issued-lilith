import { Events, MessageFlags } from "discord.js";

export default {
	name: Events.InteractionCreate,

	async execute(ctx, interaction) {
		if (!interaction.isChatInputCommand()) return;
		const command = ctx.commands.get(interaction.commandName);
		if (!command) {
			ctx.log.warn(`Unknown command /${interaction.commandName} (stale registration?)`);
			return;
		}

		try {
			await command.execute(interaction, ctx);
		} catch (err) {
			ctx.log.error(`/${interaction.commandName} failed:`, err);
			const reply = { content: "Si è verificato un errore, controlla i log.", flags: MessageFlags.Ephemeral };
			const send = interaction.deferred || interaction.replied
				? interaction.followUp(reply)
				: interaction.reply(reply);
			await send.catch(() => undefined);
		}
	}
};
