"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * A record of every action, bookended so that a truncated record announces
 * itself.
 *
 * THE PROBLEM WITH LOGS
 *
 * A log is trusted exactly as far as it is complete, and a log cannot normally
 * tell you whether it is. Delete the last twenty lines and what remains looks
 * like an ordinary, healthy log that simply ends where it ends. Nothing about
 * it says "something used to follow this". That is the useful property for
 * anyone editing it and the fatal one for anyone reading it.
 *
 * TWO MECHANISMS, REQUIRED BY THE OWNER
 *
 *   "a report for every action" — every action, not the interesting ones.
 *   "you start and you finish with a forbidden thing" — a fixed marker at both
 *   ends, so a cut is visible.
 *
 * The bookends do the work a log cannot do for itself:
 *
 *   OPEN present, SEAL present   the record runs end to end
 *   OPEN present, SEAL missing   still open — or cut short. Both, until sealed
 *   OPEN missing                 the beginning is gone. Nothing here is trusted
 *
 * And a hash chain over the entries does the rest: each entry carries the
 * digest of the one before it, so changing any entry breaks every digest after
 * it and the break NAMES the first altered line. Deleting a middle entry
 * breaks the chain in the same way. Appending honestly is the only edit that
 * leaves the chain intact — which is the point.
 *
 * ⚠️ WHAT IT DOES NOT DO, in the source so it cannot drift:
 *
 *   It does not make entries true. A liar who logs every lie in order produces
 *   a perfect chain of lies. This shows that the record was not altered AFTER
 *   it was written, which is a different and smaller claim.
 *
 *   Anyone holding the file can rewrite it whole — new chain, new bookends,
 *   internally perfect. Detecting that needs the head digest kept somewhere
 *   else: read out loud, sent to someone, published. The chain protects
 *   against quiet edits, not against a determined rewrite.
 *
 *     node action-journal.js open  "why this run exists"
 *     node action-journal.js add   "what was done"  [outcome]
 *     node action-journal.js seal
 *     node action-journal.js check
 *     node action-journal.js show
 *
 * The journal file is `.journal.jsonl` in the current directory, or the path
 * in the environment variable JOURNAL_FILE. (The original wrote it into the
 * root of its own repository.)
 */

const FILE = process.env.JOURNAL_FILE || path.join(process.cwd(), ".journal.jsonl");

// The bookends. Distinctive enough that they cannot appear by accident, and
// fixed so that their absence is unambiguous.
const OPEN = "⟦JOURNAL-OPEN⟧";
const SEAL = "⟦JOURNAL-SEAL⟧";

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const readAll = () => {
  try {
    return fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  } catch {
    return [];
  }
};

/** Each entry's digest covers its own content AND the previous digest. */
const digestOf = (entry, prev) =>
  sha256([prev || "", entry.at, entry.kind, entry.what, entry.outcome || ""].join("␟"));

function append(kind, what, outcome) {
  const entries = readAll();
  const prev = entries.length ? entries[entries.length - 1].digest : null;
  const entry = {
    n: entries.length + 1,
    at: new Date().toISOString(),
    kind,
    what,
    outcome: outcome || null,
    prev,
  };
  entry.digest = digestOf(entry, prev);
  fs.appendFileSync(FILE, JSON.stringify(entry) + "\n");
  return entry;
}

function check() {
  const entries = readAll();
  if (!entries.length) {
    console.log("No journal.");
    return 2;
  }

  const problems = [];
  let prev = null;
  for (const e of entries) {
    if (e.prev !== prev) {
      problems.push(`entry ${e.n}: does not follow the entry before it — the chain is cut here.`);
    }
    if (digestOf(e, e.prev) !== e.digest) {
      problems.push(`entry ${e.n}: contents changed since it was written.`);
    }
    prev = e.digest;
  }

  const first = entries[0];
  const last = entries[entries.length - 1];
  const opened = first.kind === "OPEN" && first.what.includes(OPEN);
  const sealed = last.kind === "SEAL" && last.what.includes(SEAL);

  console.log(`JOURNAL — ${entries.length} entries`);
  console.log(`  first  ${first.at}  ${first.kind}`);
  console.log(`  last   ${last.at}  ${last.kind}`);
  console.log(`  head   ${last.digest.slice(0, 32)}`);
  console.log("");

  console.log(opened ? `  ${OPEN}   present` : `  OPEN MARKER MISSING — the beginning of this record is gone.`);
  console.log(sealed ? `  ${SEAL}   present` : `  SEAL MISSING — this record is either still open or was cut short.`);
  console.log("");

  if (problems.length) {
    for (const p of problems) console.log(`  ${p}`);
    console.log(`\n${problems.length} problem(s). The record was altered after it was written.`);
    return 1;
  }

  console.log("  The chain is intact: no entry was changed or removed after writing.");
  if (!sealed) {
    console.log("  Not sealed, so completeness is not established — only integrity.");
    return 1;
  }
  console.log("");
  console.log("  Integrity, not truth: a false entry written honestly and in order");
  console.log("  produces a perfect chain. Keep the head digest somewhere else —");
  console.log("  said out loud, sent to someone — or a whole rewrite goes unseen.");
  return 0;
}

// ─────────────────────────────────────────────────────────────── main

const [, , cmd, ...rest] = process.argv;

if (cmd === "open") {
  if (readAll().length) {
    console.log("A journal already exists. Seal it before opening another.");
    process.exit(2);
  }
  const e = append("OPEN", `${OPEN} ${rest.join(" ") || "(no reason given)"}`);
  console.log(`${OPEN}  entry 1  ${e.digest.slice(0, 16)}`);
  process.exit(0);
}

if (cmd === "add") {
  if (!readAll().length) {
    console.log("No journal is open. Run: node action-journal.js open \"why\"");
    process.exit(2);
  }
  const e = append("ACTION", rest[0] || "(unnamed)", rest.slice(1).join(" "));
  console.log(`  ${String(e.n).padStart(3)}  ${e.at.slice(11, 19)}  ${e.what}${e.outcome ? "  → " + e.outcome : ""}`);
  process.exit(0);
}

if (cmd === "seal") {
  const entries = readAll();
  if (!entries.length) { console.log("Nothing to seal."); process.exit(2); }
  if (entries[entries.length - 1].kind === "SEAL") { console.log("Already sealed."); process.exit(2); }
  const e = append("SEAL", `${SEAL} ${entries.length} entries`);
  console.log(`${SEAL}  entry ${e.n}`);
  console.log(`head ${e.digest}`);
  console.log("\nWrite that digest down somewhere this file cannot reach.");
  process.exit(0);
}

if (cmd === "check") process.exit(check());

if (cmd === "show") {
  for (const e of readAll()) {
    console.log(`${String(e.n).padStart(3)}  ${e.at.slice(0, 19)}  ${e.kind.padEnd(6)}  ${e.what}${e.outcome ? "  → " + e.outcome : ""}`);
  }
  process.exit(0);
}

console.log("usage:");
console.log("  node action-journal.js open  \"why this run exists\"");
console.log("  node action-journal.js add   \"what was done\"  [outcome]");
console.log("  node action-journal.js seal");
console.log("  node action-journal.js check");
console.log("  node action-journal.js show");
console.log("");
console.log("Every action, bookended. A cut record says so; an intact one says only");
console.log("that nothing was changed after writing — never that it is true.");
process.exit(2);
