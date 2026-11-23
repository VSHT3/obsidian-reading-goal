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
			// Declare the proper nouns rather than switching the rule off: the
			// directory's own scan ignores this config, so silencing it here
			// would only remove the local signal.
			"obsidianmd/ui/sentence-case": ["warn", { brands: ["Bases", "Books.base"] }],
		},
	},
	{
		// The directory's scan reports the unsafe-* family on plugin code, so
		// it is on here too. Frontmatter arrives as `any` and is typed at the
		// boundary.
		files: ["src/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-member-access": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
		},
	},
	{
		// The test runner is a Node script, not plugin code: console output is
		// the point, and it never touches the Obsidian runtime.
		files: ["test/**/*.ts"],
		rules: { "obsidianmd/rule-custom-message": "off" },
	},
);
