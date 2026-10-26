import assert from "node:assert/strict";
import test from "node:test";
import { dependencyDigest, envelopeDigest } from "../../src/index.ts";
import { PostgresControlRepository } from "../../src/postgres/repository.ts";
import type { QueryResult, SqlPool, SqlSession } from "../../src/postgres/types.ts";
import { envelope, envelopeInput } from "../helpers.ts";

class RevokeSession implements SqlSession {
  public readonly queries: string[] = [];
  public released = false;
  private readonly transitionSucceeds: boolean;
  public constructor(transitionSucceeds: boolean) { this.transitionSucceeds = transitionSucceeds; }

  public async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string): Promise<QueryResult<Row>> {
    this.queries.push(text);
    if (text.includes("UPDATE navigator_stage1.permits")) {
      const rows = this.transitionSucceeds ? [{
        id: "permit-1",
        envelope: envelopeInput,
        envelope_digest: "a".repeat(64),
        state: "REVOKED",
        issued_at: "2030-01-01T00:00:00.000Z",
        expires_at: "2030-01-02T00:00:00.000Z",
        claimed_attempt_id: null,
        revision: 1,
      }] : [];
      return { rows, rowCount: rows.length } as unknown as QueryResult<Row>;
    }
    return { rows: [], rowCount: 0 } as unknown as QueryResult<Row>;
  }

  public release(): void { this.released = true; }
}

class RevokePool implements SqlPool {
  public readonly session: RevokeSession;
  public constructor(session: RevokeSession) { this.session = session; }
  public async connect(): Promise<SqlSession> { return this.session; }
  public async query<Row extends Record<string, unknown> = Record<string, unknown>>(): Promise<QueryResult<Row>> {
    throw new Error("pool.query is not expected");
  }
}

class IssueSession implements SqlSession {
  public readonly queries: string[] = [];
  public released = false;
  private readonly decision: "CLEAR" | "HOLD" | "UNKNOWN";
  public constructor(decision: "CLEAR" | "HOLD" | "UNKNOWN") { this.decision = decision; }

  public async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string): Promise<QueryResult<Row>> {
    this.queries.push(text);
    const value = envelope();
    const depDigest = dependencyDigest(value.dependencies);
    if (text.includes("SELECT state,NOT EXISTS")) return { rows: [{ state: "OPEN", no_holds: true }] as unknown as Row[], rowCount: 1 };
    if (text.includes("SELECT version,dependency_digest,known")) return { rows: [{ version: value.version, dependency_digest: depDigest, known: true }] as unknown as Row[], rowCount: 1 };
    if (text.includes("FROM navigator_stage1.core_decisions")) return { rows: [{
      proposal_id: value.proposalId,
      envelope_digest: envelopeDigest(value),
      version: value.version,
      dependency_digest: depDigest,
      decision: this.decision,
      reason: "assessment",
      provenance: "core",
      revision: 2,
    }] as unknown as Row[], rowCount: 1 };
    if (text.includes("INSERT INTO navigator_stage1.permits")) return { rows: [{
      id: "permit-1",
      envelope: value,
      envelope_digest: envelopeDigest(value),
      state: "ISSUED",
      issued_at: "2030-01-01T00:00:00.000Z",
      expires_at: "2030-01-02T00:00:00.000Z",
      claimed_attempt_id: null,
      revision: 0,
    }] as unknown as Row[], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }

  public release(): void { this.released = true; }
}

class IssuePool implements SqlPool {
  public readonly session: IssueSession;
  public constructor(session: IssueSession) { this.session = session; }
  public async connect(): Promise<SqlSession> { return this.session; }
  public async query<Row extends Record<string, unknown> = Record<string, unknown>>(): Promise<QueryResult<Row>> {
    throw new Error("pool.query is not expected");
  }
}

test("failed revoke rolls back without committing false PERMIT_REVOKED evidence", async () => {
  const session = new RevokeSession(false);
  const repository = new PostgresControlRepository(new RevokePool(session));
  await assert.rejects(repository.revokePermit("missing-or-terminal", "reviewed"), /returned no row/);
  assert.equal(session.queries.some((query) => query.includes("PERMIT_REVOKED")), false);
  assert.equal(session.queries.includes("COMMIT"), false);
  assert.equal(session.queries.includes("ROLLBACK"), true);
  assert.equal(session.released, true);
});

test("successful revoke records evidence after transition and before commit", async () => {
  const session = new RevokeSession(true);
  const repository = new PostgresControlRepository(new RevokePool(session));
  const permit = await repository.revokePermit("permit-1", "reviewed");
  const transition = session.queries.findIndex((query) => query.includes("UPDATE navigator_stage1.permits"));
  const audit = session.queries.findIndex((query) => query.includes("PERMIT_REVOKED"));
  const commit = session.queries.indexOf("COMMIT");
  assert.equal(permit.state, "REVOKED");
  assert.ok(transition >= 0 && transition < audit && audit < commit);
  assert.equal(session.released, true);
});

test("Postgres repository refuses Human Permit issue while exact Core decision is HOLD", async () => {
  const session = new IssueSession("HOLD");
  const repository = new PostgresControlRepository(new IssuePool(session));
  const value = envelope();
  await assert.rejects(repository.issuePermit("permit-1", value, envelopeDigest(value), "2030-01-01T00:00:00.000Z", "2030-01-02T00:00:00.000Z"), /Core CLEAR/);
  assert.equal(session.queries.some((query) => query.includes("INSERT INTO navigator_stage1.permits")), false);
  assert.equal(session.queries.includes("ROLLBACK"), true);
  assert.equal(session.released, true);
});

test("Postgres repository issues only after exact Core CLEAR and audits before commit", async () => {
  const session = new IssueSession("CLEAR");
  const repository = new PostgresControlRepository(new IssuePool(session));
  const value = envelope();
  const permit = await repository.issuePermit("permit-1", value, envelopeDigest(value), "2030-01-01T00:00:00.000Z", "2030-01-02T00:00:00.000Z");
  const core = session.queries.findIndex((query) => query.includes("FROM navigator_stage1.core_decisions"));
  const issue = session.queries.findIndex((query) => query.includes("INSERT INTO navigator_stage1.permits"));
  const audit = session.queries.findIndex((query) => query.includes("PERMIT_ISSUED"));
  const commit = session.queries.indexOf("COMMIT");
  assert.equal(permit.state, "ISSUED");
  assert.ok(core >= 0 && core < issue && issue < audit && audit < commit);
  assert.equal(session.released, true);
});
