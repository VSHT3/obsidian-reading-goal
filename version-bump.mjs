import { readFileSync, writeFileSync } from "fs";

/**
 * Keeps manifest.json and versions.json in step with package.json.
 *
 * versions.json maps each plugin version to the minimum Obsidian version it
 * needs, which is how Obsidian decides whether to offer an update to someone
 * on an older build.
 */
const target = process.env.npm_package_version;
if (!target) {
	throw new Error("Run this through npm version, so npm_package_version is set.");
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = target;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, "\t")}\n`);

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[target] = manifest.minAppVersion;
writeFileSync("versions.json", `${JSON.stringify(versions, null, "\t")}\n`);

console.log(`${target} requires Obsidian ${manifest.minAppVersion}`);
