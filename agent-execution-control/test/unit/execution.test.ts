import assert from "node:assert/strict";
import test from "node:test";
import { composeRuntime } from "../../src/index.ts";
import { envelopeInput, FakeRepository, issueValid, MockAdapter } from "../helpers.ts";

async function claimed() {
  const repository = new FakeRepository();
  const adapter = new MockAdapter();
  const runtime = composeRuntime(repository, adapter);
  await issueValid(repository);
  const claim = await runtime.executionControl.claim({ permitId: "permit-1", envelope: envelopeInput });
  return { repository, adapter, runtime, claim };
}

test("single-use permit produces one claim; replay is rejected", async () => {
  const { runtime, claim } = await claimed();
  assert.equal(claim.permit.state, "CLAIMED");
  await assert.rejects(runtime.executionControl.claim({ permitId: "permit-1", envelope: envelopeInput }), /permit state mismatch|already claimed/);
});

test("claim fails closed on HOLD, STOP, UNKNOWN, revoke, expiry, envelope mutation, version and dependency drift", async (t) => {
  const cases: readonly [string, (r: FakeRepository) => Promise<void> | void][] = [
    ["HOLD", (r) => r.addHold("h", "risk", "core")],
    ["STOP", (r) => { r.gate = "STOP"; }],
    ["UNKNOWN", (r) => { r.stateKnown = false; }],
    ["REVOKED", (r) => r.revokePermit("permit-1", "human")],
    ["EXPIRED", (r) => { r.now = Date.parse("2030-01-03T00:00:00Z"); }],
    ["VERSION", (r) => { r.currentVersion = "v2"; }],
    ["DEPENDENCY", (r) => { r.currentDependencyDigest = "0".repeat(64); }],
    ["CORE_HOLD", async (r) => { await r.recordCoreDecision("proposal-1", r.coreDecisions.get("proposal-1")!.envelopeDigest, "v1", r.currentDependencyDigest, "HOLD", "new Core risk", "core"); }],
    ["CORE_UNKNOWN", async (r) => { await r.recordCoreDecision("proposal-1", r.coreDecisions.get("proposal-1")!.envelopeDigest, "v1", r.currentDependencyDigest, "UNKNOWN", "Core uncertainty", "core"); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const repository = new FakeRepository(); const runtime = composeRuntime(repository, new MockAdapter()); await issueValid(repository); await mutate(repository);
    await assert.rejects(runtime.executionControl.claim({ permitId: "permit-1", envelope: envelopeInput }));
    assert.equal(repository.attempts.size, 0);
    if (name === "EXPIRED") assert.equal(repository.permits.get("permit-1")?.state, "EXPIRED");
  });
  await t.test("ENVELOPE", async () => {
    const repository = new FakeRepository(); const runtime = composeRuntime(repository, new MockAdapter()); await issueValid(repository);
    await assert.rejects(runtime.executionControl.claim({ permitId: "permit-1", envelope: { ...envelopeInput, target: "target-B" } }));
    assert.equal(repository.attempts.size, 0);
  });
});

test("dispatch rechecks expiry, HOLD, revoke, version and dependencies before Adapter call", async (t) => {
  const cases: readonly [string, (x: Awaited<ReturnType<typeof claimed>>) => Promise<void> | void][] = [
    ["HOLD", ({ repository }) => repository.addHold("new-risk", "risk", "core")],
    ["REVOKE", ({ repository }) => repository.revokePermit("permit-1", "human")],
    ["EXPIRY", ({ repository }) => { repository.now = Date.parse("2030-01-03T00:00:00Z"); }],
    ["VERSION", ({ repository }) => { repository.currentVersion = "v2"; }],
    ["DEPENDENCY", ({ repository }) => { repository.currentDependencyDigest = "f".repeat(64); }],
    ["CORE_HOLD", async ({ repository }) => { await repository.recordCoreDecision("proposal-1", repository.coreDecisions.get("proposal-1")!.envelopeDigest, "v1", repository.currentDependencyDigest, "HOLD", "new pre-dispatch risk", "core"); }],
    ["CORE_UNKNOWN", async ({ repository }) => { await repository.recordCoreDecision("proposal-1", repository.coreDecisions.get("proposal-1")!.envelopeDigest, "v1", repository.currentDependencyDigest, "UNKNOWN", "new pre-dispatch uncertainty", "core"); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const context = await claimed(); await mutate(context);
    await assert.rejects(context.runtime.executionControl.dispatch({ attemptId: context.claim.attempt.id, envelope: envelopeInput }));
    assert.equal(context.adapter.calls, 0);
    if (name === "EXPIRY") {
      assert.equal((await context.runtime.observer.permit("permit-1"))?.state, "EXPIRED");
      assert.equal((await context.runtime.observer.attempt(context.claim.attempt.id))?.state, "CANCELLED");
    }
  });
});

test("Adapter no-start becomes CANCELLED and means invocation did not begin", async () => {
  const context = await claimed(); context.adapter.mode = "NO_START";
  const attempt = await context.runtime.executionControl.dispatch({ attemptId: context.claim.attempt.id, envelope: envelopeInput });
  assert.equal(attempt.state, "CANCELLED"); assert.equal(attempt.invocationStarted, false); assert.equal(context.repository.reservationReleaseCount, 1);
});

test("ambiguous Adapter start becomes UNKNOWN and is not retried", async () => {
  const context = await claimed(); context.adapter.mode = "THROW";
  const attempt = await context.runtime.executionControl.dispatch({ attemptId: context.claim.attempt.id, envelope: envelopeInput });
  assert.equal(attempt.state, "UNKNOWN"); assert.equal(context.adapter.calls, 1);
  await assert.rejects(context.runtime.executionControl.dispatch({ attemptId: attempt.id, envelope: envelopeInput }));
  assert.equal(context.adapter.calls, 1);
});

test("Adapter SUCCESS report remains ATTEMPTED and not VERIFIED", async () => {
  const context = await claimed();
  const attempt = await context.runtime.executionControl.dispatch({ attemptId: context.claim.attempt.id, envelope: envelopeInput });
  assert.equal(attempt.state, "ATTEMPTED"); assert.equal(attempt.verificationOutcome, null); assert.notEqual(attempt.state, "VERIFIED");
});

test("Reconciler atomically fail-closes abandoned CLAIMED Attempt and Permit to UNKNOWN", async () => {
  const context = await claimed();
  const attempt = await context.runtime.reconciler.failClosedAbandoned(context.claim.attempt.id, "worker crash");
  assert.equal(attempt.state, "UNKNOWN");
  assert.equal((await context.runtime.observer.permit("permit-1"))?.state, "UNKNOWN");
  assert.deepEqual(Object.keys(context.runtime.reconciler), ["failClosedAbandoned"]);
});
