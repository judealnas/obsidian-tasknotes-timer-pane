import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";

// Build modes, read from the first CLI argument:
//   production  -> main.js at the repo root (minified, no sourcemap), then exit
//   deploy      -> one-shot build into the repo-local dev vault, then exit
//   (none)      -> watch build into the repo-local dev vault
const mode = process.argv[2];
const prod = mode === "production";
const deploy = mode === "deploy";

// Hard-coded, repo-relative target (D-01). There is deliberately no environment
// variable or CLI override: the build can never write into a real vault.
const DEV_DIR = "dev-vault/.obsidian/plugins/tasknotes-timer-pane";

const devVaultAssets = {
	name: "dev-vault-assets",
	setup(build) {
		build.onStart(async () => {
			await mkdir(DEV_DIR, { recursive: true });
			try {
				await access(`${DEV_DIR}/.hotreload`);
			} catch {
				await writeFile(`${DEV_DIR}/.hotreload`, "");
			}
			await copyFile("manifest.json", `${DEV_DIR}/manifest.json`);
			await copyFile("styles.css", `${DEV_DIR}/styles.css`);
		});
	},
};

const context = await esbuild.context({
	banner: { js: "/* bundled by esbuild — see the repository for source */" },
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
	],
	format: "cjs",
	target: "es2021",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	minify: prod,
	outfile: prod ? "main.js" : `${DEV_DIR}/main.js`,
	plugins: prod ? [] : [devVaultAssets],
});

if (prod || deploy) {
	await context.rebuild();
	await context.dispose();
	process.exit(0);
} else {
	await context.watch();
}
