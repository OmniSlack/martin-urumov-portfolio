import type { ActionEnvelope, AttemptSnapshot, CoreDecisionSnapshot, CoreDecisionState, JsonValue, PermitSnapshot } from "./model.ts";

export interface ClaimInput {
  readonly permitId: string;
  readonly envelope: ActionEnvelope;
  readonly envelopeDigest: string;
  readonly dependencyDigest: string;
  readonly attemptId: string;
}

export interface DispatchInput {
  readonly attemptId: string;
  readonly envelope: ActionEnvelope;
  readonly envelopeDigest: string;
  readonly dependencyDigest: string;
  readonly fence: string;
}

export interface DispatchReservation {
  readonly permit: PermitSnapshot;
  readonly attempt: AttemptSnapshot;
  readonly release: () => Promise<void>;
}

export interface ControlRepository {
  issuePermit(permitId: string, envelope: ActionEnvelope, digest: string, issuedAt: string, expiresAt: string): Promise<PermitSnapshot>;
  revokePermit(permitId: string, reason: string): Promise<PermitSnapshot>;
  recordCoreDecision(proposalId: string, envelopeDigest: string, version: string, dependencyDigest: string, decision: CoreDecisionState, reason: string, provenance: string): Promise<CoreDecisionSnapshot>;
  addHold(holdId: string, reason: string, provenance: string): Promise<void>;
  resolveExactHold(holdId: string, resolutionEvidence: string, provenance: string): Promise<void>;
  observeState(scopeId: string, version: string, dependencyDigest: string, known: boolean): Promise<void>;
  stop(reason: string): Promise<void>;
  markGateUnknown(reason: string): Promise<void>;
  atomicClaim(input: ClaimInput): Promise<{ readonly permit: PermitSnapshot; readonly attempt: AttemptSnapshot }>;
  reserveDispatch(input: DispatchInput): Promise<DispatchReservation>;
  recordAdapterStart(attemptId: string, fence: string, report: JsonValue | null): Promise<AttemptSnapshot>;
  recordNoStart(attemptId: string, fence: string): Promise<AttemptSnapshot>;
  recordAmbiguousStart(attemptId: string, fence: string, evidence: string): Promise<AttemptSnapshot>;
  failClosedAbandoned(attemptId: string, evidence: string): Promise<AttemptSnapshot>;
  getPermit(id: string): Promise<PermitSnapshot | null>;
  getAttempt(id: string): Promise<AttemptSnapshot | null>;
}
