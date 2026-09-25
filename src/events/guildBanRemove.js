import { Events } from "discord.js";
import { handleBanRemove } from "../features/hardban.js";

export default {
	name: Events.GuildBanRemove,

	execute(ctx, ban) {
		return handleBanRemove(ban, ctx);
	}
};
