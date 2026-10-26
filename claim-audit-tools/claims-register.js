"use strict";

/**
 * A register for every factual claim that leaves a project in a CV, a site or
 * a profile — and a checker that refuses the ones without a source.
 *
 * WHY THIS EXISTS
 *
 * On 30 July 2026 a correction register recorded that an assistant had
 * inflated the owner's work history, and that a LATER assistant inherited the
 * claim without checking, repeated it, and built a financial conclusion on top
 * of it. The rule written that day:
 *
 *   A claim about a person's biography is verified with that person. A file
 *   is not a source of facts about them; it is only a source for what was said.
 *
 * On 18 September 2026 the same failure happened again, from the assistant
 * building this project: "37,448 reachable states" was written once, then
 * carried into the CV, the site, a handover document and three commit
 * messages. It was wrong — the figure is the number of operation SEQUENCES of
 * length ≤ 5 over an alphabet of 8 (8+64+512+4096+32768), not the number of
 * distinct states reached. Nobody re-derived it, because it had already been
 * written down.
 *
 * Attention does not fix this; attention is what failed. A separate tool that
 * must be consulted does, because it makes the check a step instead of a
 * virtue.
 *
 *     node claims-register.js                    # print the register
 *     node claims-register.js --check <paths...> # scan documents, exit 1 on a problem
 *     node claims-register.js --check            # scan every tracked .md/.txt/.html/.json
 *                                                # of the git repository in the current directory
 *
 * The entries below are the technical entries of the original register (test
 * counts, gate counts, defect counts, an invariant's coverage). The entries
 * about the owner's biography and about his non-technical writing were removed
 * from this copy: they are personal, and they belong to the owner's own
 * register, not to a public tool. The mechanism is unchanged.
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * status:
 *   MEASURED    produced by a command that can be re-run; `how` is that command
 *   SUPPLIED    taken from a record someone else produced; `how` names it
 *   SUBJECT     a fact about a person; only they can confirm it
 *   RETRACTED   was published and is wrong; kept so it is not re-inherited
 *   QUARANTINE  not refuted — and not allowed out. No mechanism, no test, no
 *               way stated in which it could fail. The owner's own status,
 *               from his claim register of 28 July 2026.
 *
 * QUARANTINE was missing at first and it is the status this register needed
 * most. RETRACTED covers a claim shown to be wrong. Every register before had
 * nowhere to put the third kind: the claim that is probably fine, that nobody
 * has checked, and that quietly hardens into fact by being repeated. The
 * owner's register had that slot two months before this file did.
 *
 * `falls` — how the claim could FALL. Not where it came from; `how` already
 * records that. A claim whose author cannot say what observation would sink it
 * is not a claim, it is a position. Required for MEASURED and QUARANTINE.
 */
