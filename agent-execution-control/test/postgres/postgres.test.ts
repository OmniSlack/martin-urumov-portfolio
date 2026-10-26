import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import test, { before } from "node:test";
import { composeRuntime, dependencyDigest, envelopeDigest } from "../../src/index.ts";
import type { ActionEnvelope, AdapterStartPort } from "../../src/index.ts";
import { NodePgPool } from "../../src/postgres/node-pg.ts";
import { PostgresControlRepository } from "../../src/postgres/repository.ts";
import { envelope, envelopeInput, MockAdapter } from "../helpers.ts";
import { usingAsyncResource } from "../resource-lifecycle.ts";

const container = process.env.PG_TEST_CONTAINER ?? "navigator-pg-stage1";
const database = "navigator_stage1_test";
const hostPort = Number(process.env.PG_TEST_PORT ?? "54329");

interface CommandResult { readonly code: number; readonly stdout: string; readonly stderr: string }

class BlockingAdapter implements AdapterStartPort {
  public calls = 0;
  private readonly enteredPromise: Promise<void>;
  private readonly releasePromise: Promise<void>;
  private enter!: () => void;
  private unblock!: () => void;

  public constructor() {
    this.enteredPromise = new Promise((resolve) => { this.enter = resolve; });
    this.releasePromise = new Promise((resolve) => { this.unblock = resolve; });
  }

  public async start(_envelope: ActionEnvelope, _fence: string) {
    this.calls += 1;
    this.enter();
    await this.releasePromise;
    return { started: true, report: { status: "BLOCKING_MOCK_STARTED" } };
  }

  public entered(): Promise<void> { return this.enteredPromise; }
  public release(): void { this.unblock(); }
}

function run(command: string, args: readonly string[], input?: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.stdin.end(input);
  });
}

