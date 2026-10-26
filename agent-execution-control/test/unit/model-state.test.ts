import assert from "node:assert/strict";
import test from "node:test";
import { assertAttemptTransition, assertPermitTransition, envelopeDigest, parseActionEnvelope, ValidationError } from "../../src/index.ts";
import { envelopeInput } from "../helpers.ts";

test("runtime envelope validation rejects malformed/corrupted input", () => {
  assert.throws(() => parseActionEnvelope({ ...envelopeInput, scope: ["ok", 7] }), ValidationError);
  assert.throws(() => parseActionEnvelope({ ...envelopeInput, dependencies: { depA: null } }), ValidationError);
  assert.throws(() => parseActionEnvelope(undefined), ValidationError);
});

test("canonical digest is key-order stable and mutation-sensitive", () => {
  const first = parseActionEnvelope(envelopeInput);
  const { action, ...rest } = envelopeInput;
  const reordered = parseActionEnvelope({ action, ...rest });
  const mutated = parseActionEnvelope({ ...envelopeInput, target: "target-B" });
  assert.equal(envelopeDigest(first), envelopeDigest(reordered));
  assert.notEqual(envelopeDigest(first), envelopeDigest(mutated));
});

test("permit transition matrix rejects revival and replay", () => {
  assert.doesNotThrow(() => assertPermitTransition("ISSUED", "CLAIMED"));
  assert.throws(() => assertPermitTransition("REVOKED", "ISSUED"));
  assert.throws(() => assertPermitTransition("CONSUMED", "CLAIMED"));
  assert.throws(() => assertPermitTransition("UNKNOWN", "ISSUED"));
});

test("attempt transition matrix enforces CANCELLED means no invocation", () => {
  assert.doesNotThrow(() => assertAttemptTransition("CLAIMED", "CANCELLED", false));
  assert.throws(() => assertAttemptTransition("CLAIMED", "CANCELLED", true));
  assert.throws(() => assertAttemptTransition("VERIFIED", "ATTEMPTED", true));
});
