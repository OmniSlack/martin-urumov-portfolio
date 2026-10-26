import type { ActionEnvelope, AttemptSnapshot, CoreDecisionSnapshot, CoreDecisionState, JsonValue, PermitSnapshot } from "./model.ts";

export interface IssuePermitCommand {
  readonly permitId: string;
  readonly envelope: unknown;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface RecordCoreDecisionCommand {
  readonly envelope: unknown;
  readonly decision: CoreDecisionState;
  readonly reason: string;
  readonly provenance: string;
}

export interface ClaimCommand {
  readonly permitId: string;
  readonly envelope: unknown;
}

export interface DispatchCommand {
  readonly attemptId: string;
  readonly envelope: unknown;
}

export interface ClaimResult {
  readonly permit: PermitSnapshot;
  readonly attempt: AttemptSnapshot;
}

export interface AdapterStartResult {
  readonly started: boolean;
  readonly report: JsonValue | null;
}

export interface AdapterStartPort {
  start(envelope: ActionEnvelope, fence: string): Promise<AdapterStartResult>;
}

export interface HumanAuthorityPort {
  issue(command: IssuePermitCommand): Promise<PermitSnapshot>;
  revoke(permitId: string, reason: string): Promise<PermitSnapshot>;
}

export interface CoreSafetyPort {
  recordDecision(command: RecordCoreDecisionCommand): Promise<CoreDecisionSnapshot>;
  addProtectedHold(holdId: string, reason: string, provenance: string): Promise<void>;
  resolveProtectedHold(holdId: string, resolutionEvidence: string, provenance: string): Promise<void>;
}

export interface StateAuthorityPort {
  observe(scopeId: string, version: string, dependencies: Readonly<Record<string, string>>, known: boolean): Promise<void>;
}

export interface SafetyControlPort {
  stop(reason: string): Promise<void>;
  markUnknown(reason: string): Promise<void>;
}

export interface ExecutionControlPort {
  claim(command: ClaimCommand): Promise<ClaimResult>;
  dispatch(command: DispatchCommand): Promise<AttemptSnapshot>;
}

export interface ReconcilerPort {
  failClosedAbandoned(attemptId: string, evidence: string): Promise<AttemptSnapshot>;
}

export interface NavigatorPort {
  propose(envelope: unknown): ActionEnvelope;
}

export interface ReadOnlyObserverPort {
  permit(id: string): Promise<PermitSnapshot | null>;
  attempt(id: string): Promise<AttemptSnapshot | null>;
}
