const CLOSE_FENCE = "\n```";
const FENCE_LINE = /^ *```(.*)$/gm;

function findCut(text, limit) {
	const newline = text.lastIndexOf("\n", limit);
	if (newline > limit / 2) return newline;
	const space = text.lastIndexOf(" ", limit);
	if (space > 0) return space;
	if (newline > 0) return newline;
	const code = text.charCodeAt(limit - 1);
	return code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit;
}

function openFenceAfter(text, initial) {
	let open = initial;
	for (const match of text.matchAll(FENCE_LINE)) {
		open = open ? null : `\`\`\`${match[1].trim()}`;
	}
	return open;
}

export function splitMessage(text, max = 2000) {
	if (max < 20) throw new RangeError("max must be at least 20");
	const chunks = [];
	let rest = text.replace(/\r\n?/g, "\n").trim();
	let fence = null;

	while (rest.length > 0) {
		const prefix = fence ? `${fence}\n` : "";
		if (prefix.length + rest.length <= max) {
			chunks.push(prefix + rest);
			break;
		}

		const cut = findCut(rest, max - prefix.length - CLOSE_FENCE.length);
		const body = rest.slice(0, cut).trimEnd();
		// Drop only the separator we cut on, so indentation on the next line survives.
		rest = rest[cut] === "\n" ? rest.slice(cut + 1) : rest.slice(cut).replace(/^ +/, "");

		fence = openFenceAfter(body, fence);
		chunks.push(prefix + body + (fence ? CLOSE_FENCE : ""));
	}

	return chunks.filter(chunk => chunk.trim().length > 0);
}
