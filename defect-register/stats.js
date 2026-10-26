"use strict";

/**
 * Counts over the register: by family, by finder, by date, by id prefix.
 *
 *   node stats.js
 */

const R = require("./register.js");

function count(list, keyFn) {
  const m = new Map();
  for (const g of list) m.set(keyFn(g), (m.get(keyFn(g)) || 0) + 1);
  return m;
}

const n = R.REGISTER.length;
console.log(`DEFECT REGISTER — ${n} entries, ${R.FAMILY_LIST.length} families\n`);

console.log("By finder (self-reported, see README):");
for (const [k, v] of count(R.REGISTER, (g) => g.found_by))
  console.log(`  ${k.padEnd(11)} ${String(v).padStart(3)}  (${(100 * v / n).toFixed(1)}%)`);

console.log("\nBy family (largest first):");
for (const [k, l] of R.byFamily()) {
  const h = l.filter((g) => g.found_by === "human").length;
  console.log(`  ${String(l.length).padStart(3)}  ${k.padEnd(40)} human ${String(h).padStart(2)} · instrument ${String(l.length - h).padStart(2)}`);
}
const empty = R.FAMILY_LIST.filter((f) => !R.REGISTER.some((g) => g.family === f.key));
console.log(`  ${String(0).padStart(3)}  ${empty.map((f) => f.key).join(", ")}  (defined, no case yet)`);

console.log("\nBy date:");
const byDate = [...count(R.REGISTER, (g) => g.date)].sort((a, b) => a[0].localeCompare(b[0]));
for (const [d, v] of byDate)
  console.log(`  ${d}  ${String(v).padStart(3)}  ${"█".repeat(Math.ceil(v / 3))}`);
const [maxDay, maxN] = byDate.reduce((a, b) => (b[1] > a[1] ? b : a));
console.log(`  ${byDate.length} distinct days · busiest ${maxDay}: ${maxN} of ${n} (${(100 * maxN / n).toFixed(1)}%)`);

console.log("\nBy id prefix:");
const prefix = (g) => (g.id.startsWith("#") ? "#" : g.id.split("-")[0] + "-");
const meaning = {
  "P-": "pre-repository errors, July 2026 (CV texts), found by Martin",
  "#":  "numbered defects of the evaluator code (#1 … #25), as in its README",
  "M-": "Martin's own errors, recorded at his request (\"write mine too\"), mostly found by the instrument",
  "B-": "the running series from 19 September 2026 on (meaning of the letter not stated in the source)",
};
for (const [k, v] of count(R.REGISTER, prefix))
  console.log(`  ${k.padEnd(3)} ${String(v).padStart(3)}  ${meaning[k] || ""}`);

const oh = R.openHand();
console.log(`\nOpen hand A/(A+B) = ${oh.A}/${oh.A + oh.B} = ${oh.result.toFixed(4)} · threshold ${oh.threshold} · ${oh.fails ? "below" : "above"}`);