function docker(args: readonly string[], input?: string): Promise<CommandResult> { return run("docker", args, input); }
function psql(sql: string, target = database): Promise<CommandResult> {
  return docker(["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target, "-At"], sql);
}
function quote(value: string): string { return `'${value.replaceAll("'", "''")}'`; }

async function must(result: Promise<CommandResult>, label: string): Promise<CommandResult> {
  const settled = await result;
  assert.equal(settled.code, 0, `${label}\nstdout: ${settled.stdout}\nstderr: ${settled.stderr}`);
  return settled;
}

async function waitReady(): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    const ready = await docker(["exec", container, "pg_isready", "-U", "postgres"]);
    if (ready.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail("PostgreSQL did not become ready");
}

async function waitForBlockedAdvisory(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const waiting = await must(psql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted;"), "advisory waiter count");
    if (Number(waiting.stdout.trim()) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("expected a blocked advisory-lock waiter");
}

async function reset(): Promise<void> {
  await must(psql(`
    TRUNCATE navigator_stage1.audit_events,navigator_stage1.attempts,navigator_stage1.permits,
      navigator_stage1.holds,navigator_stage1.core_decisions,navigator_stage1.current_state RESTART IDENTITY CASCADE;
    UPDATE navigator_stage1.execution_gate SET state='OPEN',reason=NULL,revision=0;
  `), "reset database");
}

function fixture(permitId: string, expires = "clock_timestamp() + interval '10 minutes'"): string {
  const value = envelope();
  return `
    INSERT INTO navigator_stage1.current_state(scope_id,version,dependency_digest,known)
      VALUES(${quote(value.proposalId)},${quote(value.version)},${quote(dependencyDigest(value.dependencies))},true);
    INSERT INTO navigator_stage1.core_decisions(proposal_id,envelope_digest,version,dependency_digest,decision,reason,provenance)
      VALUES(${quote(value.proposalId)},${quote(envelopeDigest(value))},${quote(value.version)},${quote(dependencyDigest(value.dependencies))},'CLEAR','fixture clearance','postgres-test');
    INSERT INTO navigator_stage1.permits(id,envelope,envelope_digest,state,issued_at,expires_at)
      VALUES(${quote(permitId)},${quote(JSON.stringify(value))}::jsonb,${quote(envelopeDigest(value))},'ISSUED',clock_timestamp()-interval '1 minute',${expires});
  `;
}

function claimSql(permitId: string, attemptId: string): string {
  const value = envelope();
  return `SELECT (x.permit->>'state')||':'||(x.attempt->>'state') FROM navigator_stage1.claim_permit(
    ${quote(permitId)},${quote(attemptId)},${quote(value.proposalId)},${quote(envelopeDigest(value))},
    ${quote(value.version)},${quote(dependencyDigest(value.dependencies))}) x;`;
}

function reserveSql(attemptId: string, fence: string): string {
  const value = envelope();
  return `SELECT x.attempt->>'dispatch_fence' FROM navigator_stage1.reserve_dispatch(
    ${quote(attemptId)},${quote(fence)},${quote(envelopeDigest(value))},${quote(value.version)},
    ${quote(dependencyDigest(value.dependencies))},${quote(value.proposalId)}) x;`;
}

async function claimedRuntime(nodePool: NodePgPool, adapter: AdapterStartPort, permitId: string) {
  const runtime = composeRuntime(new PostgresControlRepository(nodePool), adapter);
  await runtime.stateAuthority.observe("proposal-1", "v1", { depA: "1" }, true);
  await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "CLEAR", reason: "bounded fixture clearance", provenance: "postgres-test" });
  await runtime.humanAuthority.issue({
    permitId,
    envelope: envelopeInput,
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  const claim = await runtime.executionControl.claim({ permitId, envelope: envelopeInput });
  return { runtime, claim };
}

before(async () => {
  await waitReady();
  const exists = await must(psql(`SELECT 1 FROM pg_database WHERE datname=${quote(database)};`, "postgres"), "check test database");
  if (exists.stdout.trim() !== "1") await must(docker(["exec", container, "createdb", "-U", "postgres", database]), "create test database");
  const migrationsDirectory = new URL("../../migrations/", import.meta.url);
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const migrationName of migrationNames) {
    const migration = await readFile(new URL(migrationName, migrationsDirectory), "utf8");
    await must(psql(migration), `apply migration ${migrationName}`);
  }
});

test("migration and schema constraints are installed on genuine PostgreSQL", async () => {
  const version = await must(psql("SELECT version FROM navigator_stage1.schema_migrations ORDER BY version;"), "migration version");
  assert.equal(version.stdout.trim().replaceAll("\r", ""), "1\n2\n3\n4");
  const server = await must(psql("SHOW server_version;"), "server version");
  assert.match(server.stdout, /^16\./);
});

test("TypeScript repository performs authority-bound claim and dispatch against PostgreSQL", async () => {
  await usingAsyncResource(
    () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 6 }),
    async (nodePool) => {
      await reset();
      const repository = new PostgresControlRepository(nodePool);
      const adapter = new MockAdapter();
      const runtime = composeRuntime(repository, adapter);
      await runtime.stateAuthority.observe("proposal-1", "v1", { depA: "1" }, true);
      await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "CLEAR", reason: "bounded test clearance", provenance: "postgres-test" });
      await runtime.humanAuthority.issue({
        permitId: "typescript-permit",
        envelope: envelopeInput,
        issuedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      const claim = await runtime.executionControl.claim({ permitId: "typescript-permit", envelope: envelopeInput });
      const attempt = await runtime.executionControl.dispatch({ attemptId: claim.attempt.id, envelope: envelopeInput });
      assert.equal(claim.permit.state, "CLAIMED");
      assert.equal(attempt.state, "ATTEMPTED");
      assert.equal(attempt.verificationOutcome, null);
      assert.equal(adapter.calls, 1);
    },
  );
});

test("PostgreSQL Permit issuance requires exact Core CLEAR and Human issue", async () => {
  await usingAsyncResource(
    () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 4 }),
    async (nodePool) => {
      await reset();
      const runtime = composeRuntime(new PostgresControlRepository(nodePool), new MockAdapter());
      await runtime.stateAuthority.observe("proposal-1", "v1", { depA: "1" }, true);
      const issue = () => runtime.humanAuthority.issue({
        permitId: "dual-gate-issue",
        envelope: envelopeInput,
        issuedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      await assert.rejects(issue(), /Core decision|Core CLEAR/);
      await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "HOLD", reason: "unresolved risk", provenance: "core" });
      await assert.rejects(issue(), /Core CLEAR/);
      await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "UNKNOWN", reason: "insufficient evidence", provenance: "core" });
      await assert.rejects(issue(), /Core CLEAR/);
      await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "CLEAR", reason: "risk resolved by new evidence", provenance: "core" });
      assert.equal((await issue()).state, "ISSUED");
      const audit = await must(psql("SELECT count(*) FROM navigator_stage1.audit_events WHERE kind='PERMIT_ISSUED' AND subject_id='dual-gate-issue';"), "dual-gate issue audit");
      assert.equal(audit.stdout.trim(), "1");
    },
  );
});

