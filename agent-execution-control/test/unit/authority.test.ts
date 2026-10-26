import assert from "node:assert/strict";
import test from "node:test";
import { composeRuntime } from "../../src/index.ts";
import * as publicApi from "../../src/index.ts";
import { envelopeInput, FakeRepository, issueValid, MockAdapter } from "../helpers.ts";

test("composition root exports scoped ports and never exports AdapterStartPort or raw repository", () => {
  const runtime = composeRuntime(new FakeRepository(), new MockAdapter());
  assert.deepEqual(Object.keys(runtime).sort(), ["coreSafety","executionControl","humanAuthority","navigator","observer","reconciler","safetyControl","stateAuthority"].sort());
  assert.equal("adapterStart" in runtime, false);
  assert.equal("repository" in runtime, false);
  assert.deepEqual(Object.keys(runtime.navigator), ["propose"]);
  assert.deepEqual(Object.keys(runtime.coreSafety), ["recordDecision", "addProtectedHold", "resolveProtectedHold"]);
});

test("public entrypoint excludes persistence, raw SQL, Adapter and ExecutionControl constructors", () => {
  for (const forbidden of ["ControlRepository","PostgresControlRepository","SqlPool","SqlSession","AdapterStartPort","ExecutionControl"]) {
    assert.equal(forbidden in publicApi, false);
  }
});

test("Navigator and Core cannot issue, revoke, claim, dispatch, verify or consume", () => {
  const runtime = composeRuntime(new FakeRepository(), new MockAdapter());
  for (const port of [runtime.navigator, runtime.coreSafety]) {
    for (const forbidden of ["issue","revoke","claim","dispatch","verify","consume"]) {
      assert.equal(forbidden in port, false);
    }
  }
});

test("Human authority has no HOLD override or resume capability", () => {
  const runtime = composeRuntime(new FakeRepository(), new MockAdapter());
  assert.deepEqual(Object.keys(runtime.humanAuthority), ["issue", "revoke"]);
  for (const forbidden of ["resumeExact", "removeHold", "resolveProtectedHold", "recordDecision"]) {
    assert.equal(forbidden in runtime.humanAuthority, false);
  }
});

test("duplicate HOLD ID fails closed without overwriting the original", async () => {
  const repository = new FakeRepository();
  const runtime = composeRuntime(repository, new MockAdapter());
  await runtime.coreSafety.addProtectedHold("risk-A", "first", "core");
  await assert.rejects(runtime.coreSafety.addProtectedHold("risk-A", "second", "core"), /duplicate HOLD/);
  assert.equal(repository.holds.get("risk-A"), "first");
});

test("only Core resolves an exact HOLD after reevaluation and resolution never dispatches", async () => {
  const repository = new FakeRepository();
  const adapter = new MockAdapter();
  const runtime = composeRuntime(repository, adapter);
  await runtime.coreSafety.addProtectedHold("risk-A", "A", "core");
  await runtime.coreSafety.addProtectedHold("risk-B", "B", "core");
  await runtime.coreSafety.resolveProtectedHold("risk-A", "new evidence resolved A", "core-reevaluation");
  assert.equal(repository.gate, "HOLD");
  assert.equal(repository.holds.has("risk-B"), true);
  assert.equal(adapter.calls, 0);
});

test("STOP remains dominant when a protected HOLD is added and resolved", async () => {
  const repository = new FakeRepository();
  const runtime = composeRuntime(repository, new MockAdapter());

  await runtime.safetyControl.stop("operator stop");

  await runtime.coreSafety.addProtectedHold(
    "risk-after-stop",
    "new risk",
    "core",
  );
  assert.equal(repository.gate, "STOP");

  await runtime.coreSafety.resolveProtectedHold(
    "risk-after-stop",
    "risk resolved",
    "core-reevaluation",
  );
  assert.equal(repository.gate, "STOP");
});

