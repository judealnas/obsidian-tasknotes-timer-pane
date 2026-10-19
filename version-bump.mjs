// Run by `npm version` (the "version" script). Copies the new package.json version into
// manifest.json and records its minAppVersion in versions.json, so BRAT and Obsidian see
// the same version as the git tag.
import { readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
	throw new Error("npm_package_version is not set. Run this through `npm version`.");
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
