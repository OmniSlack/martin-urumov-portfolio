"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { hInfo, joulesPerBit, bitsPerJoule, againstFloor, K_B, ROOM_K, CMB_K } =
  require("./landauer.js");

const close = (a, b, rel = 1e-12) => Math.abs(a - b) <= rel * Math.abs(b);

test("H_info — one bit at 300 K is 2.871e-21 J", () => {
  const h = hInfo(1, ROOM_K);
  assert.strictEqual(h.decision, "CLEAR");
  assert.ok(close(h.joules, K_B * 300 * Math.LN2));
  assert.ok(h.joules > 2.87e-21 && h.joules < 2.872e-21);
  assert.strictEqual(h.unit, "J");
});

test("H_info — the term is linear in bits", () => {
  const one = hInfo(1, ROOM_K).joules;
  const many = hInfo(8e9, ROOM_K).joules; // one gigabyte
  assert.ok(close(many, one * 8e9, 1e-9));
});

test("H_info — colder costs less, and the cosmic floor is 100x below room", () => {
  const room = joulesPerBit(ROOM_K);
  const cmb = joulesPerBit(CMB_K);
  assert.ok(cmb < room);
  assert.ok(close(room / cmb, ROOM_K / CMB_K, 1e-12), "the ratio is exactly T/T");
});

test("H_info — no temperature, no term", () => {
  for (const t of [0, -1, -273.15, NaN, Infinity, "300", null, undefined]) {
    const h = hInfo(1, t);
    assert.strictEqual(h.decision, "HOLD", `T=${t} must not produce a number`);
    assert.strictEqual(h.joules, null);
  }
  assert.match(hInfo(1, 0).reasons.join(" "), /Without a bath there is no bit-to-joule rate/);
});

test("H_info — bits must be a real count", () => {
  for (const b of [-1, NaN, Infinity, "8", null, undefined]) {
    assert.strictEqual(hInfo(b, ROOM_K).decision, "HOLD", `bits=${b}`);
  }
  assert.strictEqual(hInfo(0, ROOM_K).decision, "CLEAR", "zero bits is zero joules, not an error");
  assert.strictEqual(hInfo(0, ROOM_K).joules, 0);
  assert.strictEqual(hInfo(0.5, ROOM_K).decision, "CLEAR", "a partial erasure is meaningful");
});

test("H_info — the result says what kind of number it is", () => {
  const h = hInfo(1, ROOM_K);
  assert.strictEqual(h.bound, "LOWER", "never an estimate of actual cost");
  assert.strictEqual(h.appliesTo, "ERASURE", "never a bound on reversible computation");
});

test("bitsPerJoule is the exact inverse", () => {
  const n = bitsPerJoule(ROOM_K);
  assert.ok(close(n * joulesPerBit(ROOM_K), 1));
  assert.ok(n > 3.4e20 && n < 3.5e20);
  assert.strictEqual(bitsPerJoule(0), null);
});

test("againstFloor — real hardware sits far above the floor", () => {
  // A switching event in current silicon, order 1e-16 J.
  const r = againstFloor(1, ROOM_K, 1e-16);
  assert.strictEqual(r.decision, "CLEAR");
  assert.ok(r.ratio > 1e4, "orders of magnitude above Landauer");
});

test("againstFloor — below the floor is STOP, not efficiency", () => {
  const r = againstFloor(1, ROOM_K, 1e-25);
  assert.strictEqual(r.decision, "STOP");
  assert.match(r.reasons.join(" "), /neither is efficiency/);
  assert.ok(r.ratio < 1);
});

test("againstFloor — exactly at the floor passes", () => {
  const floor = hInfo(1, ROOM_K).joules;
  assert.strictEqual(againstFloor(1, ROOM_K, floor).decision, "CLEAR");
});

test("againstFloor — a bad measurement is held, not scored", () => {
  for (const m of [-1, NaN, "1e-16", null]) {
    assert.strictEqual(againstFloor(1, ROOM_K, m).decision, "HOLD", `measured=${m}`);
  }
});

test("H_info — results cannot be edited after the fact", () => {
  const h = hInfo(1, ROOM_K);
  assert.ok(Object.isFrozen(h));
  assert.throws(() => { "use strict"; h.joules = 0; }, TypeError);
});

test("k_B is the exact SI value, not a rounded one", () => {
  assert.strictEqual(K_B, 1.380649e-23);
});
