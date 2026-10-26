'use strict';
/**
 * EXECUTION ATTEMPT LIFECYCLE — Navigator ACCEPTED DESIGN v0.4, §7 and §12
 *
 * Spec lines this module enforces, verbatim:
 *   REQUESTED / CLAIMED / ATTEMPTED / COMPLETED / VERIFIED / FAILED / UNKNOWN
 *   "These states must not be collapsed."
 *   "Crash, timeout, disconnect, or ambiguous external response must not
 *    automatically mean that execution did or did not happen."
 *   UNKNOWN EXECUTION ≠ SAFE TO RETRY
 *   RESUME ≠ RE-EXECUTE
 *   "A crash after claim does not silently restore the permit to ISSUED."
 *
 * The whole point of the module is what it REFUSES, so every refusal throws a
 * named error rather than returning a falsy value a caller could ignore.
 *
 * STATUS: CANDIDATE. Not authorized for implementation.
 */

const STATES = Object.freeze([
  'REQUESTED', 'CLAIMED', 'ATTEMPTED',
  'COMPLETED', 'FAILED', 'UNKNOWN', 'VERIFIED',
]);

/**
 * Allowed transitions. Note the deliberate absences:
 *   - nothing returns to REQUESTED (a claimed permit never becomes unclaimed)
 *   - UNKNOWN goes nowhere without human authority
 *   - COMPLETED does not reach VERIFIED on its own — only the Verifier moves it
 */
const ALLOWED = Object.freeze({
  REQUESTED: ['CLAIMED'],
  CLAIMED:   ['ATTEMPTED', 'FAILED'],        // FAILED = never dispatched
  ATTEMPTED: ['COMPLETED', 'FAILED', 'UNKNOWN'],
  COMPLETED: ['VERIFIED', 'FAILED'],         // FAILED = verifier contradicted
  FAILED:    [],
  UNKNOWN:   [],                             // terminal without a human decision
  VERIFIED:  [],
});

class AuthorityError extends Error {
  constructor(message, code) { super(message); this.name = 'AuthorityError'; this.code = code; }
}

class ExecutionAttempt {
  /** @param {{permitId:string, envelopeHash:string}} init */
  constructor(init) {
    if (!init || !init.permitId) throw new AuthorityError('permitId required', 'NO_PERMIT');
    if (!init.envelopeHash) throw new AuthorityError('envelopeHash required', 'NO_ENVELOPE');
    this.permitId = init.permitId;
    this.envelopeHash = init.envelopeHash;
    this.state = 'REQUESTED';
    /** @type {{from:string,to:string,reason:string,at:number}[]} */
    this.history = [];
  }

  /** @param {string} to @param {string} reason */
  transition(to, reason) {
    if (!STATES.includes(to)) throw new AuthorityError(`unknown state ${to}`, 'BAD_STATE');
    if (!ALLOWED[this.state].includes(to)) {
      throw new AuthorityError(
        `refused ${this.state} → ${to}: not an allowed transition`,
        'ILLEGAL_TRANSITION',
      );
    }
    this.history.push({ from: this.state, to, reason, at: Date.now() });
    this.state = to;
    return this;
  }

  /**
   * The single question Execution Control is allowed to ask before re-dispatch.
   * It is never "did it fail?" — it is "do we know it did not happen?"
   */
  isSafeToRetry() {
    if (this.state === 'UNKNOWN') return false;   // UNKNOWN EXECUTION ≠ SAFE TO RETRY
    if (this.state === 'ATTEMPTED') return false; // in flight; outcome not yet known
    return this.state === 'FAILED' && this.#failedBeforeDispatch();
  }

  #failedBeforeDispatch() {
    const last = this.history[this.history.length - 1];
    return Boolean(last && last.from === 'CLAIMED' && last.to === 'FAILED');
  }

  /**
   * RESUME ≠ RE-EXECUTE. A human resume clears a HOLD; it does not create a new
   * execution right for an attempt whose outcome is unknown.
   */
  humanResume({ humanId, scope }) {
    if (!humanId) throw new AuthorityError('humanId required', 'NO_HUMAN');
    if (this.state === 'UNKNOWN') {
      throw new AuthorityError(
        'resume refused: attempt outcome UNKNOWN — reconciliation required, ' +
        'a new permit is needed for any further execution',
        'RESUME_NOT_REEXECUTE',
      );
    }
    this.history.push({
      from: this.state, to: this.state,
      reason: `human resume by ${humanId} within scope ${scope}`, at: Date.now(),
    });
    return this;
  }
}

module.exports = { STATES, ALLOWED, ExecutionAttempt, AuthorityError };
