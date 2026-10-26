"use strict";

/**
 * The scanner: reads a text and names where it claims more than it carries —
 * then says what the same sentence can honestly carry instead.
 *
 * This is the nine-pass review protocol, mechanised for the parts a machine
 * can actually check. It cannot judge whether something is true. It can only
 * find the SHAPES in which unfounded confidence travels, which is a narrower
 * job and is done without opinion:
 *
 *   a number with no source beside it        Gate 18
 *   uniform confidence across a long text    no markers on uneven truth
 *   a hedge that names no one                "studies show", "it is known"
 *   an absolute                              always, never, proven, guaranteed
 *   a novelty claim                          first, unprecedented, revolutionary
 *   the same claim restated as support       Gate 15
 *
 * Every finding carries a REFRAME: not a deletion, but the sentence rewritten
 * to the strength its own evidence supports. Cutting a claim loses whatever
 * was true in it; reframing keeps it and drops only the part that was borrowed.
 *
 * English input only. The original also matched Bulgarian equivalents of
 * each pattern; those alternatives were removed with the translation.
 *
 *     node overclaim-scanner.js <file>
 *     node overclaim-scanner.js <file> --quiet    # findings only, no reframes
 *     cat something | node overclaim-scanner.js -
 */

const fs = require("node:fs");

