// Worked example for the reimplementation-check skill.
// English copy of izigran-sluchay.js (original in ../../original-bg/dvoynik/).
// Change from the original: Math.random() replaced by a seeded generator,
// so that the output is the same on every run.
//
// Run: node worked-example.js

// THE ORIGINAL — the owner's code from another project, shown 2026-09-21
const SEQ = ["a", "b", "c", "d", "e", "f"];
function seqStep(v, max) {
  if (max <= 0) return SEQ[0];
  return SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * SEQ.length))];
}

// THE REIMPLEMENTATION — written from the description "takes the shade by
// what fraction of the largest it is", without seeing the clamp.
function reimplementation(v, max) {
  if (max <= 0) return SEQ[0];
  return SEQ[Math.floor((v / max) * SEQ.length)];
}

// mulberry32: small seeded PRNG, deterministic across runs
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(seed = 20260921) {
  const rnd = mulberry32(seed);
  // 1 · RANDOM INPUTS — how a match is usually "proven"
  let randomMismatches = 0, samples = 0;
  for (let i = 0; i < 10000; i++) {
    const max = rnd() * 100;
    const v = rnd() * max;
    samples++;
    if (seqStep(v, max) !== reimplementation(v, max)) randomMismatches++;
  }
  // 2 · EDGES — searched on purpose, not by luck
  const edges = [[0, 10], [10, 10], [9.999999, 10], [10, 0], [-1, 10], [5, 10], [1e-300, 1]];
  const rows = edges.map(([v, max]) => {
    const a = seqStep(v, max), b = reimplementation(v, max);
    return { v, max, original: a, reimplementation: b, match: a === b };
  });
  return { samples, randomMismatches, rows, edgeMismatches: rows.filter((r) => !r.match).length };
}

if (require.main === module) {
  const r = run();
  console.log(`RANDOM:  ${r.samples} samples · ${r.randomMismatches} mismatches`);
  console.log("\nEDGES:");
  for (const x of r.rows)
    console.log(`  ${x.match ? "match    " : "MISMATCH "}  v=${String(x.v).padEnd(10)} max=${String(x.max).padEnd(4)}  original=${x.original}  reimplementation=${x.reimplementation}`);
  console.log(`\nRandom: ${r.randomMismatches} mismatches. Edges: ${r.edgeMismatches}.`);
}

module.exports = { seqStep, reimplementation, run };
