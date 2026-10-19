import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";
import { globalIgnores, defineConfig } from "eslint/config";

export default defineConfig(
	globalIgnores([
		".claude/worktrees/**",
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
				projectService: { allowDefaultProject: ["manifest.json", "version-bump.mjs"] },
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// The classic settings API supports manifest.minAppVersion 1.12.2.
		// Declarative settings/search were introduced in Obsidian 1.13.
		files: ["src/ui/TimerPaneSettingTab.ts", "tests/settings.test.ts", "tests/main.test.ts"],
		rules: { "@typescript-eslint/no-deprecated": "off" },
	},
	{
		files: ["src/ui/TimerPaneSettingTab.ts"],
		rules: { "obsidianmd/settings-tab/prefer-setting-definitions": "off" },
	},
	{
		// The recommended config only matches JS/TS files, so without this block ESLint
		// skips manifest.json and obsidianmd/validate-manifest never runs.
		files: ["manifest.json"],
		languageOptions: { parser: tseslint.parser },
		plugins: { obsidianmd },
		rules: { "obsidianmd/validate-manifest": "error" },
	},
	{
		// Build-time script run by `npm version`, never bundled into the plugin.
		files: ["version-bump.mjs"],
		languageOptions: { globals: { ...globals.node } },
		rules: { "obsidianmd/no-nodejs-modules": "off" },
	},
	{
		rules: {
			"obsidianmd/ui/sentence-case": ["warn", { brands: ["TaskNotes", "Obsidian"] }],
		},
	},
);
