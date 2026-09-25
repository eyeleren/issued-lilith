import path from "node:path";
import { JsonStore } from "../storage/jsonStore.js";

export class Conversations {
	#store;
	#maxMessages;

	constructor(dataDir, maxMessages) {
		this.#store = new JsonStore(path.join(dataDir, "conversations.json"), { channels: {} });
		this.#maxMessages = maxMessages;
	}

	#channel(key) {
		return this.#store.data.channels[key];
	}

	history(key) {
		return (this.#channel(key)?.messages ?? []).map(({ role, content }) => ({ role, content }));
	}

	turns(key) {
		return this.#channel(key)?.turns ?? 0;
	}

	append(key, userContent, assistantContent, replyIds) {
		const channel = this.#store.data.channels[key] ??= { messages: [], turns: 0 };
		channel.messages.push(
			{ role: "user", content: userContent },
			{ role: "assistant", content: assistantContent, ids: replyIds }
		);
		channel.turns += 1;
		channel.updatedAt = new Date().toISOString();

		if (channel.messages.length > this.#maxMessages) {
			channel.messages = channel.messages.slice(-this.#maxMessages);
			// A conversation sent to the model should start with a user turn.
			while (channel.messages.length > 0 && channel.messages[0].role !== "user") channel.messages.shift();
		}
		this.#store.save();
	}

	clear(key) {
		const count = this.#channel(key)?.messages.length ?? 0;
		delete this.#store.data.channels[key];
		this.#store.save();
		return count;
	}
}
