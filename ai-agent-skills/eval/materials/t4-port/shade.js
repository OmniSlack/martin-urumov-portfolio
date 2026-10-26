// Picks a colour shade for a value, by what fraction of the maximum it is.
const SEQ = ["a", "b", "c", "d", "e", "f"];
function seqStep(v, max) {
  if (max <= 0) return SEQ[0];
  return SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * SEQ.length))];
}
module.exports = { seqStep, SEQ };