test("duplicate HOLD ID is rejected and cannot overwrite evidence", async () => {
  await reset();
  await must(psql("INSERT INTO navigator_stage1.holds(id,reason,provenance) VALUES('same-hold','first','core');"), "first HOLD");
  const duplicate = await psql("INSERT INTO navigator_stage1.holds(id,reason,provenance) VALUES('same-hold','second','core');");
  assert.notEqual(duplicate.code, 0);
  const reason = await must(psql("SELECT reason FROM navigator_stage1.holds WHERE id='same-hold';"), "read HOLD");
  assert.equal(reason.stdout.trim(), "first");
});

test("failed or repeated revoke cannot commit false PERMIT_REVOKED evidence", async () => {
  await usingAsyncResource(
    () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 4 }),
    async (nodePool) => {
      await reset();
      const runtime = composeRuntime(new PostgresControlRepository(nodePool), new MockAdapter());
      await assert.rejects(runtime.humanAuthority.revoke("missing-permit", "not present"));
      await runtime.stateAuthority.observe("proposal-1", "v1", { depA: "1" }, true);
      await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "CLEAR", reason: "bounded revoke fixture clearance", provenance: "postgres-test" });
      await runtime.humanAuthority.issue({
        permitId: "single-revoke-permit",
        envelope: envelopeInput,
        issuedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      await runtime.humanAuthority.revoke("single-revoke-permit", "first valid revoke");
      await assert.rejects(runtime.humanAuthority.revoke("single-revoke-permit", "invalid repeated revoke"));
      const audit = await must(psql("SELECT subject_id||':'||count(*) FROM navigator_stage1.audit_events WHERE kind='PERMIT_REVOKED' GROUP BY subject_id ORDER BY subject_id;"), "revoke audit counts");
      assert.equal(audit.stdout.trim(), "single-revoke-permit:1");
    },
  );
});

test("database trigger rejects invalid Permit and Attempt transitions", async () => {
  await reset(); await must(psql(fixture("transition-permit") + claimSql("transition-permit", "transition-attempt")), "claim fixture");
  const permitRevival = await psql("UPDATE navigator_stage1.permits SET state='ISSUED' WHERE id='transition-permit';");
  const fakeVerified = await psql("UPDATE navigator_stage1.attempts SET state='VERIFIED' WHERE id='transition-attempt';");
  const envelopeMutation = await psql("UPDATE navigator_stage1.permits SET envelope=jsonb_set(envelope,'{target}','\"target-B\"') WHERE id='transition-permit';");
  assert.notEqual(permitRevival.code, 0); assert.notEqual(fakeVerified.code, 0); assert.notEqual(envelopeMutation.code, 0);
});

test("split identity guards allow valid Attempt transitions without reading Permit-only columns", async () => {
  await reset();
  await must(psql(fixture("identity-regression-permit") + claimSql("identity-regression-permit", "identity-regression-attempt")), "identity regression claim");
  await must(psql("UPDATE navigator_stage1.attempts SET state='ATTEMPTED',invocation_started=true WHERE id='identity-regression-attempt';"), "valid Attempt transition");
  await must(psql("UPDATE navigator_stage1.permits SET revision=revision+1 WHERE id='identity-regression-permit';"), "valid Permit metadata update");
  const state = await must(psql("SELECT state||':'||invocation_started FROM navigator_stage1.attempts WHERE id='identity-regression-attempt';"), "identity regression state");
  assert.equal(state.stdout.trim(), "ATTEMPTED:true");
});