const CLAIMS = [
  {
    text: "139/139 tests passing",
    patterns: ["139/139", "139 of 139"],
    status: "RETRACTED",
    how: "Superseded by the 161-test suite; correct as of v0.10 only.",
    supersededBy: "test count",
  },
  {
    text: "test count",
    status: "MEASURED",
    how: "node --test",
    falls: "Run it and get a different number, or a non-zero exit.",
    note: "Re-derive before quoting. '# tests' counts subtests plus suite wrappers.",
  },
  {
    text: "37,448 as a count of states",
    // What is retracted is the number WITH THE WRONG WORD beside it, not the
    // number on its own: 37,448 is a correct count of sequences and a wrong
    // count of states.
    patterns: ["37,448 states", "37,448 reachable", "37448 states", "37,448 distinct"],
    status: "RETRACTED",
    how:
      "Published as 'reachable states'. It is the count of operation " +
      "sequences of length <= 5 over an alphabet of 8: 8+64+512+4096+32768. " +
      "Distinct states reached is a different and smaller number.",
    supersededBy: "invariant coverage",
  },
  {
    text: "invariant coverage",
    status: "MEASURED",
    how: "node verify/invariant.js 5",
    falls:
      "One violation at depth 5, or a sequence of length 6 that violates " +
      "what length 5 did not. Depth 5 is a bound on the search, not on the " +
      "system: it cannot fall by being re-run at the same depth.",
    note:
      "Quote what the tool prints, as it labels it. Do not convert a count " +
      "of sequences into a count of states.",
  },
  {
    // Defect #18, 19 September 2026. The number was copied once and never
    // counted again. Nineteen is the highest gate NUMBER, not the count:
    // the numbers 02, 05, 06, 07 and 10 did not exist in the code.
    text: "19 as a count of gates",
    patterns: ["19 gates", "nineteen gates"],
    status: "RETRACTED",
    how:
      "Published in the CV and a handover document as the number of gates. " +
      "It is the highest gate NUMBER; gates 02, 05, 06, 07 and 10 did not " +
      "exist. Counted from the sources: fifteen as of 19 September 2026.",
    supersededBy: "gate count",
  },
  {
    text: "gate count",
    status: "MEASURED",
    how: "grep -rohE 'Gate [0-9]+' --include='*.js' . | sort -u | wc -l",
    falls: "Add or remove a gate and re-run; the number moves. It falls the moment a gate is named in a comment but not enforced in code — the grep counts the name.",
    note:
      "Count the distinct gates, do not quote the highest number. The two " +
      "differ because the numbering has gaps.",
  },
  {
    // The same class, found in the same hour: a count that was right once and
    // then went stale without anyone counting it.
    text: "16 as a count of defects",
    patterns: ["16 defects"],
    status: "RETRACTED",
    how:
      "Published in the CV after the count had already moved past it. " +
      "Defects were numbered #1 through #17; the closed count was seventeen.",
    supersededBy: "defect count",
  },
  {
    // The review of 20 September 2026 — the third time, the same way:
    //   16 defects → retracted on 19 September
    //   17 defects → retracted here, on 20 September
    // The scanner reads EVERY tracked document, while the CV updater refreshes
    // only the CV. So the number goes in HERE: every document is caught by the
    // same mechanism instead of being chased file by file.
    text: "17 as a count of defects",
    patterns: ["17 defects"],
    status: "RETRACTED",
    how:
      "Correct on 19 September and stale by 20 September. Defects were " +
      "numbered #1 through #21 with #2 unused, so twenty distinct defects " +
      "were closed. Counted, not remembered.",
    supersededBy: "defect count",
  },
  {
    // BEFORE it was published. Defect #18 was exactly this — the highest
    // NUMBER read as a COUNT. Recorded in advance, because a register that
    // only catches up is always one document late.
    text: "21 as a count of defects",
    patterns: ["21 defects"],
    status: "RETRACTED",
    how:
      "Never published, and recorded so it cannot be. 21 is the highest " +
      "defect NUMBER, not the count: #2 is unused, so the distinct count is " +
      "twenty. This is defect #18 in a new costume — the highest number " +
      "read as the total.",
    supersededBy: "defect count",
  },
  {
    text: "defect count",
    status: "MEASURED",
    how: "git grep -ohE '[Dd]efect #[0-9]+' | grep -oE '#[0-9]+' | sort -u",
    falls: "A defect numbered in a document but never closed makes this count an overstatement. It falls on any #N with no test that bites.",
    note:
      "Two numbers named in the same file are not one claim. 'Found by the " +
      "machine' and 'closed in total' are different counts and must not be " +
      "quoted interchangeably.",
  },
  {
    text: "zero runtime dependencies",
    status: "MEASURED",
    how: "no 'dependencies' key in package.json; every require is ./ or node:",
    falls: "One require of a package name. It does not cover devDependencies, and node: builtins are a dependency on Node itself.",
  },
  {
    text: "no exec, no spawn, no network, no filesystem write in the evaluator",
    status: "MEASURED",
    how: "grep for child_process, fetch, http, fs across the evaluator sources",
    falls: "Any of those names appearing in an evaluator source. A grep cannot see an indirect call built at runtime, so it falls to eval or to require of a computed name — neither of which is present, and neither of which this check would catch.",
  },
  {
    text: "novelty of the narrow mechanism",
    patterns: ["novel in the literature", "patent novelty"],
    status: "QUARANTINE",
    how:
      "The owner's originality-status file, 28 July 2026, in his wording: " +
      "it has not been checked whether this narrow mechanism is new in the " +
      "scientific or patent literature.",
    falls:
      "A prior-art search. One paper or patent stating the same narrow " +
      "mechanism sinks it; a search finding none does not establish it, " +
      "because absence of a find is not absence of prior art.",
  },
  {
    text: "a person's work history",
    status: "SUBJECT",
    how:
      "Only the person can confirm it. Confirm with them before publishing " +
      "any part of it; a file is a source for what was said, not for what is true.",
  },
  {
    text: "a test count in a supplied evidence record",
    status: "SUPPLIED",
    how: "the supplied record; version-specific; not executed here",
  },
];

