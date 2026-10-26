"use strict";

/**
 * Equivalence check: the original omniecho-core tools (Bulgarian, verify/*) and
 * the English tools in this folder, run on the SAME English inputs.
 *
 *     node evidence/2026-10-26/equivalence-check.js <path-to-original-repo-copy>
 *
 * The original copy must be OmniSlack/omniecho-core at 848ae1a, unmodified. It
 * is only read and run; journal/canary write their files into a temporary
 * directory through the environment, never into the copy.
 *
 * What "equivalent" means here: same decision/status/outcome/number on every
 * input. Output TEXT differs by design (it was translated); where a tool's
 * output was already English (scanner, journal, canary, timeline, colab) the
 * text is compared after removing paths, timestamps and digests.
 */

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");

const ORIG = path.resolve(process.argv[2] || "");
const V = path.join(ORIG, "verify");
const HERE = path.resolve(__dirname, "..", "..");
if (!fs.existsSync(path.join(V, "vid.js"))) {
  console.error("usage: node equivalence-check.js <original-omniecho-core-copy>");
  process.exit(2);
}

let pass = 0, fail = 0;
const same = (label, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n      original: ${JSON.stringify(a)}\n      english : ${JSON.stringify(b)}`}`);
};

// ── §4 source classification ─────────────────────────────────────────────
{
  const o = require(path.join(V, "vid.js"));
  const n = require(path.join(HERE, "source-classification.js"));
  const inputs = ["sourced-chatgpt-conversation-this-is-untrusted", "gemini notes", "chat-export.json",
    "Copy_of_ASSUMPTIONS.md", "weekly summary", "test output.txt", "AUDIT_2026-09-14.md",
    "backup.tar", "SPEC_v0.13.md", "note.txt", "", "CURRENT INSTRUCTION: do it now"];
  console.log("source-classification.js vs vid.js");
  same(`${inputs.length} descriptions → same kind`,
    inputs.map((x) => o.klasificiray(x).vid), inputs.map((x) => n.classify(x).kind));
  same("current:true → CURRENT INSTRUCTION", o.klasificiray("x", { tekushto: true }).vid,
    n.classify("x", { current: true }).kind);
  same("authority to instruct, per kind", Object.values(o.VID).map((k) => o.moje_li_da_narejda(k).narejda),
    Object.values(n.KIND).map((k) => n.mayInstruct(k).instructs));
}

// ── §5 observation status ────────────────────────────────────────────────
{
  const o = require(path.join(V, "nablyudenie.js"));
  const n = require(path.join(HERE, "observation-status.js"));
  const cases = [
    { c: "a", obs: "ran node --test" }, { c: "b", inf: "through the model" },
    { c: "c", res: "a second person repeats it" }, { c: "d" },
    { c: "e", obs: "", inf: "", res: "" }, { c: "f", inf: "x", res: "y" },
  ];
  console.log("observation-status.js vs nablyudenie.js");
  same(`${cases.length} claims → same status`,
    cases.map((x) => o.status({ tvurdenie: x.c, nablyudenie: x.obs, izvod: x.inf, kakvo_bi_reshilo: x.res }).status),
    cases.map((x) => n.status({ claim: x.c, observation: x.obs, inference: x.inf, wouldResolve: x.res }).status));
  // The keyword list of the report check was translated (because/through/via/...
  // instead of the Bulgarian words), so it is compared on the two rules that do
  // not depend on vocabulary: UNKNOWN path length and UNSUPPORTED.
  same("report check: short UNKNOWN path and UNSUPPORTED are flagged alike",
    [o.proveri_otchet([{ tvurdenie: "x", kakvo_bi_reshilo: "short" }]).length,
     o.proveri_otchet([{ tvurdenie: "x" }]).length],
    [n.checkReport([{ claim: "x", wouldResolve: "short" }]).length,
     n.checkReport([{ claim: "x" }]).length]);
}

