// Copies the tracked seed notes in dev-vault-seed/ into the git-ignored dev-vault/ (D-02).
//
//   npm run seed               copy seed files that are missing from dev-vault/; keep existing ones
//   npm run seed -- --reset    also overwrite existing seed files with their tracked contents
//
// Safety rules (threat T-01-08):
//   - The repo root comes from this script's own location, never from the cwd.
//   - Every destination must resolve inside <root>/dev-vault/.
//   - Nothing under dev-vault/.obsidian/ is ever written (TaskNotes, Hot Reload and other plugins live there).
//   - The script only copies. It has no code path that removes a file or folder.
import { constants } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED = path.join(ROOT, "dev-vault-seed");
const VAULT = path.join(ROOT, "dev-vault");
const reset = process.argv.slice(2).includes("--reset");

let seeded = 0;
let skipped = 0;
let refused = 0;

function refuse(rel, why) {
	refused += 1;
	console.warn(`Refused to seed "${rel}": ${why}`);
}

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(full);
		} else if (entry.isFile()) {
			yield { full, kind: "file" };
		} else {
			yield { full, kind: "other" };
		}
	}
}

async function seedFile(full) {
	const rel = path.relative(SEED, full);
	const first = rel.split(path.sep)[0];
	if (first.toLowerCase() === ".obsidian") {
		refuse(rel, "the seed never writes Obsidian config or plugin folders");
		return;
	}
	const dest = path.resolve(VAULT, rel);
	if (!dest.startsWith(VAULT + path.sep)) {
		refuse(rel, "the destination is outside dev-vault/");
		return;
	}
	await mkdir(path.dirname(dest), { recursive: true });
	try {
		// Without --reset, COPYFILE_EXCL makes the copy fail on an existing file instead of
		// overwriting it, so a check-then-copy race can't clobber the developer's edits.
		await copyFile(full, dest, reset ? 0 : constants.COPYFILE_EXCL);
		seeded += 1;
	} catch (err) {
		if (!reset && err && err.code === "EEXIST") {
			skipped += 1;
			return;
		}
		throw err;
	}
}

try {
	for await (const { full, kind } of walk(SEED)) {
		if (kind !== "file") {
			refuse(path.relative(SEED, full), "only regular files are seeded");
			continue;
		}
		await seedFile(full);
	}
} catch (err) {
	console.error(`Seeding failed: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}

console.log(`Seeded ${seeded} file(s), skipped ${skipped} existing, into dev-vault/`);
if (refused > 0) {
	console.error(`${refused} seed path(s) refused.`);
	process.exit(1);
}
