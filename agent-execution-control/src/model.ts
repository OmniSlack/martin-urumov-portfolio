import { createHash, randomUUID } from "node:crypto";

export const PERMIT_STATES = ["ISSUED", "CLAIMED", "CONSUMED", "REVOKED", "EXPIRED", "UNKNOWN"] as const;
export type PermitState = (typeof PERMIT_STATES)[number];

export const ATTEMPT_STATES = ["REQUESTED", "CLAIMED", "ATTEMPTED", "COMPLETED", "VERIFIED", "FAILED", "CANCELLED", "UNKNOWN"] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

export const GATE_STATES = ["OPEN", "HOLD", "STOP", "UNKNOWN"] as const;
export type GateState = (typeof GATE_STATES)[number];

export const CORE_DECISION_STATES = ["CLEAR", "HOLD", "UNKNOWN"] as const;
export type CoreDecisionState = (typeof CORE_DECISION_STATES)[number];

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { readonly [key: string]: JsonValue };

export interface ActionEnvelope {
  readonly proposalId: string;
  readonly action: string;
  readonly object: string;
  readonly target: string;
  readonly scope: readonly string[];
  readonly version: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly expectedEffect: string;
  readonly constraints: readonly string[];
  readonly reversible: "REVERSIBLE" | "PARTIAL" | "IRREVERSIBLE" | "UNKNOWN";
  readonly provenance: readonly string[];
  readonly unresolvedUncertainty: readonly string[];
}

export interface PermitSnapshot {
  readonly id: string;
  readonly envelope: ActionEnvelope;
  readonly envelopeDigest: string;
  readonly state: PermitState;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly claimedAttemptId: string | null;
  readonly revision: number;
}

export interface AttemptSnapshot {
  readonly id: string;
  readonly permitId: string;
  readonly proposalId: string;
  readonly state: AttemptState;
  readonly dispatchFence: string | null;
  readonly adapterOutcome: JsonValue | null;
  readonly verificationOutcome: JsonValue | null;
  readonly invocationStarted: boolean;
  readonly revision: number;
}

export interface CoreDecisionSnapshot {
  readonly proposalId: string;
  readonly envelopeDigest: string;
  readonly version: string;
  readonly dependencyDigest: string;
  readonly decision: CoreDecisionState;
  readonly reason: string;
  readonly provenance: string;
  readonly revision: number;
}

export class ValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${key} must be a non-empty string`);
  }
  return value;
}

function stringArray(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new ValidationError(`${key} must be an array of non-empty strings`);
  }
  return Object.freeze([...value]) as readonly string[];
}

function stringRecord(record: Record<string, unknown>, key: string): Readonly<Record<string, string>> {
  const value = record[key];
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new ValidationError(`${key} must be an object with non-empty string values`);
  }
  return Object.freeze({ ...value }) as Readonly<Record<string, string>>;
}

export function parseActionEnvelope(input: unknown): ActionEnvelope {
  if (!isRecord(input)) throw new ValidationError("envelope must be an object");
  const reversible = input.reversible;
  if (reversible !== "REVERSIBLE" && reversible !== "PARTIAL" && reversible !== "IRREVERSIBLE" && reversible !== "UNKNOWN") {
    throw new ValidationError("reversible has an invalid value");
  }
  const envelope: ActionEnvelope = {
    proposalId: requiredString(input, "proposalId"),
    action: requiredString(input, "action"),
    object: requiredString(input, "object"),
    target: requiredString(input, "target"),
    scope: stringArray(input, "scope"),
    version: requiredString(input, "version"),
    dependencies: stringRecord(input, "dependencies"),
    expectedEffect: requiredString(input, "expectedEffect"),
    constraints: stringArray(input, "constraints"),
    reversible,
    provenance: stringArray(input, "provenance"),
    unresolvedUncertainty: stringArray(input, "unresolvedUncertainty"),
  };
  return Object.freeze(envelope);
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key]!)}`).join(",")}}`;
}

export function envelopeDigest(envelope: ActionEnvelope): string {
  return createHash("sha256").update(canonicalize(envelope as unknown as JsonValue)).digest("hex");
}

export function dependencyDigest(dependencies: Readonly<Record<string, string>>): string {
  return createHash("sha256").update(canonicalize(dependencies as JsonValue)).digest("hex");
}

export function newIdentity(prefix: "attempt" | "fence"): string {
  return `${prefix}_${randomUUID()}`;
}

export function parseIsoInstant(value: unknown, field: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(`${field} must be an ISO timestamp`);
  }
  return value;
}
