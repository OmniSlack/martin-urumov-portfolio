'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const { checkEnvelope, envelopeHash } = require('./envelope.js');
const { ExecutionAttempt, AuthorityError } = require('./attempt.js');
const { verify } = require('./verifier.js');

const BASE = {
  action: 'send', object: 'invoice-77', target: 'acme@example.test',
  scope: 'single', quantity: 1, permissions: ['write:invoice'], sideEffects: [],
};

/* ---------- ENVELOPE : X → X+Y must STOP ---------- */

test('identical envelope matches', () => {
  assert.equal(checkEnvelope(BASE, { ...BASE }).decision, 'MATCH');
});

test('key order does not change the hash', () => {
  const shuffled = { sideEffects: [], permissions: ['write:invoice'], quantity: 1,
    scope: 'single', target: 'acme@example.test', object: 'invoice-77', action: 'send' };
  assert.equal(envelopeHash(BASE), envelopeHash(shuffled));
});

test('changed target STOPs', () => {
  const r = checkEnvelope(BASE, { ...BASE, target: 'someone-else@example.test' });
  assert.equal(r.decision, 'STOP');
  assert.deepEqual(r.changed, ['target']);
});

test('X -> X+Y (added side effect) STOPs', () => {
  const r = checkEnvelope(BASE, { ...BASE, sideEffects: ['notify:slack'] });
  assert.equal(r.decision, 'STOP');
  assert.deepEqual(r.changed, ['sideEffects']);
});

test('quantity escalation STOPs', () => {
  assert.equal(checkEnvelope(BASE, { ...BASE, quantity: 2 }).decision, 'STOP');
});

test('permission escalation STOPs', () => {
  const r = checkEnvelope(BASE, { ...BASE, permissions: ['write:invoice', 'delete:invoice'] });
  assert.equal(r.decision, 'STOP');
});

test('non-material metadata does not STOP', () => {
  assert.equal(checkEnvelope(BASE, { ...BASE, requestedBy: 'navigator', traceId: 'abc' }).decision, 'MATCH');
});

/* ---------- ATTEMPT : states must not collapse ---------- */

const mk = () => new ExecutionAttempt({ permitId: 'p1', envelopeHash: envelopeHash(BASE) });

test('happy path reaches VERIFIED only through COMPLETED', () => {
  const a = mk();
  a.transition('CLAIMED', 'atomic claim')
   .transition('ATTEMPTED', 'dispatched')
   .transition('COMPLETED', 'adapter returned')
   .transition('VERIFIED', 'independent probe agreed');
  assert.equal(a.state, 'VERIFIED');
});

test('ATTEMPTED cannot jump straight to VERIFIED', () => {
  const a = mk().transition('CLAIMED', 'x').transition('ATTEMPTED', 'y');
  assert.throws(() => a.transition('VERIFIED', 'adapter said ok'),
    (e) => e instanceof AuthorityError && e.code === 'ILLEGAL_TRANSITION');
});

test('a claimed permit never returns to REQUESTED', () => {
  const a = mk().transition('CLAIMED', 'x');
  assert.throws(() => a.transition('REQUESTED', 'crash'),
    (e) => e.code === 'ILLEGAL_TRANSITION');
});

test('UNKNOWN is not safe to retry', () => {
  const a = mk().transition('CLAIMED', 'x').transition('ATTEMPTED', 'y').transition('UNKNOWN', 'timeout');
  assert.equal(a.isSafeToRetry(), false);
});

test('UNKNOWN is terminal without human authority', () => {
  const a = mk().transition('CLAIMED', 'x').transition('ATTEMPTED', 'y').transition('UNKNOWN', 'timeout');
  assert.throws(() => a.transition('FAILED', 'assume it did not happen'),
    (e) => e.code === 'ILLEGAL_TRANSITION');
});

test('RESUME is not RE-EXECUTE on an UNKNOWN attempt', () => {
  const a = mk().transition('CLAIMED', 'x').transition('ATTEMPTED', 'y').transition('UNKNOWN', 'timeout');
  assert.throws(() => a.humanResume({ humanId: 'operator-1', scope: 'risk-A' }),
    (e) => e instanceof AuthorityError && e.code === 'RESUME_NOT_REEXECUTE');
});

test('failure before dispatch IS safe to retry', () => {
  const a = mk().transition('CLAIMED', 'x').transition('FAILED', 'revoked before dispatch');
  assert.equal(a.isSafeToRetry(), true);
});

test('failure after dispatch is NOT safe to retry', () => {
  const a = mk().transition('CLAIMED', 'x').transition('ATTEMPTED', 'y').transition('FAILED', 'adapter error');
  assert.equal(a.isSafeToRetry(), false);
});

test('in-flight ATTEMPTED is not safe to retry', () => {
  const a = mk().transition('CLAIMED', 'x').transition('ATTEMPTED', 'y');
  assert.equal(a.isSafeToRetry(), false);
});

/* ---------- VERIFIER : adapter success is not verification ---------- */

