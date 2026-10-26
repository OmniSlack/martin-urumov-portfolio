'use strict';
/**
 * ENVELOPE INTEGRITY — Navigator ACCEPTED DESIGN v0.4, §10 (Adapter / Executor)
 *
 * Spec lines this module enforces, verbatim from the accepted design:
 *   ADAPTER OUTPUT ≠ AUTHORITY
 *   "If the Adapter transforms X into X+Y, changes target, object, scope,
 *    quantity, permissions, or material side effects, the original permit
 *    does not automatically authorize the transformed action."
 *   "Material transformation causes STOP/HOLD and reevaluation/new authority."
 *
 * STATUS: CANDIDATE. Not authorized for implementation. Not executed anywhere.
 * Zero runtime dependencies.
 */

const crypto = require('node:crypto');

/** Fields whose change is MATERIAL by definition of the accepted design. */
const MATERIAL_FIELDS = Object.freeze([
  'action',
  'object',
  'target',
  'scope',
  'quantity',
  'permissions',
  'sideEffects',
]);

/**
 * Deterministic canonical form: sorted keys, no whitespace variance.
 * Two envelopes with the same meaning must hash identically; any material
 * difference must change the hash.
 */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

/** SHA-256 over the canonical form of the material fields only. */
function envelopeHash(envelope) {
  const material = {};
  for (const f of MATERIAL_FIELDS) material[f] = envelope[f] ?? null;
  return crypto.createHash('sha256').update(canonical(material), 'utf8').digest('hex');
}

/**
 * Compare what the permit authorized against what the Adapter is about to do.
 * Returns a decision — never a boolean, so the caller cannot collapse it.
 *
 * @returns {{decision:'MATCH'|'STOP', changed:string[], authorizedHash:string, presentedHash:string}}
 */
function checkEnvelope(authorized, presented) {
  const changed = [];
  for (const f of MATERIAL_FIELDS) {
    const a = canonical(authorized[f] ?? null);
    const p = canonical(presented[f] ?? null);
    if (a !== p) changed.push(f);
  }
  const authorizedHash = envelopeHash(authorized);
  const presentedHash = envelopeHash(presented);

  // NOTE (2026-10-26): this branch is unreachable as written. envelopeHash()
  // covers MATERIAL_FIELDS only, so when no listed field changed the two hashes
  // are equal by construction. A field outside the list (e.g. `cc`,
  // `attachments`) is therefore treated as metadata and passes as MATCH — see
  // the test "a field outside MATERIAL_FIELDS passes as MATCH". The original
  // comment claimed the opposite. Kept, unchanged in behaviour, to show the
  // intended defence; making it live is a design decision (hash the whole
  // envelope and give up free metadata) that this copy does not take.
  if (changed.length === 0 && authorizedHash !== presentedHash) {
    return { decision: 'STOP', changed: ['<unmodelled>'], authorizedHash, presentedHash };
  }

  return {
    decision: changed.length === 0 ? 'MATCH' : 'STOP',
    changed,
    authorizedHash,
    presentedHash,
  };
}

module.exports = { MATERIAL_FIELDS, canonical, envelopeHash, checkEnvelope };
