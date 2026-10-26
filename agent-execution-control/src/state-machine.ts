import type { AttemptState, PermitState } from "./model.ts";

export class InvalidTransitionError extends Error {
  public constructor(kind: "Permit" | "Attempt", from: string, to: string) {
    super(`${kind} transition ${from} -> ${to} is not allowed`);
    this.name = "InvalidTransitionError";
  }
}

const permitTransitions: Readonly<Record<PermitState, readonly PermitState[]>> = {
  ISSUED: ["CLAIMED", "REVOKED", "EXPIRED", "UNKNOWN"],
  CLAIMED: ["CONSUMED", "REVOKED", "EXPIRED", "UNKNOWN"],
  CONSUMED: [],
  REVOKED: [],
  EXPIRED: [],
  UNKNOWN: [],
};

const attemptTransitions: Readonly<Record<AttemptState, readonly AttemptState[]>> = {
  REQUESTED: ["CLAIMED", "CANCELLED"],
  CLAIMED: ["ATTEMPTED", "CANCELLED", "UNKNOWN"],
  ATTEMPTED: ["COMPLETED", "FAILED", "UNKNOWN"],
  COMPLETED: ["VERIFIED"],
  VERIFIED: [],
  FAILED: [],
  CANCELLED: [],
  UNKNOWN: [],
};

export function assertPermitTransition(from: PermitState, to: PermitState): void {
  if (!permitTransitions[from].includes(to)) throw new InvalidTransitionError("Permit", from, to);
}

export function assertAttemptTransition(from: AttemptState, to: AttemptState, invocationStarted: boolean): void {
  if (!attemptTransitions[from].includes(to)) throw new InvalidTransitionError("Attempt", from, to);
  if (to === "CANCELLED" && invocationStarted) {
    throw new InvalidTransitionError("Attempt", `${from}(invocationStarted=true)`, to);
  }
}
