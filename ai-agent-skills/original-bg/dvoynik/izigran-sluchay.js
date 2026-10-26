// ОРИГИНАЛЪТ — негов код от OmniMax, показан на 21.09.2026
const SEQ = ["a","b","c","d","e","f"];
function seqStepka(v, max) {
  if (max <= 0) return SEQ[0];
  return SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * SEQ.length))];
}

// ДВОЙНИКЪТ — писан от описанието „взема нюанса според това каква част е
// от най-голямата“, без да е гледан клампът.
function dvoynik(v, max) {
  if (max <= 0) return SEQ[0];
  return SEQ[Math.floor((v / max) * SEQ.length)];
}

// 1 · СЛУЧАЙНИ ВХОДОВЕ — така се „доказва“ съвпадение обикновено
let razminavaniya = 0, probi = 0;
for (let i = 0; i < 10000; i++) {
  const max = Math.random() * 100;
  const v = Math.random() * max;
  probi++;
  if (seqStepka(v, max) !== dvoynik(v, max)) razminavaniya++;
}
console.log(`СЛУЧАЙНИ:  ${probi} проби · ${razminavaniya} разминавания`);

// 2 · РЪБОВЕТЕ — търсено нарочно, не на късмет
const rubove = [[0,10],[10,10],[9.999999,10],[10,0],[-1,10],[5,10],[1e-300,1]];
console.log("\nРЪБОВЕ:");
let namereni = 0;
for (const [v,max] of rubove) {
  const a = seqStepka(v,max), b = dvoynik(v,max);
  const ok = a === b;
  if (!ok) namereni++;
  console.log(`  ${ok?"съвпада ":"РАЗМИНАВА"}  v=${String(v).padEnd(10)} max=${String(max).padEnd(4)}  оригинал=${a}  двойник=${b}`);
}
console.log(`\nСлучайните: 0 разминавания. Ръбовете: ${namereni}.`);
