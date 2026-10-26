"use strict";

/**
 * Tests for the English defect register.
 *
 *   node --test
 *
 * The equivalence tests compare this port against fixtures/original-helper-outputs.json,
 * which holds the outputs of the ORIGINAL helpers (verify/greshki.js @ 848ae1a), run
 * unmodified on the original Bulgarian data, with ids transliterated and keys mapped
 * to English. The Bulgarian probe strings in the fixture are stored as \u escapes.
 */

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const R = require("./register.js");
const { EXCEPTIONS } = require("./filters.js");

const ORIG = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "original-helper-outputs.json"), "utf8"));

// ---------- the data ----------

test("165 entries, unique ids, in the original order", () => {
  assert.equal(R.REGISTER.length, 165);
  assert.equal(new Set(R.REGISTER.map((g) => g.id)).size, 165);
  assert.deepEqual(R.REGISTER.map((g) => g.id), ORIG.ids);
});

test("found_by: 51 human, 114 instrument — and per entry as in the original", () => {
  const h = R.REGISTER.filter((g) => g.found_by === "human").length;
  const i = R.REGISTER.filter((g) => g.found_by === "instrument").length;
  assert.equal(h, 51);
  assert.equal(i, 114);
  for (const g of R.REGISTER) assert.equal(g.found_by, ORIG.found_by[g.id], g.id);
});

test("22 families defined, the same set as the original", () => {
  assert.equal(R.FAMILY_LIST.length, 22);
  assert.deepEqual(R.FAMILY_LIST.map((f) => f.key), ORIG.families_defined);
});

test("every entry's family exists, and is the original one", () => {
  for (const g of R.REGISTER) {
    assert.ok(R.FAMILIES[g.family], `${g.id}: unknown family ${g.family}`);
    assert.equal(g.family, ORIG.family_of[g.id], g.id);
  }
});

test("detectors: the same five, and every entry's detector is the original one", () => {
  assert.deepEqual(Object.keys(R.DETECTORS), ORIG.detectors);
  const mine = Object.fromEntries(R.REGISTER.filter((g) => g.detector).map((g) => [g.id, g.detector]));
  assert.deepEqual(mine, ORIG.detector_of);
});

test("every entry is complete: what, form (> 30 chars), how_found, date", () => {
  for (const g of R.REGISTER) {
    assert.ok(g.what && g.form && g.form.length > 30 && g.how_found && g.date, g.id);
  }
});

test("no Cyrillic in the data files", () => {
  for (const f of ["register.json", "families.json"]) {
    const s = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert.equal((s.match(/[\u0400-\u04ff]/g) || []).length, 0, f);
  }
});

// ---------- equivalence of the helpers ----------

test("openHand() equals the original otvorena_dlan()", () => {
  const oh = R.openHand();
  assert.equal(oh.A, ORIG.open_hand.A);
  assert.equal(oh.B, ORIG.open_hand.B);
  assert.equal(oh.result, ORIG.open_hand.result);
  assert.equal(oh.threshold, ORIG.open_hand.threshold);
  assert.equal(oh.fails, ORIG.open_hand.fails);
  assert.deepEqual(oh.instrument, ORIG.open_hand.instrument);
  assert.deepEqual(oh.human, ORIG.open_hand.human);
  const own = R.openHand(R.REGISTER.filter((g) => !g.id.startsWith("M-")));
  assert.deepEqual({ A: own.A, B: own.B, result: own.result, fails: own.fails }, ORIG.open_hand_without_M);
  assert.equal(R.openHand([]).result, ORIG.open_hand_empty);
});

test("oldNew() equals the original star_nov()", () => {
  const on = R.oldNew();
  assert.equal(R.NEW_FROM, ORIG.new_from);
  assert.deepEqual(on.old.map((g) => g.id), ORIG.old_new.old);
  assert.deepEqual(on.new.map((g) => g.id), ORIG.old_new.new);
  assert.equal(on.undated.length, ORIG.old_new.undated);
  assert.equal(on.uncovered, ORIG.old_new.uncovered);
});

test("byFamily() equals the original po_semeystva(): same groups, same order", () => {
  assert.deepEqual(R.byFamily().map(([k, l]) => [k, l.map((g) => g.id)]), ORIG.by_family);
});

test("compare() equals the original sravni() on the same nine inputs (Bulgarian and code)", () => {
  for (const c of ORIG.compare) {
    const mine = R.compare(c.input).findings.map((f) => ({
      family: f.family, exceptions: f.possible_exception.map((x) => x.id) }));
    assert.deepEqual(mine, c.findings, c.input);
  }
});

// ---------- compare() returns the known family for the original cases ----------

const CASES = [
  ["#18", "COUNTING_NAMES_NOT_THINGS",     "The site says 19 gates; the code has 14 gates."],
  ["B-6", "COUNTING_NAMES_NOT_THINGS",     "There are 21 defects. Recount: 20 defects."],
  ["#22", "DETECTOR_THAT_DOES_NOT_DETECT", "const re = /\\b\u043e\u0447\u0435\u0432\u0438\u0434\u043d\u043e\\b/gi;"],
  ["#16", "LOOKS_LIKE_PROTECTION",         "if (proposal.approved) { dispatch(); }"],
  ["#21", "PRECISION_THAT_IS_NOT_PRECISE", "const s = journal.reduce((a, x) => a + x.amount, 0); if (s > limit) refuse();"],
  ["#24", "MEASUREMENT_INCLUDES_ITSELF",   "const f = execSync('git ls-files'); fs.writeFileSync('count.txt', String(n));"],
  ["#7",  "DETECTOR_THAT_DOES_NOT_DETECT", "test('walk', () => { walk(); });"],
];

for (const [id, family, input] of CASES) {
  test(`compare() returns ${family} for a reproduction of ${id}`, () => {
    const entry = R.REGISTER.find((g) => g.id === id);
    assert.ok(entry, id);
    assert.equal(entry.family, family, `${id} is recorded under ${entry.family}`);
    const fams = R.compare(input).findings.map((f) => f.family);
    assert.ok(fams.includes(family), `${id}: got ${JSON.stringify(fams)}`);
  });
}

test("clean text gives no finding", () => {
  assert.deepEqual(R.compare("The function reads the journal and returns the sum.").findings, []);
});

test("exceptions mark a finding, they never silence it (B-9)", () => {
  const r = R.compare("We have 139 checks from the broad suite and 11 checks from the narrow probes.");
  assert.equal(r.findings.length, 1);
  assert.deepEqual(r.findings[0].possible_exception.map((x) => x.id), ["I-1", "I-2"]);
  assert.equal(EXCEPTIONS.length, 3);
});

test("the module's own self-test passes", () => {
  const log = console.log; console.log = () => {};
  try { assert.equal(R.selftest(), 0); } finally { console.log = log; }
});