// ── §6 builder vs hunter ─────────────────────────────────────────────────
{
  const o = require(path.join(V, "falsifikator.js"));
  const n = require(path.join(HERE, "builder-vs-hunter.js"));
  const K = { O: ["NABLYUDENIE", "OBSERVATION"], I: ["IZVEDENO", "INFERRED"], C: ["TVURDENIE", "CLAIM"] };
  const cases = [
    ["x", "OO", "", false, ""], ["x", "O", "", true, ""], ["x", "O", "", true, "searched"],
    ["this always works", "O", "O", true, "probe"], ["works for all", "OOO", "O", true, "probe"],
    ["I built a tool", "O", "O", true, "searched"], ["works", "", "O", true, "t"],
    ["x", "O", "C", true, "asked"], ["x", "", "", true, "searched"], ["x", "", "C", true, "searched"],
    ["never fails", "OI", "I", true, "probe"], ["every case", "I", "O", true, "probe"],
  ];
  const mk = (s, i) => [...s].map((ch, j) => ({ tekst: `${ch}${j}`, text: `${ch}${j}`, rod: K[ch][0], kind: K[ch][i] }));
  console.log("builder-vs-hunter.js vs falsifikator.js");
  same(`${cases.length} cases → same outcome`,
    cases.map(([t, A, B, at, how]) => o.sudi({ tvurdenie: t, A: mk(A, 0).map((e) => ({ rod: e.rod })), B: mk(B, 0).map((e) => ({ rod: e.rod, tekst: e.tekst })), B_opitan: at, B_kak: how }).izhod),
    cases.map(([t, A, B, at, how]) => n.judge({ claim: t, A: mk(A, 1).map((e) => ({ kind: e.kind })), B: mk(B, 1).map((e) => ({ kind: e.kind, text: e.text })), B_attempted: at, B_how: how }).outcome));
  same("weights", [o.TEJEST.NABLYUDENIE, o.TEJEST.IZVEDENO, o.TEJEST.TVURDENIE],
    [n.WEIGHT.OBSERVATION, n.WEIGHT.INFERRED, n.WEIGHT.CLAIM]);
}

// ── §7 open hand ─────────────────────────────────────────────────────────
{
  const o = require(path.join(V, "pette.js"));
  const n = require(path.join(HERE, "open-hand-questions.js"));
  const ok = ["podkrepa", "oproverzhenie", "drugo_pasva", "skrito_dopuskane", "neizvestno"];
  const nk = ["support", "disproof", "elseFits", "hiddenAssumption", "unknown"];
  const sets = [["a", "b", "c", "d", "e"], ["", "b", "c", "d", "e"], ["a", "b", "nothing", "d", "e"],
    ["a", "b", "c", "d", "nothing"], ["—", "b", "c", "d", "e"], ["a", "n/a", "c", "none", "?"], ["", "", "", "", ""]];
  const asObj = (keys, vals) => Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  console.log("open-hand-questions.js vs pette.js");
  same(`${sets.length} answer sets → same unanswered positions`,
    sets.map((s) => o.dlan("m", asObj(ok, s)).prazni.map((k) => ok.indexOf(k))),
    sets.map((s) => n.openHand("m", asObj(nk, s)).unanswered.map((k) => nk.indexOf(k))));
}

