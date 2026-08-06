#!/usr/bin/env node
/**
 * Licence inventory over CycloneDX SBOMs produced by `npm sbom`.
 *
 * Ascend ships to retail, wholesale and distribution businesses, several of
 * which will run a licence review before signing. Until 2026-08-06 the only
 * answer to "what licences are in your build" was "read two lockfiles", and
 * nothing would have noticed a copyleft dependency arriving in a routine
 * `chore(deps)` bump.
 *
 * This does not encode a policy — which licence families are acceptable is a
 * business decision, not an engineering default. It classifies what is
 * actually there into three buckets and exits non-zero only when asked to,
 * so the first job is to produce a reviewable inventory:
 *
 *   permissive  — MIT/ISC/BSD/Apache-2.0/Unlicense/CC0 and friends. Normal.
 *   weak-copyleft / copyleft — LGPL/MPL/EPL, GPL/AGPL. Worth a decision:
 *                 network copyleft (AGPL) in particular changes obligations
 *                 for a hosted product.
 *   unknown     — no licence declared in the SBOM. Not benign: an undeclared
 *                 licence is legally "all rights reserved" until proven
 *                 otherwise, so these need looking up by hand.
 *
 * Usage:  node tools/license-scan.mjs <sbom.cdx.json> [more.cdx.json …]
 *         node tools/license-scan.mjs --fail-on copyleft,unknown <sbom…>
 */
import { readFileSync } from "node:fs";

const PERMISSIVE = [
  /^MIT/i, /^ISC$/i, /^BSD-/i, /^0BSD$/i, /^Apache-2\.0$/i, /^Unlicense$/i,
  /^CC0-1\.0$/i, /^Python-2\.0$/i, /^BlueOak-1\.0\.0$/i, /^WTFPL$/i, /^Zlib$/i,
  /^CC-BY-4\.0$/i, /^Artistic-2\.0$/i,
];
const WEAK_COPYLEFT = [/^LGPL/i, /^MPL-/i, /^EPL-/i, /^CDDL/i];
const COPYLEFT = [/^GPL-/i, /^AGPL/i, /^SSPL/i, /^OSL-/i];

function classify(license) {
  if (!license) return "unknown";
  if (COPYLEFT.some((r) => r.test(license))) return "copyleft";
  if (WEAK_COPYLEFT.some((r) => r.test(license))) return "weak-copyleft";
  if (PERMISSIVE.some((r) => r.test(license))) return "permissive";
  return "other";
}

/** CycloneDX puts a licence at licenses[].license.id | .name, or licenses[].expression. */
function licenseOf(component) {
  for (const entry of component.licenses ?? []) {
    const id = entry.license?.id ?? entry.license?.name ?? entry.expression;
    if (id) return String(id);
  }
  return undefined;
}

const args = process.argv.slice(2);
let failOn = [];
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--fail-on") {
    failOn = (args[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    files.push(args[i]);
  }
}

if (files.length === 0) {
  console.error("usage: node tools/license-scan.mjs [--fail-on a,b] <sbom.cdx.json> …");
  process.exit(2);
}

/** @type {Map<string, {license: string, bucket: string}>} name@version -> info */
const components = new Map();

for (const file of files) {
  const sbom = JSON.parse(readFileSync(file, "utf8"));
  for (const c of sbom.components ?? []) {
    const key = `${c.name}@${c.version ?? "?"}`;
    if (components.has(key)) continue;
    const license = licenseOf(c);
    components.set(key, { license: license ?? "(none declared)", bucket: classify(license) });
  }
}

const buckets = { permissive: [], "weak-copyleft": [], copyleft: [], other: [], unknown: [] };
for (const [key, info] of components) buckets[info.bucket].push(`${key} — ${info.license}`);

console.log(`license-scan: ${components.size} unique components across ${files.length} SBOM(s)\n`);
for (const name of ["permissive", "other", "weak-copyleft", "copyleft", "unknown"]) {
  const list = buckets[name];
  console.log(`  ${name.padEnd(14)} ${String(list.length).padStart(4)}`);
}
console.log("");

for (const name of ["copyleft", "weak-copyleft", "unknown", "other"]) {
  const list = buckets[name].sort();
  if (list.length === 0) continue;
  console.log(`── ${name} ──`);
  for (const line of list) console.log(`  ${line}`);
  console.log("");
}

const failing = failOn.flatMap((b) => buckets[b] ?? []);
if (failing.length > 0) {
  console.error(`license-scan: FAILED — ${failing.length} component(s) in ${failOn.join("/")}`);
  process.exit(1);
}
