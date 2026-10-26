"use strict";

/**
 * DEFECT REGISTER — every new case is compared against it.
 *
 * English port of `verify/greshki.js` (omniecho-core @ 848ae1a). The data —
 * 165 entries in 22 families — lives in register.json and families.json; this
 * module keeps the behaviour of the original helpers:
 *
 *   compare(text)      original `sravni`      — run every machine-detectable form against a new text
 *   byFamily()         original `po_semeystva` — entries grouped by family, largest first
 *   openHand(list)     original `otvorena_dlan` — A / (A + B) against the 0.67 threshold
 *   oldNew(list)       original `star_nov`    — before / from NEW_FROM, with a coverage check
 *   NEW_FROM           original `NOVO_OT`
 *   FOUND_BY           original `KOY`          — "instrument" (original YADRO, the Core) / "human" (CHOVEK)
 *   DETECTORS          original `D`
 *
 * Why the register exists, in Martin Urumov's words (20 September 2026, translated):
 *   "This is not a defect, it is data collection, it is experience!! Describe what is
 *    right, and a new document for all the errors, against which everything is always
 *    compared."
 *
 * A claim is one-off. A FORM comes back. The register keeps forms, not only cases.
 *
 *   node register.js                 # the whole register
 *   node register.js --families      # the families only
 *   node register.js --compare FILE  # check a new file against every detector
 *   node register.js --selftest
 *
 * Bulgarian words in the detectors are written as \u escapes so that the
 * detectors keep firing on the original Bulgarian text (equivalence with the
 * original) while also firing on English.
 */

const fs = require("node:fs");
const path = require("node:path");
const { line } = require("./confidence-scale.js");

const REGISTER = JSON.parse(fs.readFileSync(path.join(__dirname, "register.json"), "utf8"));
const FAMILY_LIST = JSON.parse(fs.readFileSync(path.join(__dirname, "families.json"), "utf8"));
const FAMILIES = Object.fromEntries(FAMILY_LIST.map((f) => [f.key, f]));

const FOUND_BY = Object.freeze({ INSTRUMENT: "instrument", HUMAN: "human" });

// ───────────────────────────────────────────────────────────────────────────
// DETECTORS — only where the form is machine-detectable. Each key, upper-cased,
// is the key of the family it belongs to.
// ───────────────────────────────────────────────────────────────────────────

const BG_COUNT_WORDS = "\u0433\u0435\u0439\u0442\u0430|\u0433\u0435\u0439\u0442\u043e\u0432\u0435|" +
  "\u0434\u0435\u0444\u0435\u043a\u0442\u0430|\u0434\u0435\u0444\u0435\u043a\u0442\u0438|" +
  "\u043f\u0440\u0430\u0432\u0438\u043b\u0430|\u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438";
const BG_LIMIT_WORDS = "\u0433\u0440\u0430\u043d\u0438\u0446\u0430|\u043b\u0438\u043c\u0438\u0442|\u043f\u0440\u0430\u0433";
const BG_APPROVAL_STEMS = "\u043e\u0434\u043e\u0431\u0440|\u0440\u0430\u0437\u0440\u0435\u0448";

/** Normalise a counted word so that singular and plural are one name. */
function countKey(word) {
  const w = word.toLowerCase();
  return /^[a-z]+$/.test(w) ? w.replace(/s$/, "") : w.slice(0, 5);   // Bulgarian: as in the original
}