test('adapter SUCCESS + independent effect present = VERIFIED', () => {
  const r = verify({ assertion: 'SUCCESS', source: 'adapter' },
                   { result: 'EFFECT_PRESENT', source: 'mailbox-probe' });
  assert.equal(r.outcome, 'VERIFIED');
  assert.equal(r.gate, 'OPEN');
});

test('adapter SUCCESS + effect absent = CONTRADICTED and STOP', () => {
  const r = verify({ assertion: 'SUCCESS', source: 'adapter' },
                   { result: 'EFFECT_ABSENT', source: 'mailbox-probe' });
  assert.equal(r.outcome, 'CONTRADICTED');
  assert.equal(r.gate, 'STOP');
});

test('adapter FAILURE + effect present = CONTRADICTED (it happened anyway)', () => {
  const r = verify({ assertion: 'FAILURE', source: 'adapter' },
                   { result: 'EFFECT_PRESENT', source: 'mailbox-probe' });
  assert.equal(r.outcome, 'CONTRADICTED');
});

test('no independent reading = UNKNOWN and HOLD', () => {
  const r = verify({ assertion: 'SUCCESS', source: 'adapter' },
                   { result: 'NO_READING', source: 'mailbox-probe' });
  assert.equal(r.outcome, 'UNKNOWN');
  assert.equal(r.gate, 'HOLD');
});

test('a probe that is the adapter is refused', () => {
  assert.throws(() => verify({ assertion: 'SUCCESS', source: 'adapter' },
                             { result: 'EFFECT_PRESENT', source: 'adapter' }),
    (e) => e.code === 'NOT_INDEPENDENT');
});

test('no verdict ever authorizes retry', () => {
  for (const result of ['EFFECT_PRESENT', 'EFFECT_ABSENT', 'EFFECT_PARTIAL', 'NO_READING']) {
    const r = verify({ assertion: 'SUCCESS', source: 'adapter' }, { result, source: 'probe' });
    assert.equal(r.retryAuthorized, false, `retry must stay unauthorized for ${result}`);
  }
});

/* ---------- added 2026-10-26: pins of two findings ---------- */

test('an unlisted field added by the adapter STOPs (fixed 2026-10-26)', () => {
  const r1 = checkEnvelope(BASE, { ...BASE, cc: ['boss@example.test'] });
  assert.equal(r1.decision, 'STOP');
  assert.deepEqual(r1.changed, ['unmodelled:cc']);
  const r2 = checkEnvelope(BASE, { ...BASE, attachments: ['payroll.xlsx'] });
  assert.equal(r2.decision, 'STOP');
  assert.deepEqual(r2.changed, ['unmodelled:attachments']);
});

test('an unlisted field removed or changed by the adapter STOPs', () => {
  const auth = { ...BASE, cc: ['boss@example.test'] };
  assert.equal(checkEnvelope(auth, { ...BASE }).decision, 'STOP');                            // removed
  assert.equal(checkEnvelope(auth, { ...BASE, cc: ['other@example.test'] }).decision, 'STOP'); // changed
});

test('an unlisted field that was authorised and is unchanged MATCHes', () => {
  const auth = { ...BASE, cc: ['boss@example.test'] };
  assert.equal(checkEnvelope(auth, { ...auth }).decision, 'MATCH');
});

test('only explicitly listed metadata is free; a new metadata-looking field is not', () => {
  assert.equal(checkEnvelope(BASE, { ...BASE, traceId: 'abc' }).decision, 'MATCH');
  assert.equal(checkEnvelope(BASE, { ...BASE, debugNote: 'harmless?' }).decision, 'STOP');
});

test('unlisted fields change the hash; listed metadata does not', () => {
  assert.notEqual(envelopeHash(BASE), envelopeHash({ ...BASE, cc: ['x@example.test'] }));
  assert.equal(envelopeHash(BASE), envelopeHash({ ...BASE, traceId: 'abc', requestedBy: 'planner' }));
});

test('adapter FAILURE + effect absent = VERIFIED, and effect says ABSENT', () => {
  const r = verify({ assertion: 'FAILURE', source: 'adapter' },
                   { result: 'EFFECT_ABSENT', source: 'mailbox-probe' });
  assert.equal(r.outcome, 'VERIFIED');
  assert.equal(r.effect, 'ABSENT');       // a verified non-execution, not a verified execution
});

test('adapter AMBIGUOUS + effect present = VERIFIED, and effect says PRESENT', () => {
  const r = verify({ assertion: 'AMBIGUOUS', source: 'adapter' },
                   { result: 'EFFECT_PRESENT', source: 'mailbox-probe' });
  assert.equal(r.outcome, 'VERIFIED');
  assert.equal(r.effect, 'PRESENT');
});

test('every verdict carries the effect it was based on', () => {
  const map = { EFFECT_PRESENT: 'PRESENT', EFFECT_ABSENT: 'ABSENT', EFFECT_PARTIAL: 'PARTIAL', NO_READING: 'NONE_READ' };
  for (const assertion of ['SUCCESS', 'FAILURE', 'AMBIGUOUS']) {
    for (const result of Object.keys(map)) {
      const r = verify({ assertion, source: 'adapter' }, { result, source: 'probe' });
      assert.equal(r.effect, map[result], `${assertion} + ${result}`);
    }
  }
});
