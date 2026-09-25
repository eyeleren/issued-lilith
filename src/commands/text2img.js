import { AttachmentBuilder, SlashCommandBuilder } from "discord.js";
import { createLogger } from "../logger.js";

const log = createLogger("text2img");
const MAX_ATTACHMENTS = 10;

async function txt2img(urls, timeoutMs, payload) {
	const errors = [];
	for (const base of urls) {
		try {
			const res = await fetch(`${base}/sdapi/v1/txt2img`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = await res.json();
			if (!Array.isArray(body.images)) throw new Error("response has no images");
			return body.images;
		} catch (err) {
			log.warn(`${base} failed:`, err.message);
			errors.push(`${base}: ${err.message}`);
		}
	}
	throw new Error(errors.join("; "));
}

export default {
	enabled: config => config.stableDiffusion.urls.length > 0,

	data: new SlashCommandBuilder()
		.setName("text2img")
		.setDescription("Genera immagini con Stable Diffusion")
		.addStringOption(o => o.setName("prompt").setDescription("Cosa disegnare").setRequired(true).setMaxLength(1000))
		.addStringOption(o => o.setName("negative_prompt").setDescription("Cosa evitare").setMaxLength(1000))
		.addIntegerOption(o => o.setName("width").setDescription("Larghezza").setMinValue(128).setMaxValue(1024))
		.addIntegerOption(o => o.setName("height").setDescription("Altezza").setMinValue(128).setMaxValue(1024))
		.addIntegerOption(o => o.setName("steps").setDescription("Passi").setMinValue(5).setMaxValue(50))
		.addIntegerOption(o => o.setName("batch_count").setDescription("Numero di batch").setMinValue(1).setMaxValue(4))
		.addIntegerOption(o => o.setName("batch_size").setDescription("Immagini per batch").setMinValue(1).setMaxValue(4)),

	async execute(interaction, { config }) {
		const { options } = interaction;
		const prompt = options.getString("prompt", true);
		const steps = options.getInteger("steps") ?? 20;

		await interaction.deferReply();
		try {
			const images = await txt2img(config.stableDiffusion.urls, config.stableDiffusion.timeoutMs, {
				prompt,
				negative_prompt: options.getString("negative_prompt") ?? "",
				width: options.getInteger("width") ?? 512,
				height: options.getInteger("height") ?? 512,
				steps,
				n_iter: options.getInteger("batch_count") ?? 1,
				batch_size: options.getInteger("batch_size") ?? 1
			});
			const files = images.slice(0, MAX_ATTACHMENTS)
				.map((b64, i) => new AttachmentBuilder(Buffer.from(b64, "base64"), { name: `lilith-${i + 1}.png` }));
			await interaction.editReply({ content: `Prompt: \`${prompt.replaceAll("`", "'")}\``, files });
		} catch (err) {
			log.error("Generation failed:", err.message);
			await interaction.editReply("Stable Diffusion non è raggiungibile al momento.");
		}
	}
};
