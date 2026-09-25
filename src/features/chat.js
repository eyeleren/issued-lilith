import { MessageType } from "discord.js";
import { AllProvidersFailedError } from "../llm/client.js";
import { cleanContent, renderSystemPrompt, stripReasoning } from "../llm/prompt.js";
import { createLogger } from "../logger.js";
import { splitMessage } from "../util/splitMessage.js";

const log = createLogger("chat");

const TYPING_INTERVAL_MS = 8000;
const ATTACHMENT_TIMEOUT_MS = 10_000;
const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|toml|x-sh))/;

// Serialises work per channel so concurrent messages don't interleave history.
const queues = new Map();

function enqueue(key, task) {
	const previous = queues.get(key) ?? Promise.resolve();
	const next = previous.catch(() => undefined).then(task);
	queues.set(key, next);
	next.finally(() => {
		if (queues.get(key) === next) queues.delete(key);
	}).catch(() => undefined);
	return next;
}

function isChatChannel(message, chat) {
	if (!message.guild) return chat.allowDms;
	const channel = message.channel;
	if (chat.channels.includes(channel.id)) return true;
	return channel.isThread?.() === true && chat.channels.includes(channel.parentId);
}

function isAddressedToBot(message, botId, botRoleId, chat) {
	if (!message.guild) return true;
	if (message.mentions.repliedUser?.id === botId) return true;
	if (!chat.requiresMention) return true;
	return message.mentions.users.has(botId) || (botRoleId != null && message.mentions.roles.has(botRoleId));
}

async function readTextAttachments(message, maxBytes) {
	const parts = [];
	let index = 0;
	for (const attachment of message.attachments.values()) {
		if (!TEXT_TYPES.test(attachment.contentType ?? "")) continue;
		index += 1;
		if (attachment.size > maxBytes) {
			parts.push(`\n${index}. File - ${attachment.name}: (omesso, supera ${maxBytes} byte)`);
			continue;
		}
		const res = await fetch(attachment.url, { signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS) });
		if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${attachment.name}`);
		parts.push(`\n${index}. File - ${attachment.name}:\n${await res.text()}`);
	}
	return parts.join("\n");
}

function startTyping(channel) {
	const send = () => channel.sendTyping().catch(err => log.debug("sendTyping failed:", err.message));
	send();
	const timer = setInterval(send, TYPING_INTERVAL_MS);
	return () => clearInterval(timer);
}

async function replyInChunks(message, text) {
	const sent = [];
	for (const [i, chunk] of splitMessage(text, 2000).entries()) {
		sent.push(i === 0
			? await message.reply({ content: chunk, failIfNotExists: false })
			: await message.channel.send({ content: chunk }));
	}
	return sent;
}

export function createChatHandler({ config, llm, conversations }) {
	const { chat } = config;

	async function respond(message, key) {
		const botId = message.client.user.id;
		const botRoleId = message.guild?.members.me?.roles.botRole?.id ?? null;

		let text = cleanContent(message, botId, botRoleId);
		if (message.attachments.size > 0 && chat.attachmentMaxBytes > 0) {
			try {
				text += await readTextAttachments(message, chat.attachmentMaxBytes);
			} catch (err) {
				log.warn("Failed to download attachments:", err.message);
				await message.reply({ content: "Non sono riuscita a scaricare gli allegati.", failIfNotExists: false });
				return;
			}
		}
		text = text.trim();
		if (!text) return;

		const isFirstTurn = conversations.turns(key) === 0;
		let userContent = message.guild ? `${message.member?.displayName ?? message.author.username}: ${text}` : text;
		if (isFirstTurn && chat.initialPrompt) userContent = `${chat.initialPrompt}\n\n${userContent}`;

		const system = renderSystemPrompt(chat.systemPrompt);
		const request = [
			...(system ? [{ role: "system", content: system }] : []),
			...conversations.history(key),
			{ role: "user", content: userContent }
		];

		log.debug(`${message.guild ? `#${message.channel.name}` : "DM"} ${message.author.username}: ${text}`);

		const stopTyping = startTyping(message.channel);
		let answer;
		try {
			answer = await llm.chat(request);
		} catch (err) {
			if (err instanceof AllProvidersFailedError) {
				log.error(err.message);
				await message.reply({ content: config.llm.offlineMessage, failIfNotExists: false });
				return;
			}
			throw err;
		} finally {
			stopTyping();
		}

		const reply = stripReasoning(answer.content) || "(Nessuna risposta)";
		const prefix = isFirstTurn && chat.showStartOfConversation
			? "> Inizio di una nuova conversazione. Usa `/help` per i comandi.\n\n"
			: "";

		const sent = await replyInChunks(message, prefix + reply);
		conversations.append(key, userContent, reply, sent.map(m => m.id));
		log.debug(`Replied via ${answer.provider} (${answer.model}), ${reply.length} chars`);
	}

	return async function handleMessage(message) {
		if (message.author.bot || message.system) return;
		if (message.type !== MessageType.Default && message.type !== MessageType.Reply) return;
		if (!isChatChannel(message, chat)) return;
		if (!message.content && message.attachments.size === 0) return;

		const botId = message.client.user.id;
		const botRoleId = message.guild?.members.me?.roles.botRole?.id ?? null;
		if (!isAddressedToBot(message, botId, botRoleId, chat)) return;

		const key = message.channel.id;
		try {
			await enqueue(key, () => respond(message, key));
		} catch (err) {
			log.error("Failed to handle message:", err);
			await message.reply({ content: "Si è verificato un errore, controlla i log.", failIfNotExists: false })
				.catch(() => undefined);
		}
	};
}