test("two concurrent processes produce exactly one single-use claim", async () => {
  await reset(); await must(psql(fixture("race-permit")), "race fixture");
  const [a, b] = await Promise.all([psql(claimSql("race-permit", "race-attempt-a")), psql(claimSql("race-permit", "race-attempt-b"))]);
  assert.equal([a, b].filter((result) => result.code === 0).length, 1);
  const counts = await must(psql("SELECT (SELECT count(*) FROM navigator_stage1.attempts)||':'||(SELECT count(*) FROM navigator_stage1.permits WHERE state='CLAIMED');"), "race counts");
  assert.equal(counts.stdout.trim(), "1:1");
});

test("restart preserves claim and replay remains blocked", async () => {
  await reset(); await must(psql(fixture("restart-permit") + claimSql("restart-permit", "restart-attempt")), "restart fixture");
  await must(docker(["restart", container]), "restart container"); await waitReady();
  const state = await must(psql("SELECT state||':'||claimed_attempt_id FROM navigator_stage1.permits WHERE id='restart-permit';"), "durable state");
  assert.equal(state.stdout.trim(), "CLAIMED:restart-attempt");
  const replay = await psql(claimSql("restart-permit", "restart-attempt-2")); assert.notEqual(replay.code, 0);
});

test("reconciler atomically moves abandoned PostgreSQL Attempt and Permit to UNKNOWN", async () => {
  await usingAsyncResource(
    () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 4 }),
    async (nodePool) => {
      await reset();
      await must(psql(fixture("abandoned-permit") + claimSql("abandoned-permit", "abandoned-attempt")), "abandoned fixture");
      const runtime = composeRuntime(new PostgresControlRepository(nodePool), new MockAdapter());
      const attempt = await runtime.reconciler.failClosedAbandoned("abandoned-attempt", "worker crashed before Adapter start");
      assert.equal(attempt.state, "UNKNOWN");
      assert.equal((await runtime.observer.permit("abandoned-permit"))?.state, "UNKNOWN");
      const audit = await must(psql("SELECT count(*) FROM navigator_stage1.audit_events WHERE kind='ABANDONED_RECONCILED_UNKNOWN' AND subject_id='abandoned-attempt';"), "reconciliation audit");
      assert.equal(audit.stdout.trim(), "1");
    },
  );
});

test("claim persists EXPIRED before TypeScript repository reports rejection", async () => {
  await usingAsyncResource(
    () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 4 }),
    async (nodePool) => {
      await reset();
      const repository = new PostgresControlRepository(nodePool);
      const runtime = composeRuntime(repository, new MockAdapter());
      await runtime.stateAuthority.observe("proposal-1", "v1", { depA: "1" }, true);
      await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "CLEAR", reason: "bounded expiry fixture clearance", provenance: "postgres-test" });
      await runtime.humanAuthority.issue({
        permitId: "expired-before-claim",
        envelope: envelopeInput,
        issuedAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await assert.rejects(runtime.executionControl.claim({ permitId: "expired-before-claim", envelope: envelopeInput }), /permit expired/);
      assert.equal((await runtime.observer.permit("expired-before-claim"))?.state, "EXPIRED");
      const attempts = await must(psql("SELECT count(*) FROM navigator_stage1.attempts WHERE permit_id='expired-before-claim';"), "expired claim attempt count");
      assert.equal(attempts.stdout.trim(), "0");
    },
  );
});

