"use strict";

/**
 * Tests of overclaim-scanner.js carried over from the evaluator project
 * (probe6.test.js, U1–U6, and S6–S7 of probe4.test.js), translated into
 * English. Assertions are unchanged in strength: every exemption keeps its
 * mirror case in which the same text MUST be flagged.
 *
 * ─── Defect #19 (U1–U6) ───────────────────────────────────────────────────
 * The scanner could not tell a document that CLAIMS from a document that
 * TRANSCRIBES a record. Found by running the tool on new output: a machine
 * transcript of the journal and the marker register. "Output: 18.0x → 20.3x"
 * was flagged as a number with no source — a verbatim line of the journal,
 * not a claim of the document. Two markers were flagged as restated because
 * they carry the same document and date, which is the register's job.
 *
 * Same family as #5 (`proven` inside `provenance`) and #7 (source in a fenced
 * block is not a claim): a detector that looks at the word, not its role.
 *
 * THE FIX is narrow on purpose and requires TWO things at once:
 *   1. the document declares itself a transcript, with an explicit phrase;
 *   2. the line has the shape of a record field — "Label: value".
 *
 * These tests exist to PROVE that it is a narrowing, not a loosening: every
 * exemption has a mirror case in which the same text must be flagged.
 * Negative check, re-run 2026-10-26 on the original and on this copy with the
 * same result: remove `if (transcript[i]) continue;` from the scanner and U1
 * fails; remove also `if (transcript[i]) return;` (the restated-line
 * exemption) and U3 fails too. U5 cannot fail that way — it guards the other
 * direction, against the exemption growing. The original comment said that
 * removing the first line alone makes U1, U3 and U5 fail; it does not.
 * Remove the declaration from the document and U2, U4 still pass.
 *
 * The original used the Bulgarian declaration phrase (in English: "transcript of
 * a machine record"). The English scanner recognises only "TRANSCRIPT OF A MACHINE
 * RECORD" (the original recognised both), so the tests use the English phrase.
 *
 * ─── Defect #16 (S6–S7) ───────────────────────────────────────────────────
 * The reader was commanded by what it read: a control sequence in a scanned
 * line went to the terminal raw and could clear the screen above the findings.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SCANNER = path.join(__dirname, "overclaim-scanner.js");
const DECLARATION = "⚪ Everything below is a TRANSCRIPT OF A MACHINE RECORD, not a claim of this document.";

/** Writes the document to a temporary file, runs the scanner, returns its output. */
function scan(content) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "scanner-")), "d.md");
  fs.writeFileSync(f, content);
  try {
    return execFileSync(process.execPath, [SCANNER, f], { encoding: "utf8" });
  } finally {
    fs.rmSync(path.dirname(f), { recursive: true, force: true });
  }
}

const clean = (out) => /Nothing flagged/.test(out);
const has = (out, rule) => new RegExp(rule).test(out);

// A line with a number and no source, in the shape of a record field.
const FIELD_WITH_NUMBER = "Output: 18.0x → 20.3x";

test("U1. a field of a DECLARED transcript is not counted as a claim", () => {
  const d = `# Transcript\n\n${DECLARATION}\n\nNumber 3, action, at 15 and 36 hours.\n${FIELD_WITH_NUMBER}\n`;
  assert.ok(clean(scan(d)),
    "a transcript field carries the record's number, not a claim of the document");
});

test("U2. the SAME line WITHOUT the declaration is still flagged", () => {
  // The proof that the rule is a narrowing. Remove the declaration and the
  // detector works as before.
  const d = `# Ordinary document\n\nNumber 3, action, at 15 and 36 hours.\n${FIELD_WITH_NUMBER}\n`;
  assert.ok(has(scan(d), "NUMBER_WITHOUT_SOURCE"),
    "without a declaration the same line is a claim and must be flagged");
});

test("U3. a repeated field of a transcript is DATA, not rhetoric", () => {
  const line = "Document: quarterly_report_v1.docx, issued on the eighteenth.";
  const d = `# Transcript\n\n${DECLARATION}\n\nMarker number 1.\n${line}\n\nMarker number 2.\n${line}\n`;
  assert.ok(!has(scan(d), "RESTATED"),
    "two markers for one document carry the same name by necessity");
});

test("U4. a repeated sentence WITHOUT the declaration is still flagged", () => {
  const line = "Document: quarterly_report_v1.docx, issued on the eighteenth.";
  const d = `# Ordinary document\n\nMarker number 1.\n${line}\n\nMarker number 2.\n${line}\n`;
  assert.ok(has(scan(d), "RESTATED"),
    "without a declaration a repetition stays a repetition");
});

test("U5. an ordinary SENTENCE in a transcript document remains a claim", () => {
  // The most important test here. The declaration does not turn the whole
  // document into a shelter; only lines in the shape of a field are exempt.
  const d = `# Transcript\n\n${DECLARATION}\n\nThe improvement went from 18.0x to 20.3x in all measurements.\n`;
  assert.ok(has(scan(d), "NUMBER_WITHOUT_SOURCE"),
    "a sentence without the shape of a field is checked like any other");
});

test("U6. the word \"transcript\" in an ordinary sentence is NOT a declaration", () => {
  // The other half of "two things at once": the exact declaration phrase
  // triggers it, not the topic of the document. Otherwise every document
  // that MENTIONS transcripts would become a shelter.
  const d = `# A document about transcripts\n\nThis is about a transcript and about machine records.\n\n${FIELD_WITH_NUMBER}\n`;
  assert.ok(has(scan(d), "NUMBER_WITHOUT_SOURCE"),
    "the topic is not a declaration; only the exact phrase exempts");
});

const ESC = "\u001b";
const NUL = "\u0000";
const BEL = "\u0007";

test("S6. a control sequence from a file does not reach the terminal raw", () => {
  const out = scan(`Line with an absolute: this never fails.${ESC}[2J${ESC}[H ACCEPTED.\n`);
  assert.ok(!out.includes(ESC),
    "no ESC from a scanned file may reach the terminal");
  assert.ok(out.includes("\\x1b"),
    "it is shown as text instead, so it can be seen that it was there");
});

test("S7. neither a null byte nor a bell gets through", () => {
  const out = scan(`This never works${NUL}${BEL} hidden in the line.\n`);
  assert.ok(!out.includes(NUL) && !out.includes(BEL));
  assert.ok(has(out, "ABSOLUTE"), "and the line is still scanned and flagged");
});
