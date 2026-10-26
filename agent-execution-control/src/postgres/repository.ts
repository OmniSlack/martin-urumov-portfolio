import { dependencyDigest } from "../model.ts";
import type { ActionEnvelope, AttemptSnapshot, CoreDecisionSnapshot, CoreDecisionState, JsonValue, PermitSnapshot } from "../model.ts";
import type { ClaimInput, ControlRepository, DispatchInput, DispatchReservation } from "../repository.ts";
import type { QueryResult, SqlPool, SqlSession } from "./types.ts";

interface PermitRow extends Record<string, unknown> {
  id: string;
  envelope: ActionEnvelope;
  envelope_digest: string;
  state: PermitSnapshot["state"];
  issued_at: Date | string;
  expires_at: Date | string;
  claimed_attempt_id: string | null;
  revision: number;
}

interface AttemptRow extends Record<string, unknown> {
  id: string;
  permit_id: string;
  proposal_id: string;
  state: AttemptSnapshot["state"];
  dispatch_fence: string | null;
  adapter_outcome: JsonValue | null;
  verification_outcome: JsonValue | null;
  invocation_started: boolean;
  revision: number;
}

interface AuthorityResultRow extends Record<string, unknown> {
  permit: PermitRow;
  attempt: AttemptRow | null;
}

interface CoreDecisionRow extends Record<string, unknown> {
  proposal_id: string;
  envelope_digest: string;
  version: string;
  dependency_digest: string;
  decision: CoreDecisionState;
  reason: string;
  provenance: string;
  revision: number;
}

function instant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function permitFrom(row: PermitRow): PermitSnapshot {
  return {
    id: row.id,
    envelope: row.envelope,
    envelopeDigest: row.envelope_digest,
    state: row.state,
    issuedAt: instant(row.issued_at),
    expiresAt: instant(row.expires_at),
    claimedAttemptId: row.claimed_attempt_id,
    revision: row.revision,
  };
}

function attemptFrom(row: AttemptRow): AttemptSnapshot {
  return {
    id: row.id,
    permitId: row.permit_id,
    proposalId: row.proposal_id,
    state: row.state,
    dispatchFence: row.dispatch_fence,
    adapterOutcome: row.adapter_outcome,
    verificationOutcome: row.verification_outcome,
    invocationStarted: row.invocation_started,
    revision: row.revision,
  };
}

function coreDecisionFrom(row: CoreDecisionRow): CoreDecisionSnapshot {
  return {
    proposalId: row.proposal_id,
    envelopeDigest: row.envelope_digest,
    version: row.version,
    dependencyDigest: row.dependency_digest,
    decision: row.decision,
    reason: row.reason,
    provenance: row.provenance,
    revision: row.revision,
  };
}

function one<Row extends Record<string, unknown>>(result: QueryResult<Row>, label: string): Row {
  const row = result.rows[0];
  if (!row) throw new Error(`${label} returned no row`);
  return row;
}

export class PostgresControlRepository implements ControlRepository {
  private readonly pool: SqlPool;

  public constructor(pool: SqlPool) { this.pool = pool; }

  public async issuePermit(permitId: string, envelope: ActionEnvelope, digest: string, issuedAt: string, expiresAt: string): Promise<PermitSnapshot> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      await session.query("SELECT pg_advisory_xact_lock(71001)");
      const gate = one(await session.query<{ state: string; no_holds: boolean }>(
        `SELECT state,NOT EXISTS(SELECT 1 FROM navigator_stage1.holds) AS no_holds
         FROM navigator_stage1.execution_gate WHERE singleton=true FOR UPDATE`,
      ), "issuePermit gate");
      if (gate.state !== "OPEN" || !gate.no_holds) throw new Error("execution gate is not OPEN");

