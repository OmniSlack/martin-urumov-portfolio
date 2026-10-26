// Tests for ai-agent-skills.  Run: node --test
// What these check: the files are well-formed skills, the copies are complete,
// every link resolves, the originals are byte-identical to the source, and the
// worked example gives the result the skill states.
// What they do NOT check: that a skill changes a model's behaviour (see README, Limitations).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HERE = __dirname;
const SKILLS = path.join(HERE, "skills");
const ORIG = path.join(HERE, "original-bg");
const COPIES = {
  "claim-discipline": "omniecho",
  "report-scope": "nemoga",
  "distinguishing-observation": "razdelyashto",
  "measured-values-report": "izmerimo",
  "reimplementation-check": "dvoynik",
};
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

test("exactly the five chosen skills are present, each from one original", () => {
  assert.deepStrictEqual(fs.readdirSync(SKILLS).sort(), Object.keys(COPIES).sort());
  assert.deepStrictEqual(fs.readdirSync(ORIG).sort(), Object.values(COPIES).sort());
});

test("the excluded skill is not carried, in any form", () => {
  const all = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.join(d, e.name)));
  walk(HERE);
  assert.ok(!all.some((p) => /nablyudatel/.test(p)));
});

for (const name of Object.keys(COPIES)) {
  test(`${name}: frontmatter name matches the folder, description present and under 1024 characters`, () => {
    const fm = frontmatter(fs.readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8"));
    assert.ok(fm, "frontmatter missing");
    assert.strictEqual(fm.name, name);
    assert.ok(fm.description && fm.description.length > 40 && fm.description.length < 1024);
  });

  test(`${name}: the English copy contains no Cyrillic`, () => {
    const t = fs.readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8");
    assert.ok(!/[Ѐ-ӿ]/.test(t), "Cyrillic found");
  });

  test(`${name}: every relative link resolves to a file in this repository`, () => {
    const dir = path.join(SKILLS, name);
    const t = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    const links = [...t.matchAll(/\]\((\.\.?\/[^)\s]+)\)|`(\.\.\/[^`\s]+)`/g)].map((m) => m[1] || m[2]);
    for (const l of links) {
      const p = path.resolve(dir, l.replace(/<.*$/, ""));
      assert.ok(fs.existsSync(p), `${l} does not resolve`);
    }
  });

  test(`${name}: names the authorship split`, () => {
    const t = fs.readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8");
    assert.match(t, /Rules and quoted requirements: Martin Urumov\. Wording of this skill: AI assistant\./);
  });
}

test("originals are byte-identical to the source commit (hashes from PROVENANCE.md)", () => {
  const prov = fs.readFileSync(path.join(HERE, "PROVENANCE.md"), "utf8");
  let checked = 0;
  for (const m of prov.matchAll(/^\| \.claude\/skills\/(\S+) \| ([0-9a-f]{64}) \| original-bg\/\1 \|/gm)) {
    assert.strictEqual(sha(path.join(ORIG, m[1])), m[2], m[1]);
    checked++;
  }
  assert.strictEqual(checked, 6, "expected six original files in PROVENANCE.md");
});

test("worked example: random inputs find nothing, one searched edge breaks the copy", () => {
  const { run } = require("./skills/reimplementation-check/worked-example.js");
  const r = run();
  assert.strictEqual(r.samples, 10000);
  assert.strictEqual(r.randomMismatches, 0);
  assert.strictEqual(r.edgeMismatches, 1);
  const bad = r.rows.find((x) => !x.match);
  assert.deepStrictEqual([bad.v, bad.max, bad.original, bad.reimplementation], [10, 10, "f", undefined]);
});

test("worked example: the defect in the original — a negative value is not guarded", () => {
  const { seqStep, reimplementation } = require("./skills/reimplementation-check/worked-example.js");
  assert.strictEqual(seqStep(-1, 10), undefined);
  assert.strictEqual(reimplementation(-1, 10), undefined);
});

test("worked example: the English copy computes exactly what the original computes", () => {
  // load the original's two functions without running its random section
  const src = fs.readFileSync(path.join(ORIG, "dvoynik", "izigran-sluchay.js"), "utf8");
  const head = src.split("// 1 ·")[0];
  const orig = new Function(head + "\nreturn { seqStepka, dvoynik };")();
  const copy = require("./skills/reimplementation-check/worked-example.js");
  const inputs = [[0, 10], [10, 10], [9.999999, 10], [10, 0], [-1, 10], [5, 10], [1e-300, 1], [3, 7], [99, 100], [7, 7]];
  for (const [v, m] of inputs) {
    assert.strictEqual(copy.seqStep(v, m), orig.seqStepka(v, m));
    assert.strictEqual(copy.reimplementation(v, m), orig.dvoynik(v, m));
  }
});