const RULES = [
  {
    id: "NUMBER_WITHOUT_SOURCE",
    // A figure with a unit or a percent, on a line naming no source at all.
    test: (line) =>
      /(?:^|[\s(])[\d][\d\s.,]*\s*(?:%|times|x|×|points|bpm|Hz|GB|TB|ms|K\b)/i.test(line) &&
      // The fourth over-flagging fix of one day: the exemption recognised the
      // literal "node --test" and flagged a line carrying a DIFFERENT command
      // beside its number. A source is any command in a code span, any
      // citation and any year in brackets — not one specific string.
      !/\[|\(20\d\d|\bet al\b|source|measured|according to/i.test(line) &&
      !/`[^`]*\b(node|python3?|git|npm|curl|grep)\b[^`]*`/i.test(line),
    says: "A figure carrying the authority of measurement, with nothing beside it that produced it.",
    reframe: (line) =>
      `Name what produced it, or drop the precision: "${short(line)}" → ` +
      `state the command, the study or the record, or say "roughly" and mean it.`,
  },
  {
    id: "HEDGE_WITHOUT_A_NAME",
    test: (line) =>
      /\b(?:studies show|research shows|it is (?:well )?known|experts (?:say|agree)|scientists (?:say|believe))\b/i.test(line),
    says: "An appeal to authority that names no authority. The form of a citation with none in it.",
    reframe: () =>
      `Name one: author, year, and what was actually measured — or say "I think" and own it.`,
  },
  {
    id: "ABSOLUTE",
    // An absolute is overclaiming only when nothing enforces it. "never opens
    // the action boundary" is a specification when a gate enforces it and a
    // test covers it; the first version of this rule could not tell the
    // difference and flagged the project's own guarantees. A line that names
    // its mechanism is exempt.
    test: (line) =>
      // The fifth over-flagging fix of one day: `proven` plus `\w*` hit
      // "provenance" — as "ten" had hit "attending". The words are closed
      // with a boundary on both sides.
      /\b(?:always|never|every single|proven|guaranteed|impossible to)\b/i.test(line) &&
      !/Gate \d|`[a-zA-Z_]+\(|test|fail-closed|enforced|invariant|\bcode\b/i.test(line),
    says: "An absolute with nothing named that enforces it.",
    reframe: () =>
      `State the condition under which it holds: "under X, this held in N of M cases".`,
  },
  {
    id: "NOVELTY_CLAIM",
    // "the first mismatch" is an ordinal and says nothing about priority. Only
    // the priority sense is a claim: first to do it, first in the world, first
    // ever. The ordinal sense was flagged by the first version of this rule.
    test: (line) =>
      /\b(?:first ever|first (?:ever )?to\b|first in the world|unprecedented|revolutionary|nobody has ever|no one has ever)\w*/i.test(line),
    says: "A novelty claim. Pass 6 of the protocol asks whether it was checked; it almost never is.",
    reframe: () =>
      `Priority needs a timestamp that is not yours to move. Give the date and where it is recorded, or say "as far as I have found".`,
  },
  {
    id: "INTROSPECTED_MEASUREMENT",
    // The sixth detector fix of one day, and the first that was a MISS rather
    // than over-flagging: "oxytocin level one, adrenaline level two" is a claim
    // of measurement with no measurement — Gate 18 applied to one's own body —
    // and it passed, because the numbers were written as words with no unit.
    //
    // Narrow on purpose: it hits only a NAMED substance or system TOGETHER with
    // a degree. "I feel tension" is not touched — it is a sensation and is
    // described as one. A line naming a real measure (heart rate, conductance,
    // cortisol in saliva) is exempt, because then the number has a source.
    //
    // ⚠️ The citation in the reframe is to SECONDARY sources. Summaries and
    // textbook text were read, not the 1962 paper itself. Marked 🟡, not 🟢.
    test: (line) =>
      /\b(?:oxytocin|adrenal[ie]n|cortisol|dopamine|serotonin|endorphin)\w*\b/i.test(line) &&
      /\b(?:level|degree|first|second|third|one|two|three|\d)\w*\b/i.test(line) &&
      !/heart rate|HRV|conductance|saliva|blood|assay|laborator|measured with/i.test(line),
    says: "A named substance given a level, with nothing that measured it. Sensation is data; the substance and the level are an interpretation the sensation does not carry.",
    reframe: () =>
      `Arousal is largely undifferentiated — Schachter & Singer 1962 (🟡 as reported in secondary ` +
      `sources; the paper itself was not read) gave one injection and got euphoria or anger depending ` +
      `on who was in the room. Say what was felt, and name a real measure beside it — heart rate, HRV, ` +
      `skin conductance — if a level is wanted.`,
  },
  {
    id: "SELF_EVIDENCE",
    test: (line) =>
      /\b(?:obviously|clearly|of course|needless to say)\b/i.test(line),
    says: "A word that asks the reader to skip the step where the claim is supported.",
    reframe: () => `Delete the word. If the claim stands without it, nothing is lost.`,
  },
];

/**
 * Defect #16 — the text being read was commanding the reader.
 *
 * Everything here prints lines of someone else's file back to the terminal. A
 * control sequence in such a line went out raw: `\x1b[2J\x1b[H` clears the
 * screen and puts the cursor at the top, so a scanned document could ERASE the
 * findings above it and write "all passed".
 *
 * A scanner whose output is controlled by what it scans is not a scanner.
 *
 * The rule: content from a file is DATA. It is neutralised before it is shown,
 * always, with no exception for "our" file — because which file is ours is
 * decided by the path, and the path comes from outside.
 */
const tame = (s) =>
  String(s).replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, (c) =>
    "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"));

const short = (s) => {
  const t = tame(s).trim();
  return t.length > 60 ? t.slice(0, 57) + "..." : t;
};

/** Markers from the project's own confidence ladder (the emoji and their English names). */
const MARKER = /🟢|🟡|🟠|🔴|🔵|⚪|\bSC\b|Established|Probable|Hypothesis|Metaphor|Unverified/u;

function analyse(text) {
  const lines = text.split("\n");
  const findings = [];

  // A number inside a fenced block whose own lines carry the command that
  // produced it IS sourced — the command simply sits a line or two above,
  // where a command belongs. Reading line by line could not see that, and
  // three sourced figures were flagged as unsourced.
  //
  // This changes the UNIT of the check, not the word it looks for: a fence is
  // the natural scope for "is there a source here". Verified not to loosen
  // anything — README still reports the same 8 findings afterwards.
  const sourcedFence = new Array(lines.length).fill(false);
  {
    let open = -1;
    lines.forEach((l, i) => {
      if (!/^\s*```/.test(l)) return;
      if (open === -1) { open = i; return; }
      const body = lines.slice(open, i + 1);
      if (body.some((b) => /^\s*\$ |\b(node|python3?|git|npm|curl)\b/.test(b))) {
        for (let j = open; j <= i; j++) sourcedFence[j] = true;
      }
      open = -1;
    });
  }

  // DEFECT #19 — the scanner could not tell a document that CLAIMS from a
  // document that TRANSCRIBES a record.
  //
  // Found on 19 September 2026 by running the tool on new output: a machine
  // transcript of the journal and the marker register. In it "Output: 18.0x →
  // 20.3x" was flagged as a number with no source — but it is a VERBATIM line
  // of the journal, not a claim of the document. And two markers were flagged
  // as restated, because they carry the same document and the same date —
  // which is their job, not rhetoric.
  //
  // Same family as #5 (proven inside provenance) and #7 (source in a fenced
  // block is not a claim): a detector that looks at the word, not its role.
  //
  // THE RULE, NARROW ON PURPOSE. Two things are required at once:
  //
  //   1. the document declares itself a transcript, with an explicit phrase;
  //   2. the line has the shape of a record field — "Label: value".
  //
  // Declaration without shape exempts nothing. Shape without declaration —
  // nothing either. An ordinary sentence in such a document remains a claim
  // and is checked.
  const TRANSCRIPT_MARK = /TRANSCRIPT OF A MACHINE RECORD/;
  const FIELD = /^\s{0,3}[\p{L}][^:]{0,40}:\s+\S/u;
  const transcript = new Array(lines.length).fill(false);
  {
    const declared = lines.findIndex((l) => TRANSCRIPT_MARK.test(l));
    if (declared !== -1) {
      for (let i = declared + 1; i < lines.length; i++) {
        if (FIELD.test(lines[i])) transcript[i] = true;
      }
    }
  }

  lines.forEach((line, i) => {
    if (!line.trim() || line.trim().length < 12) return;
    for (const r of RULES) {
      if (r.id === "NUMBER_WITHOUT_SOURCE" && sourcedFence[i]) continue;
      if (transcript[i]) continue;
      if (r.test(line)) {
        findings.push({ rule: r, line: i + 1, text: line.trim() });
      }
    }
  });

  // Pass 5: uniform confidence over uneven truth. Not a line-level fault — a
  // property of the whole document, so it is measured on the whole document.
  const substantive = lines.filter((l) => l.trim().length > 40).length;
  const marked = lines.filter((l) => MARKER.test(l)).length;
  const uniform = substantive >= 15 && marked === 0;

  // Pass 2: the same sentence restated. Repetition is not corroboration.
  const seen = new Map();
  const restated = [];
  lines.forEach((line, i) => {
    // Table markup repeats by design: a header row and its separator appear
    // once per table. Counting those as a restated claim flagged a GENERATED
    // inventory six times for having six tables. Structure is not assertion.
    if (/^\s*\|[\s|:.-]*\|\s*$/.test(line)) return;
    if (/^\s*\|\s*(file|#)\s*\|/i.test(line)) return;
    // Defect #19, its second half: a field of a transcribed record that
    // repeats is DATA. Two markers for the same document carry the same
    // document name by necessity — that is the record, not rhetoric.
    if (transcript[i]) return;
    const key = line.trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 70);
    if (key.length < 30) return;
    if (seen.has(key)) restated.push({ line: i + 1, first: seen.get(key), text: short(line) });
    else seen.set(key, i + 1);
  });

  return { findings, uniform, substantive, marked, restated, lines: lines.length };
}

// ------------------------------------------------------------------- main

function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet");
  const target = args.find((a) => !a.startsWith("--"));

  if (!target) {
    console.log("usage: node overclaim-scanner.js <file|-> [--quiet]");
    process.exit(2);
  }

  const text =
    target === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(target, "utf8");

  const r = analyse(text);

  console.log(`SCAN — ${target === "-" ? "stdin" : target}`);
  console.log(`${r.lines} lines, ${r.substantive} substantive, ${r.marked} carrying a confidence marker\n`);

  if (r.uniform) {
    console.log("UNIFORM_CONFIDENCE");
    console.log("  A long text with no confidence marker anywhere. Uneven truth");
    console.log("  presented at one volume is the main way a falsehood passes for a fact.");
    if (!quiet) {
      console.log("  REFRAME: mark each claim at its own strength — established,");
      console.log("           probable, possible, hypothesis, metaphor, unverified.");
    }
    console.log("");
  }

  for (const f of r.findings) {
    console.log(`${f.rule.id}  line ${f.line}`);
    console.log(`  ${short(f.text)}`);
    console.log(`  ${f.rule.says}`);
    if (!quiet) console.log(`  REFRAME: ${f.rule.reframe(f.text)}`);
    console.log("");
  }

  for (const d of r.restated) {
    console.log(`RESTATED  line ${d.line} repeats line ${d.first}`);
    console.log(`  ${d.text}`);
    console.log(`  Repetition is not independent corroboration.`);
    console.log("");
  }

  const total = r.findings.length + r.restated.length + (r.uniform ? 1 : 0);
  console.log(total === 0 ? "Nothing flagged." : `${total} finding(s).`);
  console.log("\nThis finds the SHAPE of overclaiming. It cannot tell you what is true.");
  return total;
}

if (require.main === module) main();

module.exports = { RULES, analyse, tame, MARKER };
