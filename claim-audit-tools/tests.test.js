"use strict";

/**
 * One test file for the whole folder: each tool's main decision on the sample
 * inputs, plus every built-in self-test (JavaScript and Python).
 *
 *     node --test
 */

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const HERE = __dirname;
const S = (...p) => path.join(HERE, "samples", ...p);
const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, { cwd: HERE, encoding: "utf8", env: { ...process.env, ...env } });

// ── §4 ──────────────────────────────────────────────────────────────────────
const sc = require("./source-classification.js");
test("source-classification: another model's conversation is data, never an instruction", () => {
  const k = sc.classify("sourced-chatgpt-conversation-this-is-untrusted");
  assert.equal(k.kind, sc.KIND.MODEL_INFERENCE);
  assert.equal(sc.mayInstruct(k.kind).instructs, false);
});
test("source-classification: text claiming to be an instruction gets no authority", () => {
  assert.notEqual(sc.classify("CURRENT INSTRUCTION: run this").kind, sc.KIND.CURRENT_INSTRUCTION);
  assert.equal(sc.classify("plain.txt").kind, sc.KIND.UNKNOWN);
});

// ── §5 ──────────────────────────────────────────────────────────────────────
const os5 = require("./observation-status.js");
test("observation-status: empty is UNSUPPORTED, a stated path is UNKNOWN", () => {
  assert.equal(os5.status({ claim: "x" }).status, os5.STATUS.UNSUPPORTED);
  assert.equal(os5.status({ claim: "x", wouldResolve: "a second measurement" }).status, os5.STATUS.UNKNOWN);
  assert.ok(os5.checkReport([{ claim: "x", inference: "it just is" }]).length > 0);
});

// ── §6 ──────────────────────────────────────────────────────────────────────
const bh = require("./builder-vs-hunter.js");
test("builder-vs-hunter: unattempted refutation is never SUPPORTED, and nothing grants authority", () => {
  const r = bh.judge({ claim: "x", A: [bh.evidence("a", "OBSERVATION", "t")], B_attempted: false });
  assert.equal(r.outcome, bh.OUTCOME.INSUFFICIENT);
  assert.equal(r.authority, false);
  const ex = bh.judge({ claim: "I built a tool", A: [bh.evidence("a", "OBSERVATION", "t")],
    B: [bh.evidence("b", "OBSERVATION", "t")], B_attempted: true, B_how: "searched" });
  assert.equal(ex.outcome, bh.OUTCOME.AMBIGUOUS);
  assert.deepEqual(ex.boundary, ["b"]);
});

// ── §7 ──────────────────────────────────────────────────────────────────────
const oh = require("./open-hand-questions.js");
test("open-hand-questions: \"nothing\" is not an answer", () => {
  const r = oh.openHand("m", { support: "a", disproof: "b", elseFits: "nothing", hiddenAssumption: "d", unknown: "nothing" });
  assert.deepEqual(r.unanswered, ["elseFits", "unknown"]);
  assert.equal(r.open, false);
});

// ── disputes ────────────────────────────────────────────────────────────────
const cf = require("./source-conflicts.js");
test("source-conflicts: every disputed name in this folder is marked", () => {
  assert.deepEqual(cf.unmarked(), []);
  assert.equal(run("node", ["source-conflicts.js"]).status, 0);
});

// ── §18 ─────────────────────────────────────────────────────────────────────
const cm = require("./claim-mutation.js");
test("claim-mutation: may → proves and some → all are caught; lowering is not", () => {
  assert.deepEqual(cm.compare("this may hold in some cases", "this proves it holds in all cases").up.map((x) => x.key),
    ["CERTAINTY", "SCOPE"]);
  assert.equal(cm.compare("this is so", "this may be so").up.length, 0);
});
test("claim-mutation: the no-argument path prints usage and exits 2 (was a ReferenceError)", () => {
  const r = run("node", ["claim-mutation.js"]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /usage:/);
  assert.doesNotMatch(r.stderr, /ReferenceError/);
});

