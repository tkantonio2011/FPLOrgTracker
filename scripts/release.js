#!/usr/bin/env node
// Run this on Windows before building when using --skip-build deploy:
//   node scripts/release.js
//   npx prisma generate && npm run build
//   bash scripts/deploy.sh --skip-build
//
// This script:
//  1. Bumps the patch version in package.json
//  2. Replaces ## vNEXT in CHANGELOG.md with the new version and today's date

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const changelogPath = path.join(root, "CHANGELOG.md");

// Bump patch version
const raw = fs.readFileSync(pkgPath, "utf-8");
const pkg = JSON.parse(raw);
const parts = pkg.version.split(".");
parts[2] = String(parseInt(parts[2]) + 1);
const newVersion = parts.join(".");
const newRaw = raw.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${newVersion}"`);
fs.writeFileSync(pkgPath, newRaw, "utf-8");

// Stamp CHANGELOG.md
const today = new Date().toISOString().slice(0, 10);
const changelog = fs.readFileSync(changelogPath, "utf-8");
if (!changelog.includes("## vNEXT")) {
  console.warn("WARN: No '## vNEXT' section found in CHANGELOG.md — add one before releasing.");
} else {
  const stamped = changelog.replace("## vNEXT", `## v${newVersion} — ${today}`);
  fs.writeFileSync(changelogPath, stamped, "utf-8");
  console.log(`CHANGELOG.md stamped with v${newVersion}`);
}

console.log(`Version bumped to v${newVersion}`);
console.log(`Next steps:`);
console.log(`  npx prisma generate && npm run build`);
console.log(`  bash scripts/deploy.sh --skip-build`);