test("Core cannot resolve a HOLD without explicit evidence and provenance", async () => {
  const repository = new FakeRepository();
  const runtime = composeRuntime(repository, new MockAdapter());
  await runtime.coreSafety.addProtectedHold("risk-A", "A", "core");
  assert.throws(() => runtime.coreSafety.resolveProtectedHold("risk-A", "", "core"), /resolution evidence/);
  assert.throws(() => runtime.coreSafety.resolveProtectedHold("risk-A", "new evidence", ""), /resolution provenance/);
  assert.equal(repository.holds.has("risk-A"), true);
});

test("dual gate forbids Permit issuance without exact current Core CLEAR", async (t) => {
  for (const decision of [undefined, "HOLD", "UNKNOWN"] as const) await t.test(decision ?? "MISSING", async () => {
    const repository = new FakeRepository();
    const runtime = composeRuntime(repository, new MockAdapter());
    if (decision) await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision, reason: "assessment", provenance: "core" });
    await assert.rejects(runtime.humanAuthority.issue({
      permitId: `permit-${decision ?? "missing"}`,
      envelope: envelopeInput,
      issuedAt: "2029-12-31T00:00:00.000Z",
      expiresAt: "2030-01-02T00:00:00.000Z",
    }), /Core CLEAR/);
    assert.equal(repository.permits.size, 0);
  });
});

test("Core CLEAR alone creates no authority; Human issue is separately required", async () => {
  const repository = new FakeRepository();
  const runtime = composeRuntime(repository, new MockAdapter());
  await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "CLEAR", reason: "bounded risk accepted", provenance: "core" });
  assert.equal(repository.permits.size, 0);
  await runtime.humanAuthority.issue({
    permitId: "dual-gate-permit",
    envelope: envelopeInput,
    issuedAt: "2029-12-31T00:00:00.000Z",
    expiresAt: "2030-01-02T00:00:00.000Z",
  });
  assert.equal(repository.permits.get("dual-gate-permit")?.state, "ISSUED");
});

test("Core may reevaluate HOLD to exact CLEAR; Human cannot bypass the HOLD", async () => {
  const repository = new FakeRepository();
  const runtime = composeRuntime(repository, new MockAdapter());
  await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "HOLD", reason: "unresolved risk", provenance: "core" });
  await assert.rejects(runtime.humanAuthority.issue({ permitId: "p", envelope: envelopeInput, issuedAt: "2029-12-31T00:00:00.000Z", expiresAt: "2030-01-02T00:00:00.000Z" }));
  await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "CLEAR", reason: "new evidence resolved risk", provenance: "core" });
  await runtime.humanAuthority.issue({ permitId: "p", envelope: envelopeInput, issuedAt: "2029-12-31T00:00:00.000Z", expiresAt: "2030-01-02T00:00:00.000Z" });
  assert.equal(repository.permits.get("p")?.state, "ISSUED");
});

test("stale or differently bound Core CLEAR cannot authorize a mutated proposal", async () => {
  const repository = new FakeRepository();
  const runtime = composeRuntime(repository, new MockAdapter());
  await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "CLEAR", reason: "exact original", provenance: "core" });
  await assert.rejects(runtime.humanAuthority.issue({
    permitId: "mutated",
    envelope: { ...envelopeInput, target: "target-B" },
    issuedAt: "2029-12-31T00:00:00.000Z",
    expiresAt: "2030-01-02T00:00:00.000Z",
  }), /binding mismatch/);
  assert.equal(repository.permits.size, 0);
});

test("read-only observer cannot mutate persistent authority state", async () => {
  const repository = new FakeRepository();
  const runtime = composeRuntime(repository, new MockAdapter());
  await issueValid(repository);
  assert.deepEqual(Object.keys(runtime.observer).sort(), ["attempt","permit"]);
  assert.equal((await runtime.observer.permit("permit-1"))?.state, "ISSUED");
});

test("Human issue validates malformed runtime input before repository write", async () => {
  const repository = new FakeRepository();
  const runtime = composeRuntime(repository, new MockAdapter());
  await assert.rejects(runtime.humanAuthority.issue({ permitId: "p", envelope: { ...envelopeInput, action: "" }, issuedAt: "x", expiresAt: "y" }));
  assert.equal(repository.permits.size, 0);
});
