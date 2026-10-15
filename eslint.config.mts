import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";
import { globalIgnores, defineConfig } from "eslint/config";

export default defineConfig(
	globalIgnores([
		"node_modules",
		"dev-vault",
		"dev-vault-seed",
		"scripts",
		"esbuild.config.mjs",
		"eslint.config.mts",
		"main.js",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	]),
	{
		languageOptions: {
			globals: { ...globals.browser },
			parserOptions: {
				projectService: { allowDefaultProject: ["manifest.json"] },
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// The recommended config only matches JS/TS files, so without this block ESLint
		// skips manifest.json and obsidianmd/validate-manifest never runs.
		files: ["manifest.json"],
		languageOptions: { parser: tseslint.parser },
		plugins: { obsidianmd },
		rules: { "obsidianmd/validate-manifest": "error" },
	},
	{
		rules: {
			"obsidianmd/ui/sentence-case": ["warn", { brands: ["TaskNotes", "Obsidian"] }],
		},
	},
);