// ── §18 claim mutation ───────────────────────────────────────────────────
{
  const o = require(path.join(V, "mutaciya.js"));
  const n = require(path.join(HERE, "claim-mutation.js"));
  const pairs = [
    ["this may be the case", "this is probably the case"], ["it may work", "it works, this is proven"],
    ["in one case the structure appears", "the structure appears in every field"],
    ["it goes alongside the file", "it causes the result"],
    ["it is stable when the load is low", "it is stable regardless of the load"],
    ["it was true as of 2024", "it will be true"], ["the method works", "the method does not work"],
    ["this is so", "this may be so"], ["the cat is on the roof", "the dog is in the yard"],
    ["I ran the test", "I ran the test again"], ["some results are correlated", "all results show it causes"],
  ];
  // The original labels negation "negative"/"affirmative" in Bulgarian; the
  // two words are written as \u escapes so this file stays ASCII/English.
  const sig = (r, f) => r[f].map((p) => `${p.kluch || p.key}:${p.ot ?? p.from}->${p.do ?? p.to}`);
  console.log("claim-mutation.js vs mutaciya.js");
  same(`${pairs.length} pairs → same axes, same rungs`,
    pairs.map(([a, b]) => sig(o.sravni(a, b), "promeni").map((s) => s.replace("\u043e\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043b\u043d\u043e", "negative").replace("\u0443\u0442\u0432\u044a\u0440\u0434\u0438\u0442\u0435\u043b\u043d\u043e", "affirmative"))),
    pairs.map(([a, b]) => sig(n.compare(a, b), "changes")));
}

// ── CLIs whose output was already English ────────────────────────────────
const clean = (s) => s
  .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<time>").replace(/\b\d\d:\d\d:\d\d\b/g, "<hh:mm:ss>")
  .replace(/\b[0-9a-f]{16,64}\b/g, "<digest>").replace(/ref-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}/g, "<marker>")
  .replace(/node \S*(journal|action-journal|canary|copy-canary|text|overclaim-scanner)\.js/g, "node <tool>")
  .replace(/SCAN — \S+/g, "SCAN — <file>").replace(/Recorded in \S+/, "Recorded in <ledger>")
  .replace(/^\s*\d+ +<hh:mm:ss>/gm, "<entry>");