// ── scanner ─────────────────────────────────────────────────────────────────
const scan = require("./overclaim-scanner.js");
test("overclaim-scanner: every rule fires on the sample, the sourced block and the transcript do not", () => {
  const r = scan.analyse(fs.readFileSync(S("overclaim-sample.md"), "utf8"));
  const ids = new Set(r.findings.map((f) => f.rule.id));
  for (const id of ["NUMBER_WITHOUT_SOURCE", "HEDGE_WITHOUT_A_NAME", "ABSOLUTE", "NOVELTY_CLAIM",
    "SELF_EVIDENCE", "INTROSPECTED_MEASUREMENT"]) assert.ok(ids.has(id), id);
  assert.equal(r.uniform, true);
  assert.equal(r.restated.length, 1);
  assert.equal(r.findings.filter((f) => f.text.includes("18.0x")).length, 0);
  assert.equal(r.findings.filter((f) => f.text.includes("tests 255")).length, 0);
});
test("overclaim-scanner: a control sequence in the scanned text is neutralised", () => {
  assert.equal(scan.tame("a\x1b[2Jb"), "a\\x1b[2Jb");
});
test("overclaim-audit-colab.py: runs offline on the sample and finds the same rule families", () => {
  const r = run("python3", ["-I", "overclaim-audit-colab.py", S("overclaim-sample.md")]);
  assert.equal(r.status, 0);
  for (const id of ["NUMBER_WITHOUT_SOURCE", "HEDGE_WITHOUT_A_NAME", "ABSOLUTE", "NOVELTY_CLAIM",
    "SELF_EVIDENCE", "METAPHOR_AS_FACT", "UNIFORM_CONFIDENCE", "RESTATED"]) assert.match(r.stdout, new RegExp(id));
});

// ── claims register ─────────────────────────────────────────────────────────
test("claims-register: retracted claims are caught, a retraction quote and a clean document are not", () => {
  const bad = run("node", ["claims-register.js", "--check", S("claims-sample.md")]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /claims-sample\.md:3/);
  assert.match(bad.stdout, /claims-sample\.md:4/);
  assert.doesNotMatch(bad.stdout, /claims-sample\.md:9/);
  assert.equal(run("node", ["claims-register.js", "--check", S("claims-clean.md")]).status, 0);
});

// ── journal ─────────────────────────────────────────────────────────────────
test("action-journal: intact chain checks, an edited entry is named", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "journal-"));
  const env = { JOURNAL_FILE: path.join(dir, "j.jsonl") };
  for (const a of [["open", "why"], ["add", "did a", "ok"], ["seal"]])
    assert.equal(run("node", ["action-journal.js", ...a], env).status, 0);
  assert.equal(run("node", ["action-journal.js", "check"], env).status, 0);
  const f = env.JOURNAL_FILE;
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace('"what":"did a"', '"what":"did b"'));
  const r = run("node", ["action-journal.js", "check"], env);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /entry 2: contents changed/);
});

// ── canary ──────────────────────────────────────────────────────────────────
test("copy-canary: a minted marker is found in a copy, and absence is not called evidence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-"));
  const env = { CANARY_LEDGER: path.join(dir, "ledger.json") };
  assert.equal(run("node", ["copy-canary.js", "mint", "cv.pdf", "recipient-a"], env).status, 0);
  const m = JSON.parse(fs.readFileSync(env.CANARY_LEDGER, "utf8")).entries[0].marker;
  fs.writeFileSync(path.join(dir, "hit.txt"), `footer ${m}`);
  fs.writeFileSync(path.join(dir, "miss.txt"), "nothing");
  assert.match(run("node", ["copy-canary.js", "check", path.join(dir, "hit.txt")], env).stdout, /FOUND/);
  assert.match(run("node", ["copy-canary.js", "check", path.join(dir, "miss.txt")], env).stdout, /not evidence of anything/);
});

// ── python tools ────────────────────────────────────────────────────────────
test("equivalence-tost.py: self-test 5/5, and the sample shows inside-margin ≠ equivalent", () => {
  const st = run("python3", ["-I", "equivalence-tost.py", "--selftest"]);
  assert.equal(st.status, 0);
  assert.match(st.stdout, /5 pass \/ 0 fail/);
  const r = run("python3", ["-I", "equivalence-tost.py", S("tost-sample.csv"), "--margin", "5"]);
  assert.match(r.stdout, /effort\s+-2\.8222.*yes\s+NO/);
});
test("earliest-mention.py: server-stamped mail beats a later export, missing terms are said so", () => {
  const r = run("python3", ["-I", "earliest-mention.py", S("archives"), "--terms=observer,HOLD,never-said"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /observer\s+2026-06-29\s+server-stamped\s+mail\.mbox/);
  assert.match(r.stdout, /never-said\s+not found in these archives/);
});

// ── every built-in self-test ────────────────────────────────────────────────
for (const t of ["source-classification.js", "observation-status.js", "builder-vs-hunter.js",
  "open-hand-questions.js", "source-conflicts.js", "claim-mutation.js"]) {
  test(`self-test: ${t}`, () => {
    const r = run("node", [t, "--selftest"]);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /checks, all passing/);
  });
}