test("dispatch persists Permit EXPIRED and Attempt CANCELLED before reporting rejection", async () => {
  await usingAsyncResource(
    () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 4 }),
    async (nodePool) => {
      await reset();
      await must(psql(fixture("expiry-permit", "clock_timestamp() + interval '1 second'") + claimSql("expiry-permit", "expiry-attempt") + "SELECT pg_sleep(1.2);"), "expiring claim");
      const adapter = new MockAdapter();
      const runtime = composeRuntime(new PostgresControlRepository(nodePool), adapter);
      await assert.rejects(runtime.executionControl.dispatch({ attemptId: "expiry-attempt", envelope: envelopeInput }), /expired at dispatch/);
      const state = await must(psql("SELECT p.state||':'||a.state||':'||a.invocation_started FROM navigator_stage1.permits p JOIN navigator_stage1.attempts a ON a.permit_id=p.id WHERE p.id='expiry-permit';"), "durable dispatch expiry state");
      assert.equal(state.stdout.trim(), "EXPIRED:CANCELLED:false");
      assert.equal(adapter.calls, 0);
    },
  );
});

test("dispatch rechecks version/dependency drift and UNKNOWN", async (t) => {
  for (const [name, mutation] of [
    ["version", "UPDATE navigator_stage1.current_state SET version='v2' WHERE scope_id='proposal-1';"],
    ["dependency", `UPDATE navigator_stage1.current_state SET dependency_digest=${quote("f".repeat(64))} WHERE scope_id='proposal-1';`],
    ["unknown", "UPDATE navigator_stage1.current_state SET known=false WHERE scope_id='proposal-1';"],
  ] as const) await t.test(name, async () => {
    await reset(); await must(psql(fixture(`${name}-permit`) + claimSql(`${name}-permit`, `${name}-attempt`) + mutation), `${name} fixture`);
    const dispatch = await psql(reserveSql(`${name}-attempt`, `${name}-fence`)); assert.notEqual(dispatch.code, 0);
  });
});

test("PostgresControlRepository blocks Adapter after Core changes exact CLEAR to HOLD", async () => {
  await usingAsyncResource(
    () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 6 }),
    async (nodePool) => {
      await reset();
      const adapter = new MockAdapter();
      const { runtime, claim } = await claimedRuntime(nodePool, adapter, "runtime-hold-permit");
      await runtime.coreSafety.recordDecision({ envelope: envelopeInput, decision: "HOLD", reason: "new exact pre-dispatch risk", provenance: "core" });
      await assert.rejects(runtime.executionControl.dispatch({ attemptId: claim.attempt.id, envelope: envelopeInput }));
      assert.equal(adapter.calls, 0);
    },
  );
});

test("PostgresControlRepository blocks Adapter after committed pre-dispatch revoke", async () => {
  await usingAsyncResource(
    () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 6 }),
    async (nodePool) => {
      await reset();
      const adapter = new MockAdapter();
      const { runtime, claim } = await claimedRuntime(nodePool, adapter, "runtime-revoke-permit");
      await runtime.humanAuthority.revoke("runtime-revoke-permit", "human pre-dispatch revoke");
      await assert.rejects(runtime.executionControl.dispatch({ attemptId: claim.attempt.id, envelope: envelopeInput }));
      assert.equal(adapter.calls, 0);
    },
  );
});

test("actual runtime dispatch barrier serializes later HOLD and revoke behind Adapter start", async (t) => {
  for (const operation of ["HOLD", "REVOKE"] as const) await t.test(operation, async () => {
    await usingAsyncResource(
      () => new NodePgPool({ host: "127.0.0.1", port: hostPort, user: "postgres", password: "stage1_test_only", database, max: 8 }),
      async (nodePool) => {
        await reset();
        const adapter = new BlockingAdapter();
        const permitId = `barrier-${operation.toLowerCase()}-permit`;
        const { runtime, claim } = await claimedRuntime(nodePool, adapter, permitId);
        const dispatchPromise = runtime.executionControl.dispatch({ attemptId: claim.attempt.id, envelope: envelopeInput });
        await adapter.entered();
        let controlSettled = false;
        const controlPromise = (operation === "HOLD"
          ? runtime.coreSafety.addProtectedHold("runtime-later-hold", "risk", "core")
          : runtime.humanAuthority.revoke(permitId, "later human revoke"))
          .finally(() => { controlSettled = true; });
        await waitForBlockedAdvisory();
        assert.equal(controlSettled, false);
        adapter.release();
        const attempt = await dispatchPromise;
        await controlPromise;
        assert.equal(attempt.state, "ATTEMPTED");
        assert.equal(adapter.calls, 1);
        if (operation === "REVOKE") assert.equal((await runtime.observer.permit(permitId))?.state, "REVOKED");
      },
    );
  });
});