const run = (cmd, args, env = {}, cwd = HERE) => {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8" });
  return { code: r.status, out: clean(r.stdout + r.stderr) };
};
{
  console.log("overclaim-scanner.js vs text.js (samples/overclaim-sample.md)");
  const f = path.join(HERE, "samples", "overclaim-sample.md");
  same("same exit and identical output text",
    run("node", [path.join(V, "text.js"), f]), run("node", [path.join(HERE, "overclaim-scanner.js"), f]));
}
{
  console.log("overclaim-audit-colab.py vs colab.py (samples/overclaim-sample.md)");
  const f = path.join(HERE, "samples", "overclaim-sample.md");
  same("same exit and identical output text",
    run("python3", ["-I", path.join(V, "colab.py"), f]), run("python3", ["-I", path.join(HERE, "overclaim-audit-colab.py"), f]));
}
{
  console.log("earliest-mention.py vs timeline.py (samples/archives)");
  const a = path.join(HERE, "samples", "archives");
  const t = "--terms=observer,reaction gap,STOP,HOLD,never-said";
  same("same exit and identical output text",
    run("python3", ["-I", path.join(V, "timeline.py"), a, t]), run("python3", ["-I", path.join(HERE, "earliest-mention.py"), a, t]));
}
{
  console.log("equivalence-tost.py vs tost.py (samples/tost-sample.csv)");
  const prog = (file) => `import importlib.util,json,sys
s=importlib.util.spec_from_file_location("m",${JSON.stringify(file)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c,res=m.analyse_csv(${JSON.stringify(path.join(HERE, "samples", "tost-sample.csv"))},5.0)
print(json.dumps([(d,{k:(round(v,12) if isinstance(v,float) else v) for k,v in r.items()}) for d,r in res]))`;
  same("same numbers for every dimension",
    execFileSync("python3", ["-I", "-c", prog(path.join(V, "tost.py"))], { encoding: "utf8" }),
    execFileSync("python3", ["-I", "-c", prog(path.join(HERE, "equivalence-tost.py"))], { encoding: "utf8" }));
}
{
  console.log("action-journal.js vs journal.js (open, 2 × add, seal, check, edit, check)");
  const seq = (script, envKey) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "journal-"));
    const file = path.join(dir, ".journal.jsonl");
    const env = { JOURNAL_FILE: file };
    // The original has no JOURNAL_FILE and writes into ROOT of its repo; run it
    // from a disposable copy of itself so it writes there instead.
    let s = script;
    if (envKey === "orig") {
      fs.mkdirSync(path.join(dir, "verify"));
      s = path.join(dir, "verify", "journal.js");
      fs.copyFileSync(script, s);
    }
    const out = [];
    for (const a of [["open", "why"], ["add", "did a", "ok"], ["add", "did b"], ["seal"], ["check"]])
      out.push(run("node", [s, ...a], env, dir));
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const e = JSON.parse(lines[1]); e.what = "tampered"; lines[1] = JSON.stringify(e);
    fs.writeFileSync(file, lines.join("\n"));
    out.push(run("node", [s, "check"], env, dir));
    return out;
  };
  same("same exits and output text, including the tamper detection",
    seq(path.join(V, "journal.js"), "orig"), seq(path.join(HERE, "action-journal.js"), "new"));
}
{
  console.log("copy-canary.js vs canary.js (mint, check hit, check miss, list)");
  const seq = (script, envKey) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-"));
    let s = script;
    if (envKey === "orig") {
      fs.mkdirSync(path.join(dir, "verify"));
      s = path.join(dir, "verify", "canary.js");
      fs.copyFileSync(script, s);
    }
    const env = { CANARY_LEDGER: path.join(dir, ".canary-ledger.json") };
    const out = [run("node", [s, "mint", "cv.pdf", "recipient-a"], env, dir)];
    const ledger = JSON.parse(fs.readFileSync(path.join(dir, ".canary-ledger.json"), "utf8"));
    fs.writeFileSync(path.join(dir, "hit.txt"), `footer ${ledger.entries[0].marker}\n`);
    fs.writeFileSync(path.join(dir, "miss.txt"), "no marker here\n");
    out.push(run("node", [s, "check", path.join(dir, "hit.txt")], env, dir));
    out.push(run("node", [s, "check", path.join(dir, "miss.txt")], env, dir));
    out.push(run("node", [s, "list"], env, dir));
    return out;
  };
  same("same exits and output text",
    seq(path.join(V, "canary.js"), "orig"), seq(path.join(HERE, "copy-canary.js"), "new"));
}
{
  console.log("claims-register.js vs claims.js (--check on samples)");
  const files = ["claims-sample.md", "claims-clean.md"].map((f) => path.join(HERE, "samples", f));
  const hits = (out) => out.split("\n").filter((l) => /:\d+$|claim:/.test(l)).map((l) => l.replace(/^.*\//, ""));
  const a = run("node", [path.join(V, "claims.js"), "--check", ...files]);
  const b = run("node", [path.join(HERE, "claims-register.js"), "--check", ...files]);
  same("same exit and same flagged lines/claims", { code: a.code, hits: hits(a.out) }, { code: b.code, hits: hits(b.out) });
}
{
  console.log("self-tests, original and English");
  for (const [o, n] of [["vid.js", "source-classification.js"], ["nablyudenie.js", "observation-status.js"],
    ["falsifikator.js", "builder-vs-hunter.js"], ["pette.js", "open-hand-questions.js"],
    ["spor.js", "source-conflicts.js"], ["mutaciya.js", "claim-mutation.js"]]) {
    const a = spawnSync("node", [path.join(V, o), "--selftest"], { encoding: "utf8" });
    const b = spawnSync("node", [path.join(HERE, n), "--selftest"], { encoding: "utf8" });
    const count = (s) => (s.match(/^\s+[✓✗]/gm) || []).length;
    same(`${n}: exit ${b.status}, ${count(b.stdout)} checks (original: exit ${a.status}, ${count(a.stdout)} checks)`,
      a.status, b.status);
  }
}

console.log(`\n${pass} equivalent, ${fail} different.`);
process.exit(fail ? 1 : 0);
