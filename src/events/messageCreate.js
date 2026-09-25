import { Events } from "discord.js";

export default {
	name: Events.MessageCreate,

	execute(ctx, message) {
		return ctx.handleMessage(message);
	}
};