test("HOLD committed before dispatch barrier prevents reservation and mock start evidence", async () => {
  await reset(); await must(psql(fixture("hold-permit") + claimSql("hold-permit", "hold-attempt")), "hold fixture");
  await must(psql("BEGIN; SELECT pg_advisory_xact_lock(71001); INSERT INTO navigator_stage1.holds(id,reason,provenance) VALUES('pre-dispatch','risk','core'); UPDATE navigator_stage1.execution_gate SET state='HOLD'; COMMIT;"), "commit HOLD");
  const dispatch = await psql(reserveSql("hold-attempt", "hold-fence") + "INSERT INTO navigator_stage1.audit_events(kind,subject_id) VALUES('MOCK_ADAPTER_START','hold-attempt');");
  assert.notEqual(dispatch.code, 0);
  const starts = await must(psql("SELECT count(*) FROM navigator_stage1.audit_events WHERE kind='MOCK_ADAPTER_START';"), "start count");
  assert.equal(starts.stdout.trim(), "0");
});

test("dispatch barrier acquired first orders mock start before later HOLD commit", async () => {
  await reset(); await must(psql(fixture("barrier-permit") + claimSql("barrier-permit", "barrier-attempt")), "barrier fixture");
  const dispatchSession = psql(`
    SELECT pg_advisory_lock(71001);
    SELECT pg_advisory_lock(71002,hashtext('proposal-1'));
    SELECT pg_advisory_lock(71003,hashtext('barrier-permit'));
    SELECT pg_advisory_lock(71004,hashtext('barrier-attempt'));
    BEGIN; ${reserveSql("barrier-attempt", "barrier-fence")}
    INSERT INTO navigator_stage1.audit_events(kind,subject_id) VALUES('MOCK_ADAPTER_START','barrier-attempt'); COMMIT;
    SELECT pg_sleep(0.7);
    SELECT pg_advisory_unlock(71004,hashtext('barrier-attempt'));
    SELECT pg_advisory_unlock(71003,hashtext('barrier-permit'));
    SELECT pg_advisory_unlock(71002,hashtext('proposal-1'));
    SELECT pg_advisory_unlock(71001);
  `);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const holdSession = psql(`BEGIN; SELECT pg_advisory_xact_lock(71001); INSERT INTO navigator_stage1.holds(id,reason,provenance) VALUES('later-hold','risk','core'); UPDATE navigator_stage1.execution_gate SET state='HOLD'; INSERT INTO navigator_stage1.audit_events(kind,subject_id) VALUES('HOLD_COMMITTED','later-hold'); COMMIT;`);
  const [dispatch, hold] = await Promise.all([dispatchSession, holdSession]);
  assert.equal(dispatch.code, 0, dispatch.stderr); assert.equal(hold.code, 0, hold.stderr);
  const order = await must(psql("SELECT string_agg(kind,',' ORDER BY sequence) FROM navigator_stage1.audit_events WHERE kind IN ('MOCK_ADAPTER_START','HOLD_COMMITTED');"), "event order");
  assert.equal(order.stdout.trim(), "MOCK_ADAPTER_START,HOLD_COMMITTED");
});

test("corrupted persistent rows fail database constraints", async () => {
  await reset();
  const malformedPermit = await psql("INSERT INTO navigator_stage1.permits(id,envelope,envelope_digest,state,issued_at,expires_at) VALUES('bad','[]','no','ISSUED',clock_timestamp(),clock_timestamp()+interval '1 hour');");
  const malformedState = await psql("INSERT INTO navigator_stage1.current_state(scope_id,version,dependency_digest,known) VALUES('p','v','bad',true);");
  assert.notEqual(malformedPermit.code, 0); assert.notEqual(malformedState.code, 0);
});
