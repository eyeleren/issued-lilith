import assert from "node:assert/strict";
import { test } from "node:test";
import { splitMessage } from "../src/util/splitMessage.js";

test("short text is returned as one chunk", () => {
	assert.deepEqual(splitMessage("  ciao  "), ["ciao"]);
});

test("every chunk respects the limit and no text is lost", () => {
	const words = Array.from({ length: 1500 }, (_, i) => `parola${i}`);
	const text = words.join(" ");
	const chunks = splitMessage(text, 2000);
	assert.ok(chunks.length > 1);
	for (const c of chunks) assert.ok(c.length <= 2000, `chunk of ${c.length}`);
	assert.equal(chunks.join(" "), text);
});

test("prefers splitting on newlines", () => {
	const para = "a".repeat(60);
	const chunks = splitMessage(`${para}\n${para}`, 100);
	assert.deepEqual(chunks, [para, para]);
});

test("hard-cuts words longer than the limit", () => {
	const chunks = splitMessage("x".repeat(250), 100);
	assert.equal(chunks.length, 3);
	for (const c of chunks) assert.ok(c.length <= 100);
	assert.equal(chunks.join(""), "x".repeat(250));
});

test("reopens code blocks across chunks and keeps indentation", () => {
	const lines = Array.from({ length: 40 }, (_, i) => `    line_${i}();`);
	const text = `Ecco:\n\`\`\`js\n${lines.join("\n")}\n\`\`\``;
	const chunks = splitMessage(text, 200);
	assert.ok(chunks.length > 1);
	for (const c of chunks) {
		assert.ok(c.length <= 200);
		assert.equal((c.match(/```/g) ?? []).length % 2, 0, `unbalanced fences in:\n${c}`);
	}
	assert.ok(chunks[1].startsWith("```js\n    line_"));
});

test("does not split surrogate pairs", () => {
	const chunks = splitMessage("😀".repeat(60), 25);
	for (const c of chunks) assert.doesNotMatch(c, /[\ud800-\udbff]$|^[\udc00-\udfff]/);
	assert.equal(chunks.join(""), "😀".repeat(60));
});
