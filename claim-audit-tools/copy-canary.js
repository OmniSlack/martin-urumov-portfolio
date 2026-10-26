"use strict";

/**
 * Per-recipient markers, so a copy that surfaces somewhere can be traced back
 * to the copy it came from.
 *
 * WHAT IT IS
 *
 * Every copy handed to someone gets its own marker: a short string derived
 * from the document, the recipient and the date. The markers are recorded
 * here. If text later appears somewhere it should not, the marker in it says
 * which copy it travelled from — not who wrote it, not who is guilty, only
 * which copy.
 *
 * This is the oldest honest anti-leak technique there is. Map makers put
 * fictional streets in each edition; dictionaries put invented words. Nothing
 * runs on anyone's machine, nothing is hidden from the recipient in a way
 * that could harm them, and nothing is claimed about intent.
 *
 * WHAT IT IS NOT, stated in the source so it cannot drift:
 *
 *   It does not execute. There is no code in a marker — it is text.
 *   It does not phone home. Nothing is sent anywhere by anything here.
 *   It does not prove theft. A marker shows a path, not a motive, and a
 *     matching marker is one piece of evidence, not a verdict.
 *   It does not establish authorship. For that you need a timestamp that is
 *     not yours to move: a server record, a public commit, a notary.
 *
 * A marker that a recipient can see and remove still works: removing it is
 * itself an act, and the copy without it is still distinguishable from the
 * copies that kept theirs.
 *
 *     node copy-canary.js mint <document> <recipient>
 *     node copy-canary.js check <file>          # any known marker inside?
 *     node copy-canary.js list
 *
 * The ledger is `.canary-ledger.json` in the current directory, or the path in
 * the environment variable CANARY_LEDGER. (The original kept it in the root of
 * its own repository.)
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const LEDGER = process.env.CANARY_LEDGER || path.join(ROOT, ".canary-ledger.json");

const load = () => {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  } catch {
    return { entries: [] };
  }
};
const save = (l) => fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");

/**
 * A marker looks like a build identifier, because that is the least
 * interesting thing a reader can find and the least likely to be stripped.
 */
function mintMarker(doc, recipient, when) {
  const h = crypto
    .createHash("sha256")
    .update([doc, recipient, when, crypto.randomBytes(8).toString("hex")].join("␟"))
    .digest("hex");
  return `ref-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

const [, , cmd, ...rest] = process.argv;

if (cmd === "mint") {
  const [doc, recipient] = rest;
  if (!doc || !recipient) {
    console.log("usage: node copy-canary.js mint <document> <recipient>");
    process.exit(2);
  }
  const when = new Date().toISOString();
  const marker = mintMarker(doc, recipient, when);
  const ledger = load();
  ledger.entries.push({ marker, document: doc, recipient, issued: when });
  save(ledger);

  console.log(`MARKER   ${marker}`);
  console.log(`document ${doc}`);
  console.log(`to       ${recipient}`);
  console.log(`issued   ${when}`);
  console.log("");
  console.log("Put it where a build identifier would sit — a footer, a comment,");
  console.log("a version line. One per copy. Do not reuse it for a second person:");
  console.log("a marker shared by two copies tells you nothing about either.");
  console.log("");
  console.log(`Recorded in ${path.relative(ROOT, LEDGER)}, which is yours and`);
  console.log("should not be distributed with the copies.");
  process.exit(0);
}

if (cmd === "check") {
  const [file] = rest;
  if (!file) {
    console.log("usage: node copy-canary.js check <file>");
    process.exit(2);
  }
  const text = fs.readFileSync(file, "utf8");
  const ledger = load();
  const found = ledger.entries.filter((e) => text.includes(e.marker));

  if (!found.length) {
    console.log("No known marker found in this file.");
    console.log("");
    console.log("That is not evidence of anything. A marker can be absent because");
    console.log("the copy predates the marking, because it was removed, or because");
    console.log("the text was rewritten. Absence is not support — the same rule");
    console.log("Gate 18 applies to a confidence number.");
    process.exit(0);
  }

  for (const e of found) {
    console.log(`FOUND    ${e.marker}`);
    console.log(`  document  ${e.document}`);
    console.log(`  issued to ${e.recipient}`);
    console.log(`  on        ${e.issued}`);
  }
  console.log("");
  console.log("This says which copy the text travelled from. It does not say who");
  console.log("moved it, or why, or that anything wrongful occurred. Those are");
  console.log("separate questions and this tool answers none of them.");
  process.exit(0);
}

if (cmd === "list") {
  const ledger = load();
  if (!ledger.entries.length) {
    console.log("No markers issued.");
    process.exit(0);
  }
  const w = Math.max(...ledger.entries.map((e) => e.recipient.length));
  for (const e of ledger.entries) {
    console.log(`${e.marker}  ${e.recipient.padEnd(w)}  ${e.document}  ${e.issued.slice(0, 10)}`);
  }
  console.log(`\n${ledger.entries.length} marker(s) issued.`);
  process.exit(0);
}

console.log("usage:");
console.log("  node copy-canary.js mint <document> <recipient>");
console.log("  node copy-canary.js check <file>");
console.log("  node copy-canary.js list");
console.log("");
console.log("Markers show which copy text came from. They do not prove authorship;");
console.log("for that you need a timestamp you cannot move — a public commit, a");
console.log("server record, a notary.");
process.exit(2);
