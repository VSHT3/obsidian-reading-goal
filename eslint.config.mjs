import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default tseslint.config(
	{ ignores: ["main.js", "node_modules/**", "*.mjs"] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Obsidian types frontmatter as `any`, so the unsafe-* family fires
			// on every property read without indicating a real problem.
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			// Declare the proper nouns rather than switching the rule off: the
			// directory's own scan ignores this config, so silencing it here
			// would only remove the local signal.
			"obsidianmd/ui/sentence-case": ["warn", { brands: ["Bases", "Books.base"] }],
		},
	},
	{
		// The test runner is a Node script, not plugin code: console output is
		// the point, and it never touches the Obsidian runtime.
		files: ["test/**/*.ts"],
		rules: { "obsidianmd/rule-custom-message": "off" },
	},
);