      await session.query("SELECT pg_advisory_xact_lock(71002, hashtext($1))", [envelope.proposalId]);
      const state = one(await session.query<{ version: string; dependency_digest: string; known: boolean }>(
        `SELECT version,dependency_digest,known FROM navigator_stage1.current_state WHERE scope_id=$1 FOR UPDATE`,
        [envelope.proposalId],
      ), "issuePermit current state");
      const expectedDependencyDigest = dependencyDigest(envelope.dependencies);
      if (!state.known || state.version !== envelope.version || state.dependency_digest !== expectedDependencyDigest) {
        throw new Error("state/dependency mismatch or UNKNOWN");
      }
      const core = one(await session.query<CoreDecisionRow>(
        `SELECT * FROM navigator_stage1.core_decisions WHERE proposal_id=$1 FOR UPDATE`,
        [envelope.proposalId],
      ), "issuePermit Core decision");
      if (core.decision !== "CLEAR" || core.envelope_digest !== digest || core.version !== envelope.version || core.dependency_digest !== expectedDependencyDigest) {
        throw new Error("exact Core CLEAR required");
      }

      await session.query("SELECT pg_advisory_xact_lock(71003, hashtext($1))", [permitId]);
      const result = await session.query<PermitRow>(
        `INSERT INTO navigator_stage1.permits(id,envelope,envelope_digest,state,issued_at,expires_at)
         VALUES($1,$2::jsonb,$3,'ISSUED',$4::timestamptz,$5::timestamptz) RETURNING *`,
        [permitId, JSON.stringify(envelope), digest, issuedAt, expiresAt],
      );
      const permit = permitFrom(one(result, "issuePermit"));
      await session.query(
        `INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence)
         VALUES('PERMIT_ISSUED',$1,jsonb_build_object('proposalId',$2::text,'coreDecisionRevision',$3::bigint))`,
        [permitId, envelope.proposalId, core.revision],
      );
      await session.query("COMMIT");
      return permit;
    } catch (error) {
      await this.rollbackQuietly(session);
      throw error;
    } finally { session.release(); }
  }

  public async revokePermit(permitId: string, reason: string): Promise<PermitSnapshot> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      await this.acquireGatePermit(session, permitId);
      const result = await session.query<PermitRow>(
        `UPDATE navigator_stage1.permits SET state='REVOKED', revision=revision+1, updated_at=clock_timestamp()
         WHERE id=$1 AND state IN ('ISSUED','CLAIMED') RETURNING *`, [permitId],
      );
      const permit = permitFrom(one(result, "revokePermit"));
      await session.query(
        `INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence) VALUES('PERMIT_REVOKED',$1,jsonb_build_object('reason',$2::text))`,
        [permitId, reason],
      );
      await session.query("COMMIT");
      return permit;
    } catch (error) {
      await this.rollbackQuietly(session);
      throw error;
    } finally { session.release(); }
  }

  public async addHold(holdId: string, reason: string, provenance: string): Promise<void> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      await session.query("SELECT pg_advisory_xact_lock(71001)");
      await session.query(
        `INSERT INTO navigator_stage1.holds(id,reason,provenance) VALUES($1,$2,$3)`, [holdId, reason, provenance],
      );
      await session.query(`UPDATE navigator_stage1.execution_gate SET state=CASE WHEN state='STOP' THEN 'STOP' ELSE 'HOLD' END,revision=revision+1,updated_at=clock_timestamp() WHERE singleton=true`);
      await session.query("COMMIT");
    } catch (error) { await this.rollbackQuietly(session); throw error; } finally { session.release(); }
  }

  public async recordCoreDecision(proposalId: string, envelopeDigest: string, version: string, dependencyDigest: string, decision: CoreDecisionState, reason: string, provenance: string): Promise<CoreDecisionSnapshot> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      await session.query("SELECT pg_advisory_xact_lock(71002, hashtext($1))", [proposalId]);
      const result = await session.query<CoreDecisionRow>(
        `INSERT INTO navigator_stage1.core_decisions(proposal_id,envelope_digest,version,dependency_digest,decision,reason,provenance)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(proposal_id) DO UPDATE SET envelope_digest=EXCLUDED.envelope_digest,version=EXCLUDED.version,
           dependency_digest=EXCLUDED.dependency_digest,decision=EXCLUDED.decision,reason=EXCLUDED.reason,
           provenance=EXCLUDED.provenance,revision=navigator_stage1.core_decisions.revision+1,updated_at=clock_timestamp()
         RETURNING *`,
        [proposalId, envelopeDigest, version, dependencyDigest, decision, reason, provenance],
      );
      const snapshot = coreDecisionFrom(one(result, "recordCoreDecision"));
      await session.query(
        `INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence)
         VALUES('CORE_DECISION_RECORDED',$1,jsonb_build_object('decision',$2::text,'envelopeDigest',$3::text,'version',$4::text,'dependencyDigest',$5::text,'reason',$6::text,'provenance',$7::text,'revision',$8::bigint))`,
        [proposalId, decision, envelopeDigest, version, dependencyDigest, reason, provenance, snapshot.revision],
      );
      await session.query("COMMIT");
      return snapshot;
    } catch (error) {
      await this.rollbackQuietly(session);
      throw error;
    } finally { session.release(); }
  }

  public async resolveExactHold(holdId: string, resolutionEvidence: string, provenance: string): Promise<void> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      await session.query("SELECT pg_advisory_xact_lock(71001)");
      const deleted = await session.query(`DELETE FROM navigator_stage1.holds WHERE id=$1`, [holdId]);
      if (deleted.rowCount !== 1) throw new Error("exact HOLD does not exist");
      await session.query(
        `INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence) VALUES('CORE_HOLD_RESOLVED',$1,jsonb_build_object('resolutionEvidence',$2,'provenance',$3))`,
        [holdId, resolutionEvidence, provenance],
      );
      await session.query(
        `UPDATE navigator_stage1.execution_gate SET state=CASE WHEN state='STOP' THEN 'STOP' WHEN EXISTS(SELECT 1 FROM navigator_stage1.holds) THEN 'HOLD' ELSE 'OPEN' END,
         revision=revision+1,updated_at=clock_timestamp() WHERE singleton=true`,
      );
      await session.query("COMMIT");
    } catch (error) { await this.rollbackQuietly(session); throw error; } finally { session.release(); }
  }

  public async observeState(scopeId: string, version: string, dependencyDigest: string, known: boolean): Promise<void> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      await session.query("SELECT pg_advisory_xact_lock(71002, hashtext($1))", [scopeId]);
      await session.query(
        `INSERT INTO navigator_stage1.current_state(scope_id,version,dependency_digest,known)
         VALUES($1,$2,$3,$4) ON CONFLICT(scope_id) DO UPDATE SET version=EXCLUDED.version,dependency_digest=EXCLUDED.dependency_digest,
         known=EXCLUDED.known,revision=navigator_stage1.current_state.revision+1,updated_at=clock_timestamp()`,
        [scopeId, version, dependencyDigest, known],
      );
      await session.query("COMMIT");
    } catch (error) { await this.rollbackQuietly(session); throw error; } finally { session.release(); }
  }

  public stop(reason: string): Promise<void> { return this.setGate("STOP", reason); }
  public markGateUnknown(reason: string): Promise<void> { return this.setGate("UNKNOWN", reason); }

  public async atomicClaim(input: ClaimInput): Promise<{ readonly permit: PermitSnapshot; readonly attempt: AttemptSnapshot }> {
    const result = await this.pool.query<AuthorityResultRow>(
      `SELECT * FROM navigator_stage1.claim_permit($1,$2,$3,$4,$5,$6)`,
      [input.permitId, input.attemptId, input.envelope.proposalId, input.envelopeDigest, input.envelope.version, input.dependencyDigest],
    );
    const row = one(result, "atomicClaim");
    const permit = permitFrom(row.permit);
    if (permit.state === "EXPIRED") throw new Error("permit expired");
    if (row.attempt === null) {
      throw new Error("atomicClaim returned no attempt");
    }
    return { permit, attempt: attemptFrom(row.attempt) };
  }

  public async reserveDispatch(input: DispatchInput): Promise<DispatchReservation> {
    const session = await this.pool.connect();
    let barriersHeld = false;
    let permitId = "";
    try {
      permitId = await this.acquireSessionBarriers(session, input.envelope.proposalId, input.attemptId);
      barriersHeld = true;
      await session.query("BEGIN");
      const result = await session.query<AuthorityResultRow>(
        `SELECT * FROM navigator_stage1.reserve_dispatch($1,$2,$3,$4,$5,$6)`,
        [input.attemptId, input.fence, input.envelopeDigest, input.envelope.version, input.dependencyDigest, input.envelope.proposalId],
      );
      const row = one(result, "reserveDispatch");
      await session.query("COMMIT");
      const permit = permitFrom(row.permit);
      if (permit.state === "EXPIRED") throw new Error("permit expired at dispatch");
      if (row.attempt === null) {
        throw new Error("reserveDispatch returned no attempt");
      }
      let released = false;
      return {
        permit,
        attempt: attemptFrom(row.attempt),
        release: async () => {
          if (released) return;
          released = true;
          await this.releaseSessionBarriers(session, input.envelope.proposalId, permitId, input.attemptId);
          session.release();
        },
      };
    } catch (error) {
      await this.rollbackQuietly(session);
      if (barriersHeld) await this.releaseSessionBarriers(session, input.envelope.proposalId, permitId, input.attemptId);
      else await session.query("SELECT pg_advisory_unlock_all()");
      session.release();
      throw error;
    }
  }

  public recordAdapterStart(attemptId: string, fence: string, report: JsonValue | null): Promise<AttemptSnapshot> {
    return this.transitionStart(attemptId, fence, "ATTEMPTED", true, report);
  }
  public recordNoStart(attemptId: string, fence: string): Promise<AttemptSnapshot> {
    return this.transitionStart(attemptId, fence, "CANCELLED", false, null);
  }
  public recordAmbiguousStart(attemptId: string, fence: string, evidence: string): Promise<AttemptSnapshot> {
    return this.transitionStart(attemptId, fence, "UNKNOWN", false, { evidence });
  }

  public async failClosedAbandoned(attemptId: string, evidence: string): Promise<AttemptSnapshot> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      await session.query("SELECT pg_advisory_xact_lock(71001)");
      const identity = one(await session.query<{ permit_id: string; proposal_id: string }>(
        `SELECT permit_id,proposal_id FROM navigator_stage1.attempts WHERE id=$1`, [attemptId],
      ), "reconciliation identity");
      await session.query("SELECT pg_advisory_xact_lock(71002, hashtext($1))", [identity.proposal_id]);
      await session.query("SELECT pg_advisory_xact_lock(71003, hashtext($1))", [identity.permit_id]);
      await session.query("SELECT pg_advisory_xact_lock(71004, hashtext($1))", [attemptId]);
      const permit = one(await session.query<PermitRow>(
        `UPDATE navigator_stage1.permits SET state='UNKNOWN',revision=revision+1,updated_at=clock_timestamp()
         WHERE id=$1 AND state='CLAIMED' AND claimed_attempt_id=$2 RETURNING *`, [identity.permit_id, attemptId],
      ), "failClosedAbandoned permit");
      const attempt = one(await session.query<AttemptRow>(
        `UPDATE navigator_stage1.attempts SET state='UNKNOWN',adapter_outcome=jsonb_build_object('reconciliationEvidence',$2::text),
         revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 AND state='CLAIMED' RETURNING *`, [attemptId, evidence],
      ), "failClosedAbandoned attempt");
      await session.query(
        `INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence)
         VALUES('ABANDONED_RECONCILED_UNKNOWN',$1,jsonb_build_object('permitId',$2::text,'evidence',$3::text))`,
        [attemptId, permit.id, evidence],
      );
      await session.query("COMMIT");
      return attemptFrom(attempt);
    } catch (error) {
      await this.rollbackQuietly(session);
      throw error;
    } finally { session.release(); }
  }

  public async getPermit(id: string): Promise<PermitSnapshot | null> {
    const result = await this.pool.query<PermitRow>(`SELECT * FROM navigator_stage1.permits WHERE id=$1`, [id]);
    return result.rows[0] ? permitFrom(result.rows[0]) : null;
  }
  public async getAttempt(id: string): Promise<AttemptSnapshot | null> {
    const result = await this.pool.query<AttemptRow>(`SELECT * FROM navigator_stage1.attempts WHERE id=$1`, [id]);
    return result.rows[0] ? attemptFrom(result.rows[0]) : null;
  }

  private async setGate(state: "STOP" | "UNKNOWN", reason: string): Promise<void> {
    const session = await this.pool.connect();
    try {
      await session.query("BEGIN");
      await session.query("SELECT pg_advisory_xact_lock(71001)");
      await session.query(`UPDATE navigator_stage1.execution_gate SET state=$1,reason=$2,revision=revision+1,updated_at=clock_timestamp() WHERE singleton=true`, [state, reason]);
      await session.query("COMMIT");
    } catch (error) { await this.rollbackQuietly(session); throw error; } finally { session.release(); }
  }

  private async transitionStart(attemptId: string, fence: string, state: "ATTEMPTED" | "CANCELLED" | "UNKNOWN", started: boolean, report: JsonValue | null): Promise<AttemptSnapshot> {
    const result = await this.pool.query<AttemptRow>(
      `UPDATE navigator_stage1.attempts SET state=$3,invocation_started=$4,adapter_outcome=$5::jsonb,revision=revision+1,updated_at=clock_timestamp()
       WHERE id=$1 AND dispatch_fence=$2 AND state='CLAIMED' RETURNING *`,
      [attemptId, fence, state, started, JSON.stringify(report)],
    );
    return attemptFrom(one(result, "transitionStart"));
  }

  private async acquireGatePermit(session: SqlSession, permitId: string): Promise<void> {
    await session.query("SELECT pg_advisory_xact_lock(71001)");
    await session.query("SELECT pg_advisory_xact_lock(71003, hashtext($1))", [permitId]);
  }
  private async acquireSessionBarriers(session: SqlSession, scopeId: string, attemptId: string): Promise<string> {
    await session.query("SELECT pg_advisory_lock(71001)");
    await session.query("SELECT pg_advisory_lock(71002, hashtext($1))", [scopeId]);
    const lookup = await session.query<{ permit_id: string }>(`SELECT permit_id FROM navigator_stage1.attempts WHERE id=$1`, [attemptId]);
    const permitId = one(lookup, "dispatch attempt lookup").permit_id;
    await session.query("SELECT pg_advisory_lock(71003, hashtext($1))", [permitId]);
    await session.query("SELECT pg_advisory_lock(71004, hashtext($1))", [attemptId]);
    return permitId;
  }
  private async releaseSessionBarriers(session: SqlSession, scopeId: string, permitId: string, attemptId: string): Promise<void> {
    await session.query("SELECT pg_advisory_unlock(71004, hashtext($1))", [attemptId]);
    await session.query("SELECT pg_advisory_unlock(71003, hashtext($1))", [permitId]);
    await session.query("SELECT pg_advisory_unlock(71002, hashtext($1))", [scopeId]);
    await session.query("SELECT pg_advisory_unlock(71001)");
  }
  private async rollbackQuietly(session: SqlSession): Promise<void> {
    try { await session.query("ROLLBACK"); } catch { /* preserve original failure */ }
  }
}