/** Documents that carry claims outward and are therefore checked. */
function defaultTargets(root) {
  // Scanning two files by hand was the same mistake in miniature: a checker
  // whose reach is narrower than the claims it guards. Every tracked text
  // document is scanned, so a retracted claim cannot survive by moving.
  const { execFileSync } = require("node:child_process");
  try {
    return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(md|txt|html|json)$/.test(f));
    // The original also exempted, BY NAME, one prompt file whose job was to
    // list the forbidden claims (mention, not use), and two folders produced
    // by generators that were themselves checked for staleness. Those were
    // specific to the original repository and are not carried here.
  } catch {
    return ["README.md"];
  }
}

// Both are forbidden in an outward document, for different reasons, and the
// scanner treats them the same way on purpose: a claim in quarantine that
// travels is exactly as published as a retracted one.
const RETRACTED = CLAIMS.filter(
  (c) => c.status === "RETRACTED" || c.status === "QUARANTINE");

// Narrow on purpose. "not the" was in the first version and would have
// exempted almost any sentence containing a negation, which is how a detector
// stops detecting. Only words that state a retraction.
const RETRACTING =
  /retracted|withdrawn|superseded|overstated|correction|P-[0-9]|quarantin|not checked/i;

function scan(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { file, missing: true, hits: [] };
  }
  const hits = [];
  const lines = text.split("\n");

  // The seventh detector fix of one day, and the best: the commit hook
  // stopped a commit because a document containing the WHOLE code held the
  // retracted claims — they are this file's own data. The register saw a
  // retracted claim in a tracked document, which is technically true and
  // means the opposite: this is the file that says "do not write this".
  //
  // Source code quoted in a fenced block with a named language is SOURCE, not
  // a claim. Narrow on purpose — only blocks with a language (```js). A bare
  // ``` block is not exempt, because it may hold output or a quote that claims.
  const inSource = new Array(lines.length).fill(false);
  {
    let open = -1;
    lines.forEach((l, i) => {
      const m = /^\s*```(\w+)?\s*$/.exec(l);
      if (!m) return;
      if (open === -1) { if (m[1]) open = i; return; }
      for (let j = open; j <= i; j++) inSource[j] = true;
      open = -1;
    });
  }
  // Defect #20 showed the limit of the two rules above. A document that
  // RETRACTS a number must show the old one — otherwise the correction is not
  // visible and teaches no one. The old number sits in a bare fenced block,
  // and the word "RETRACTED" is a few lines above, not on the same line. The
  // same-line rule does not catch it, and the source rule does not apply to a
  // bare block.
  //
  // The narrow addition: a bare fenced block INTRODUCED by a line with a
  // retraction word within the six non-empty lines before it is a QUOTE of
  // the retracted claim, not a new assertion of it.
  //
  // Why it is narrow: both are required — a block, and a declared retraction
  // immediately above it. A claim in ordinary text is not exempt. A block
  // without a declaration is not exempt either.
  const inRetractedQuote = new Array(lines.length).fill(false);
  {
    let open = -1;
    lines.forEach((l, i) => {
      // The same rule, two syntaxes: ``` in markdown and <pre> in HTML.
      const md = /^\s*```(\w+)?\s*$/.exec(l);
      const opensPre = /<pre>/.test(l);
      const closesPre = /<\/pre>/.test(l);
      if (!md && !opensPre && !closesPre) return;
      if (open === -1) {
        if ((md && !md[1]) || opensPre) open = i;
        if (opensPre && closesPre) { /* one-line <pre> */ } else return;
      }
      let seen = 0;
      for (let j = open - 1; j >= 0 && seen < 6; j--) {
        if (!lines[j].trim()) continue;
        seen++;
        if (RETRACTING.test(lines[j])) {
          for (let q = open; q <= i; q++) inRetractedQuote[q] = true;
          break;
        }
      }
      open = -1;
    });
  }

  for (const c of RETRACTED) {
    // The first version of this matched the claim's FIRST WORD, which made a
    // retracted biography line fire on the word "attending" and a job title
    // fire on any line mentioning AI. A checker built to catch unfounded
    // claims was producing unfounded claims — the same defect it exists to
    // find, in itself, on its first run.
    //
    // Each retracted claim now carries an explicit pattern: the exact string
    // that would only appear if the claim itself were being made. A document
    // that RETRACTS a claim must quote it, and quoting it is not making it: a
    // line is a citation, not an assertion, when it carries an explicit
    // retraction word on the same line.
    for (const p of c.patterns || []) {
      const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const line = lines.findIndex(
        (l, i) => re.test(l) && !RETRACTING.test(l) && !inSource[i] &&
                  !inRetractedQuote[i]);
      if (line !== -1) {
        hits.push({ claim: c, line: line + 1, matched: p });
        break;
      }
    }
  }
  return { file, missing: false, hits };
}

function check(args, root = process.cwd()) {
  const targets = (args.length ? args : defaultTargets(root)).map((t) =>
    path.isAbsolute(t) ? t : path.join(root, t)
  );

  let bad = 0;
  for (const t of targets) {
    const r = scan(t);
    if (r.missing) continue;
    for (const h of r.hits) {
      bad++;
      console.log(`${path.relative(root, t)}:${h.line}`);
      console.log(`  ${h.claim.status} claim: ${h.claim.text}`);
      console.log(`  ${h.claim.how}`);
      if (h.claim.supersededBy) {
        const s = CLAIMS.find((c) => c.text === h.claim.supersededBy);
        console.log(`  Use instead: ${s.text} — ${s.how}`);
      }
      console.log("");
    }
  }
  if (bad) {
    console.log(`${bad} retracted or quarantined claim(s) still present.`);
    return 1;
  }
  console.log("No retracted or quarantined claims found in the scanned documents.");
  return 0;
}

function print() {
  const width = Math.max(...CLAIMS.map((c) => c.text.length));
  console.log("CLAIM REGISTER — what may be published, and on whose word\n");
  for (const s of ["MEASURED", "SUPPLIED", "SUBJECT", "QUARANTINE", "RETRACTED"]) {
    console.log(`${s}`);
    for (const c of CLAIMS.filter((x) => x.status === s)) {
      console.log(`  ${c.text.padEnd(width)}  ${c.how}`);
      if (c.falls) console.log(`  ${" ".repeat(width)}  falls: ${c.falls}`);
      if (c.note) console.log(`  ${" ".repeat(width)}  note: ${c.note}`);
    }
    console.log("");
  }
  console.log("A file is not a source of facts about a person.");
  console.log("It is only a source for what was said.");
  return 0;
}

if (require.main === module) {
  if (process.argv.includes("--check")) {
    const args = process.argv.slice(process.argv.indexOf("--check") + 1);
    process.exit(check(args));
  }
  process.exit(print());
}

module.exports = { CLAIMS, RETRACTED, RETRACTING, scan, check };
