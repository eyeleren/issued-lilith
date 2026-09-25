const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

let threshold = LEVELS.info;

export function setLogLevel(level) {
	threshold = LEVELS[level] ?? LEVELS.info;
}

function format(value) {
	if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
	if (typeof value === "object" && value !== null) {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

function write(level, scope, args) {
	if (LEVELS[level] < threshold) return;
	const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${args.map(format).join(" ")}`;
	if (LEVELS[level] >= LEVELS.warn) console.error(line);
	else console.log(line);
}

export function createLogger(scope) {
	return {
		debug: (...args) => write("debug", scope, args),
		info: (...args) => write("info", scope, args),
		warn: (...args) => write("warn", scope, args),
		error: (...args) => write("error", scope, args)
	};
}
