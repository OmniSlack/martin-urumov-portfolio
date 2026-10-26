import { CORE_DECISION_STATES, ValidationError, envelopeDigest, parseActionEnvelope, parseIsoInstant, dependencyDigest } from "./model.ts";
import { ExecutionControl } from "./execution-control.ts";
import type { ControlRepository } from "./repository.ts";
import type {
  AdapterStartPort,
  CoreSafetyPort,
  ExecutionControlPort,
  HumanAuthorityPort,
  NavigatorPort,
  ReadOnlyObserverPort,
  ReconcilerPort,
  SafetyControlPort,
  StateAuthorityPort,
  IssuePermitCommand,
  RecordCoreDecisionCommand,
} from "./ports.ts";

export interface RuntimeCapabilities {
  readonly humanAuthority: HumanAuthorityPort;
  readonly coreSafety: CoreSafetyPort;
  readonly stateAuthority: StateAuthorityPort;
  readonly safetyControl: SafetyControlPort;
  readonly executionControl: ExecutionControlPort;
  readonly reconciler: ReconcilerPort;
  readonly navigator: NavigatorPort;
  readonly observer: ReadOnlyObserverPort;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ValidationError(`${label} is required`);
  return value;
}

export function composeRuntime(repository: ControlRepository, adapterStart: AdapterStartPort): RuntimeCapabilities {
  const executionControl = new ExecutionControl(repository, adapterStart);
  const humanAuthority: HumanAuthorityPort = Object.freeze({
      issue: async (command: IssuePermitCommand) => {
        const envelope = parseActionEnvelope(command.envelope);
        return repository.issuePermit(
          command.permitId,
          envelope,
          envelopeDigest(envelope),
          parseIsoInstant(command.issuedAt, "issuedAt"),
          parseIsoInstant(command.expiresAt, "expiresAt"),
        );
      },
      revoke: (permitId: string, reason: string) => repository.revokePermit(permitId, reason),
    });
  const coreSafety: CoreSafetyPort = Object.freeze({
      recordDecision: async (command: RecordCoreDecisionCommand) => {
        const envelope = parseActionEnvelope(command.envelope);
        if (!CORE_DECISION_STATES.includes(command.decision)) throw new ValidationError("invalid Core decision");
        const reason = requiredText(command.reason, "Core decision reason");
        const provenance = requiredText(command.provenance, "Core decision provenance");
        return repository.recordCoreDecision(
          envelope.proposalId,
          envelopeDigest(envelope),
          envelope.version,
          dependencyDigest(envelope.dependencies),
          command.decision,
          reason,
          provenance,
        );
      },
      addProtectedHold: (holdId: string, reason: string, provenance: string) => repository.addHold(
        requiredText(holdId, "HOLD id"),
        requiredText(reason, "HOLD reason"),
        requiredText(provenance, "HOLD provenance"),
      ),
      resolveProtectedHold: (holdId: string, resolutionEvidence: string, provenance: string) => repository.resolveExactHold(
        requiredText(holdId, "HOLD id"),
        requiredText(resolutionEvidence, "Core resolution evidence"),
        requiredText(provenance, "Core resolution provenance"),
      ),
    });
  const stateAuthority: StateAuthorityPort = Object.freeze({
      observe: (scopeId: string, version: string, dependencies: Readonly<Record<string, string>>, known: boolean) => repository.observeState(scopeId, version, dependencyDigest(dependencies), known),
    });
  const safetyControl: SafetyControlPort = Object.freeze({
      stop: (reason: string) => repository.stop(reason),
      markUnknown: (reason: string) => repository.markGateUnknown(reason),
    });
  const reconciler: ReconcilerPort = Object.freeze({
      failClosedAbandoned: (attemptId: string, evidence: string) => repository.failClosedAbandoned(attemptId, evidence),
    });
  const navigator: NavigatorPort = Object.freeze({ propose: parseActionEnvelope });
  const observer: ReadOnlyObserverPort = Object.freeze({
      permit: (id: string) => repository.getPermit(id),
      attempt: (id: string) => repository.getAttempt(id),
    });

  return Object.freeze({
    humanAuthority,
    coreSafety,
    stateAuthority,
    safetyControl,
    executionControl,
    reconciler,
    navigator,
    observer,
  });
}
