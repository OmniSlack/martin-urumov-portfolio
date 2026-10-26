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
 * Fields that are explicitly NOT material: tracing and bookkeeping only.
 * Added 2026-10-26. Any field that is in neither list is UNMODELLED, and an
 * unmodelled difference STOPs — fail-closed. To let a new harmless field pass,
 * it has to be added here on purpose; it never passes by default.
 */
const NON_MATERIAL_FIELDS = Object.freeze([
  'requestedBy',
  'traceId',
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

/**
 * SHA-256 over the canonical form of every field except NON_MATERIAL_FIELDS
 * (2026-10-26: was material fields only, which let unlisted fields through).
 * The seven MATERIAL_FIELDS are always present in the hashed object (null if absent).
 */
function envelopeHash(envelope) {
  const hashed = {};
  for (const f of MATERIAL_FIELDS) hashed[f] = envelope[f] ?? null;
  for (const k of Object.keys(envelope || {})) {
    if (!MATERIAL_FIELDS.includes(k) && !NON_MATERIAL_FIELDS.includes(k)) hashed[k] = envelope[k];
  }
  return crypto.createHash('sha256').update(canonical(hashed), 'utf8').digest('hex');
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
  // Unmodelled fields: in neither list. Any difference (added, removed, changed) STOPs.
  const keys = new Set([...Object.keys(authorized || {}), ...Object.keys(presented || {})]);
  for (const k of [...keys].sort()) {
    if (MATERIAL_FIELDS.includes(k) || NON_MATERIAL_FIELDS.includes(k)) continue;
    if (canonical(authorized[k] ?? null) !== canonical(presented[k] ?? null)) changed.push(`unmodelled:${k}`);
  }
  const authorizedHash = envelopeHash(authorized);
  const presentedHash = envelopeHash(presented);

  // Belt and braces (live since 2026-10-26): the hash now covers unmodelled
  // fields too, so a hash disagreement with no named change is still a STOP.
  // With the named check above it should not occur; if it does, something in
  // the comparison is wrong, and an unexplained difference is not permitted.
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

module.exports = { MATERIAL_FIELDS, NON_MATERIAL_FIELDS, canonical, envelopeHash, checkEnvelope };