const DETECTORS = {
  /** The highest number, reported as a count. (#18, B-6) */
  counting_names_not_things(t) {
    const n = [];
    const re = new RegExp(`(\\d+)\\s+(gates?|defects?|rules?|checks?|${BG_COUNT_WORDS})`, "gi");
    const byWord = new Map();
    let m;
    while ((m = re.exec(t)) !== null) {
      const k = countKey(m[2]);
      if (!byWord.has(k)) byWord.set(k, new Set());
      byWord.get(k).add(m[1]);
    }
    for (const [k, v] of byWord)
      if (v.size > 1)
        n.push(`"${k}…" gets ${v.size} different numbers: ${[...v].join(", ")} — ` +
               `one of them may be the highest NUMBER, not the count`);
    return n;
  },

  /** A limit declared exact over an accumulated sum. (#21) */
  precision_that_is_not_precise(t) {
    const n = [];
    if (/\breduce\s*\(\s*\([^)]*\)\s*=>\s*\w+\s*\+/.test(t) &&
        new RegExp(`limit|threshold|bound|${BG_LIMIT_WORDS}`, "i").test(t))
      n.push("naive summation with `reduce` in code that talks about a limit — " +
             "defect #21: the error grows with the number of terms");
    return n;
  },

  /** `\b` around Cyrillic — never matches. (#22, B-27, B-92) */
  detector_that_does_not_detect(t) {
    const n = [];
    const re = /\/[^/\n]*\\b[^/\n]*[\u0400-\u04ff][^/\n]*\/[gimsuy]*/g;
    const m = t.match(re);
    if (m) n.push(`${m.length} expression(s) with \\b around Cyrillic — defect #22: ` +
                  `\\b is computed over [A-Za-z0-9_] and never matches. Example: ${m[0]}`);
    if (/\bit\s*\(|\btest\s*\(/.test(t) && !/assert|expect|kazhi|say\(/.test(t))
      n.push("a test without a single assertion — it passes because it looks at nothing");
    return n;
  },

  /** Presence checked instead of content. (#16) */
  looks_like_protection(t) {
    const n = [];
    if (new RegExp(`if\\s*\\(\\s*[\\w.]*(permit|approv|${BG_APPROVAL_STEMS})[\\w.]*\\s*\\)`, "i").test(t))
      n.push("the PRESENCE of a permission is checked, not its content — " +
             "defect #16: an object that only SAYS \"approved\" got past fourteen checks");
    return n;
  },

  /** A generator that reads its own output. (#24) */
  measurement_includes_itself(t) {
    const n = [];
    if (/git.{0,20}(grep|ls-files)/.test(t) &&
        /writeFileSync|write_text|\.write\(/.test(t) &&
        !/exclude|filter\(|startsWith/.test(t))
      n.push("a generator that reads the repository AND writes to it, without an exclusion — " +
             "defect #24: the measurement includes the document that reports it");
    return n;
  },
};

// ───────────────────────────────────────────────────────────────────────────
// COMPARE — B-9: exceptions are consulted and MARK a finding; they never silence it.
// Loaded lazily, as in the original (the two files point at each other there).
// ───────────────────────────────────────────────────────────────────────────

function exceptionsFor(detectorKey) {
  try {
    const { EXCEPTIONS } = require("./filters.js");
    return EXCEPTIONS.filter((x) => x.triggers === detectorKey);
  } catch {
    return [];
  }
}

function compare(text, name = "text") {
  const findings = [];
  for (const [key, fn] of Object.entries(DETECTORS))
    for (const n of fn(text)) {
      const exc = exceptionsFor(key);
      findings.push({
        family: key.toUpperCase(), text: n,
        possible_exception: exc.map((x) => ({ id: x.id, what: x.what, distinguishes: x.how_to_distinguish })),
      });
    }
  return { name, findings };
}

// ───────────────────────────────────────────────────────────────────────────
// OLD versus NEW — B-103: the buckets must cover the list, and say so if they do not.
// ───────────────────────────────────────────────────────────────────────────

const NEW_FROM = "2026-09-20";

function oldNew(list = REGISTER) {
  const old = list.filter((g) => g.date && g.date < NEW_FROM);
  const recent = list.filter((g) => g.date && g.date >= NEW_FROM);
  const undated = list.filter((g) => !g.date);
  const uncovered = list.length - (old.length + recent.length + undated.length);
  return { old, new: recent, undated, uncovered };
}

/**
 * THE OPEN HAND — A / (A + B), Martin Urumov's metric (working-rules document v2.26).
 *   A = errors caught by the instrument ON ITS OWN, B = errors caught by the human.
 * Threshold 0.67, set by him on 20 September 2026: "the original, when we broke it,
 * was exactly that." An empty register gives null, not 1.0 — zero errors is not perfection.
 */
function openHand(list = REGISTER) {
  const A = list.filter((g) => g.found_by === FOUND_BY.INSTRUMENT);
  const B = list.filter((g) => g.found_by === FOUND_BY.HUMAN);
  const result = (A.length + B.length) === 0 ? null : A.length / (A.length + B.length);
  return {
    A: A.length, B: B.length, result,
    threshold: 0.67,
    fails: result !== null && result < 0.67,
    instrument: A.map((g) => g.id),
    human: B.map((g) => g.id),
  };
}

function byFamily(list = REGISTER) {
  const m = new Map();
  for (const g of list) {
    if (!m.has(g.family)) m.set(g.family, []);
    m.get(g.family).push(g);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}

function selftest() {
  let failed = 0;
  const k = (ok, s) => { console.log(`${ok ? "ok  " : "FAIL"} ${s}`); if (!ok) failed++; };

  k(REGISTER.every((g) => FAMILIES[g.family]), "S1. every entry points to an existing family");
  k(REGISTER.every((g) => g.form && g.form.length > 30), "S2. every entry carries its FORM, not only the case");
  k(REGISTER.every((g) => g.how_found), "S3. every entry says HOW it was found");
  k(REGISTER.every((g) => !g.detector || DETECTORS[g.detector]), "S4. every named detector exists");
  k(compare("We have 19 gates and 14 gates.").findings.length > 0, "S5. the highest number as a count is caught");
  k(compare("const re = /\\b\u043e\u0447\u0435\u0432\u0438\u0434\u043d\u043e\\b/gi;").findings.length > 0,
    "S6. \\b around Cyrillic is caught");
  k(compare("if (context.humanPermit) { open(); }").findings.length > 0, "S7. presence instead of content is caught");
  k(compare("The function reads the journal and returns the sum.").findings.length === 0, "S8. clean text is not marked");
  const s = byFamily();
  k(s.length >= 5 && s[0][1].length >= 3, `S9. families repeat — the largest has ${s[0] ? s[0][1].length : 0} cases`);
  const oh = openHand();
  k(oh.A + oh.B === REGISTER.length, `S10. every entry is attributed to A or B (${oh.A}+${oh.B}=${REGISTER.length})`);
  k(REGISTER.every((g) => g.found_by === FOUND_BY.INSTRUMENT || g.found_by === FOUND_BY.HUMAN),
    "S11. found_by is explicit everywhere, not guessed from the text");
  k(openHand([]).result === null, "S12. an empty register gives null, not 1.0");
  k(REGISTER.every((g) => g.date), "S13. every entry carries a date");
  const on = oldNew();
  k(on.old.length > 0 && on.new.length > 0 && on.uncovered === 0,
    `S14. old ${on.old.length}, new ${on.new.length}, uncovered ${on.uncovered}`);
  console.log(failed ? `\n${failed} failed.` : "\nall pass.");
  return failed;
}

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a.includes("--selftest")) process.exit(selftest() ? 1 : 0);

  const i = a.indexOf("--compare");
  if (i !== -1) {
    const f = a[i + 1];
    const r = compare(fs.readFileSync(f, "utf8"), f);
    console.log(`COMPARISON AGAINST THE REGISTER — ${r.name}\n`);
    if (!r.findings.length) {
      console.log(line("ESTABLISHED", "not one known form occurs"));
      console.log("\n⚠️ That means NONE OF THE KNOWN ones occurs. New forms this register");
      console.log("   cannot see — it remembers, it does not think.");
      process.exit(0);
    }
    console.log(line("HYPOTHESIS", `${r.findings.length} known forms occur`));
    for (const n of r.findings) {
      const s = FAMILIES[n.family];
      console.log(`\n  ▸ ${s ? s.name : n.family}`);
      console.log(`    ${n.text}`);
      if (s) console.log(`    it comes back because: ${s.why_it_returns}`);
      for (const x of n.possible_exception) {
        console.log(`    ⚠️ possible exception ${x.id} · ${x.what}`);
        console.log(`       told apart like this: ${x.distinguishes}`);
      }
    }
    console.log("");
    process.exit(1);
  }

  if (a.includes("--families")) {
    console.log("FAMILIES OF ERRORS — ordered by frequency\n");
    for (const [key, list] of byFamily()) {
      const s = FAMILIES[key];
      console.log(`${String(list.length).padStart(2)} ×  ${s.name.toUpperCase()}`);
      console.log(`      form: ${s.form}`);
      console.log(`      comes back: ${s.why_it_returns}`);
      console.log(`      cases: ${list.map((g) => g.id).join(", ")}\n`);
    }
    const empty = FAMILY_LIST.filter((f) => !REGISTER.some((g) => g.family === f.key));
    console.log(`${REGISTER.length} recorded cases in ${FAMILY_LIST.length} families ` +
                `(${empty.length} with no case yet: ${empty.map((f) => f.key).join(", ")}).`);
    console.log(`Machine-detectable: ${Object.keys(DETECTORS).length} forms.`);
    process.exit(0);
  }

  console.log("DEFECT REGISTER\n");
  for (const g of REGISTER) {
    console.log(`${g.id.padEnd(6)} ${g.date}  [${g.found_by}]  ${g.what}`);
    console.log(`       form: ${g.form}`);
    console.log(`       found: ${g.how_found}`);
    if (g.detector) console.log(`       detector: ${g.detector}`);
    console.log("");
  }
  const oh = openHand();
  // The honest split: the overall number includes the M- entries (errors of the
  // authority, i.e. Martin's own, found by the instrument), which raise it. The
  // metric asks whether the instrument catches ITS OWN errors — the lower number judges.
  const own = openHand(REGISTER.filter((g) => !g.id.startsWith("M-")));
  const on = oldNew();
  console.log(`${REGISTER.length} cases · ${FAMILY_LIST.length} families · ${Object.keys(DETECTORS).length} detectors\n`);
  console.log("OLD versus NEW");
  console.log(`  before ${NEW_FROM}  : ${String(on.old.length).padStart(3)}`);
  console.log(`  from ${NEW_FROM} on : ${String(on.new.length).padStart(3)}`);
  if (on.uncovered !== 0) console.log(`  🔴 NOT COVERED BY THE BREAKDOWN: ${on.uncovered}`);
  console.log("\nTHE OPEN HAND — A / (A + B)");
  console.log(`  A (instrument, on its own) : ${oh.A}`);
  console.log(`  B (human)                  : ${oh.B}`);
  console.log(`  A / (A + B)                : ${oh.result.toFixed(3)}   threshold ${oh.threshold}   ${oh.fails ? "🔴 below" : "🟢 above"}`);
  console.log(`  own errors only (without M-): A ${own.A} · B ${own.B} · ${own.result.toFixed(3)} ${own.fails ? "🔴 below" : "🟢 above"}`);
  console.log("\n⚠️ found_by is self-reported: the independent second classification is empty.");
  console.log("⚠️ The register REMEMBERS, it does not think. A new form of failure it cannot see.");
}

module.exports = { REGISTER, FAMILIES, FAMILY_LIST, DETECTORS, FOUND_BY, NEW_FROM,
                   compare, byFamily, openHand, oldNew, selftest };
