import { EmbedBuilder, InteractionContextType, MessageFlags, RESTJSONErrorCodes, SlashCommandBuilder } from "discord.js";
import { isBanned, sendModlog } from "../features/hardban.js";
import { createLogger } from "../logger.js";
import { isGuildAdmin } from "../util/permissions.js";

const log = createLogger("hardban");
const SNOWFLAKE = /^\d{17,20}$/;
const LIST_PAGE_SIZE = 20;

const addTarget = sub => sub
	.addUserOption(o => o.setName("utente").setDescription("Utente (anche fuori dal server)"))
	.addStringOption(o => o.setName("id").setDescription("ID utente, se non riesci a selezionarlo"));

function targetId(interaction) {
	const user = interaction.options.getUser("utente");
	if (user) return user.id;
	const raw = interaction.options.getString("id")?.replace(/[<@!>]/g, "").trim();
	return raw && SNOWFLAKE.test(raw) ? raw : null;
}

async function resolveTag(client, userId) {
	const user = await client.users.fetch(userId).catch(() => null);
	return user?.tag ?? null;
}

async function add(interaction, { hardbans, config }) {
	const { guild, client } = interaction;
	const userId = targetId(interaction);
	if (!userId) return interaction.editReply("Specifica un `utente` oppure un `id` valido.");
	if (userId === client.user.id || userId === interaction.user.id) return interaction.editReply("Non puoi hardbannare te stesso o il bot.");

	const reason = interaction.options.getString("motivo") ?? "";
	const tag = await resolveTag(client, userId);
	const isNew = hardbans.add(guild.id, userId, { tag, reason, addedBy: interaction.user.id });

	let banNote;
	try {
		if (await isBanned(guild, userId)) {
			banNote = "era già bannato";
		} else {
			await guild.bans.create(userId, { reason: `Hardban da ${interaction.user.tag}: ${reason || "nessun motivo"}`.slice(0, 512) });
			banNote = "bannato ora";
		}
	} catch (err) {
		log.warn(`Ban of ${userId} failed:`, err.message);
		banNote = err.code === RESTJSONErrorCodes.MissingPermissions
			? "**ban fallito**: mancano i permessi (Ban Members o ruolo del bot troppo in basso)"
			: `**ban fallito**: ${err.message}`;
	}

	await sendModlog(client, config.modlogChannelId, new EmbedBuilder()
		.setColor(0x8e44ad)
		.setTitle(isNew ? "➕ Hardban aggiunto" : "✏️ Hardban aggiornato")
		.addFields(
			{ name: "Utente", value: `<@${userId}> ${tag ? `\`${tag}\` ` : ""}(${userId})` },
			{ name: "Da", value: `<@${interaction.user.id}>` },
			{ name: "Motivo", value: reason || "nessuno" }
		)
		.setTimestamp());

	return interaction.editReply(`${isNew ? "Aggiunto" : "Aggiornato"} hardban per <@${userId}> (${userId}), ${banNote}.`);
}

async function remove(interaction, { hardbans, config }) {
	const userId = targetId(interaction);
	if (!userId) return interaction.editReply("Specifica un `utente` oppure un `id` valido.");
	if (!hardbans.remove(interaction.guild.id, userId)) {
		return interaction.editReply(`<@${userId}> non è nella lista hardban.`);
	}
	await sendModlog(interaction.client, config.modlogChannelId, new EmbedBuilder()
		.setColor(0x7f8c8d)
		.setTitle("➖ Hardban rimosso")
		.addFields(
			{ name: "Utente", value: `<@${userId}> (${userId})` },
			{ name: "Da", value: `<@${interaction.user.id}>` }
		)
		.setTimestamp());
	return interaction.editReply(`Rimosso <@${userId}> dalla lista hardban. Il ban attuale resta: sbannalo a mano se serve.`);
}

async function list(interaction, { hardbans }) {
	const entries = hardbans.list(interaction.guild.id);
	if (entries.length === 0) return interaction.editReply("La lista hardban è vuota.");

	const lines = entries.map(e => {
		const date = e.addedAt ? `<t:${Math.floor(Date.parse(e.addedAt) / 1000)}:d>` : "";
		return `- <@${e.userId}> ${e.tag ? `\`${e.tag}\` ` : ""}(${e.userId}) ${date}${e.reason ? ` · ${e.reason.slice(0, 80)}` : ""}`;
	});
	const pages = [];
	for (let i = 0; i < lines.length; i += LIST_PAGE_SIZE) pages.push(lines.slice(i, i + LIST_PAGE_SIZE));

	const embeds = pages.slice(0, 10).map((page, i) => new EmbedBuilder()
		.setColor(0x8e44ad)
		.setTitle(i === 0 ? `Hardban (${entries.length})` : null)
		.setDescription(page.join("\n")));
	return interaction.editReply({ embeds });
}

export default {
	data: new SlashCommandBuilder()
		.setName("hardban")
		.setDescription("Ban permanenti: chi li sbanna viene annullato")
		.setContexts(InteractionContextType.Guild)
		.addSubcommand(sub => addTarget(sub.setName("add").setDescription("Aggiungi un utente alla lista hardban (e bannalo)"))
			.addStringOption(o => o.setName("motivo").setDescription("Motivo").setMaxLength(400)))
		.addSubcommand(sub => addTarget(sub.setName("remove").setDescription("Togli un utente dalla lista hardban")))
		.addSubcommand(sub => sub.setName("list").setDescription("Mostra la lista hardban")),

	async execute(interaction, ctx) {
		if (!interaction.inGuild() || !interaction.guild) {
			await interaction.reply({ content: "Questo comando funziona solo in un server.", flags: MessageFlags.Ephemeral });
			return;
		}
		if (!isGuildAdmin(interaction, ctx.config)) {
			await interaction.reply({ content: "Solo gli admin possono gestire gli hardban.", flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const handlers = { add, remove, list };
		await handlers[interaction.options.getSubcommand()](interaction, ctx);
	}
};
