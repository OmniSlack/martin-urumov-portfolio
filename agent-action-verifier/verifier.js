'use strict';
/**
 * VERIFIER — Navigator ACCEPTED DESIGN v0.4, §11
 *
 * Spec lines this module enforces, verbatim:
 *   "Where feasible, verification is separated from the Adapter's own success
 *    assertion."
 *   ADAPTER SUCCESS ≠ VERIFIED
 *   "If Adapter reports SUCCESS but independent verification contradicts it:
 *    CONFLICT / HOLD"
 *   "Verification failure or UNKNOWN does not itself authorize retry."
 *
 * The adapter's claim enters as DATA. It is never the conclusion. The function
 * takes two independent inputs and refuses to run if they came from one source.
 *
 * STATUS: CANDIDATE. Not authorized for implementation.
 */

const { AuthorityError } = require('./attempt.js');

const ADAPTER_ASSERTIONS = Object.freeze(['SUCCESS', 'FAILURE', 'AMBIGUOUS']);
const PROBE_RESULTS      = Object.freeze(['EFFECT_PRESENT', 'EFFECT_ABSENT', 'EFFECT_PARTIAL', 'NO_READING']);
const OUTCOMES           = Object.freeze(['VERIFIED', 'CONTRADICTED', 'PARTIAL', 'UNKNOWN']);

/**
 * @param {{assertion:string, source:string}} adapter   what the executor claims
 * @param {{result:string, source:string}}    probe     an independent reading of the world
 * @returns {{outcome:string, effect:'PRESENT'|'ABSENT'|'PARTIAL'|'NONE_READ', gate:'OPEN'|'HOLD'|'STOP', retryAuthorized:false, note:string}}
 *   `effect` (added 2026-10-26) says WHAT was verified: VERIFIED with effect
 *   ABSENT is a verified non-execution (adapter said FAILURE, probe agrees),
 *   not a verified execution. The outcome word alone does not distinguish them.
 */
function verify(adapter, probe) {
  if (!adapter || !ADAPTER_ASSERTIONS.includes(adapter.assertion)) {
    throw new AuthorityError('adapter.assertion must be one of ' + ADAPTER_ASSERTIONS, 'BAD_ASSERTION');
  }
  if (!probe || !PROBE_RESULTS.includes(probe.result)) {
    throw new AuthorityError('probe.result must be one of ' + PROBE_RESULTS, 'BAD_PROBE');
  }
  // Independence is a precondition, not a nicety. A probe that reads the
  // adapter's own report is the adapter asserting twice.
  if (!adapter.source || !probe.source || adapter.source === probe.source) {
    throw new AuthorityError(
      'verification refused: probe source is not independent of the adapter',
      'NOT_INDEPENDENT',
    );
  }

  let outcome;
  if (probe.result === 'NO_READING')            outcome = 'UNKNOWN';
  else if (probe.result === 'EFFECT_PARTIAL')   outcome = 'PARTIAL';
  else if (probe.result === 'EFFECT_PRESENT')   outcome = adapter.assertion === 'FAILURE' ? 'CONTRADICTED' : 'VERIFIED';
  else /* EFFECT_ABSENT */                      outcome = adapter.assertion === 'SUCCESS' ? 'CONTRADICTED' : 'VERIFIED';

  // The gate. Only a clean VERIFIED opens it; everything else holds or stops.
  const gate = outcome === 'VERIFIED' ? 'OPEN' : outcome === 'CONTRADICTED' ? 'STOP' : 'HOLD';

  const note =
    outcome === 'CONTRADICTED'
      ? `CONFLICT: adapter said ${adapter.assertion}, independent probe said ${probe.result}`
      : outcome === 'UNKNOWN'
        ? 'no independent reading obtained — the effect is neither confirmed nor excluded'
        : outcome === 'PARTIAL'
          ? 'effect partially present — scope of what actually happened is not established'
          : 'independent probe agrees with the adapter';

  const effect = { EFFECT_PRESENT: 'PRESENT', EFFECT_ABSENT: 'ABSENT',
                   EFFECT_PARTIAL: 'PARTIAL', NO_READING: 'NONE_READ' }[probe.result];

  // Hard-coded false, by design. Nothing this function can conclude is a retry
  // right. Retry authority comes from a new permit, not from a verdict.
  return { outcome, effect, gate, retryAuthorized: false, note };
}

module.exports = { ADAPTER_ASSERTIONS, PROBE_RESULTS, OUTCOMES, verify };
