import js from "@eslint/js";
import globals from "globals";

export default [
	{
		ignores: ["node_modules/", "data/"]
	},
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node
			}
		},
		rules: {
			"no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
			"no-var": "error",
			"prefer-const": "error",
			eqeqeq: ["error", "always", { null: "ignore" }],
			curly: ["error", "multi-line", "consistent"],
			"no-shadow": "error",
			"no-empty-function": "error",
			"no-lonely-if": "error",
			yoda: "error",
			"default-case-last": "error"
		}
	}
];
