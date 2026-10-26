"use strict";

const { createLadder, deepFreeze } = require("./severity.js");

/**
 * Core — authority-boundary evaluator for AI reasoning (v0.4 header; package v0.14)
 *
 * Implements the authority-boundary design specification (v0.1).
 *
 * Severity hierarchy: STOP > HOLD > CLEAR. STOP is terminal.
 *
 * v0.4 adds Gate 13 (lawful basis for personal-data processing) and moves the
 * severity ladder and the freeze routine into ./severity.js so the Observer
 * and the balancing assessment share them instead of copying them.
 *
 * v0.3 closes two defects found in v0.2 by adversarial probing:
 *   D1 — an UNKNOWN or missing source returned CLEAR, violating the
 *        fail-closed rule ("the unknown is always forbidden").
 *        Unverified provenance now raises HOLD.
 *   D2 — Gate 08 (simulation vs execution) existed in the implementation
 *        but had no test covering it. Behaviour unchanged; tests added.
 */

/**
 * Neumaier compensated summation — the Kahan variant that also works when the
 * next number is larger than the running sum.
 *
 * Naive `a + b + c` loses the low-order bits at every addition and the error
 * grows with the number of terms. Here what is lost at each step is kept in
 * `c` and added back at the end. Measured on the same cases that broke Gate 19:
 *
 *   1000 × 0.1    naive 99.9999999999986   →  Neumaier 100
 *    300 × 0.7    naive 209.99999999999903 →  Neumaier 210
 *  10000 × 0.001  naive 9.999999999999897  →  Neumaier 10
 *
 * ⚠️ THE BOUNDARY, stated: this gives the CORRECTLY ROUNDED sum of the
 * floating-point numbers that are actually in the journal — not the sum of the
 * decimal numbers somebody had in mind. 1e-7 is not exactly representable as a
 * double, so 1e6 × 1e-7 gives 0.09999999999999999, not 0.1. That is the best a
 * double can do; more precision needs scaled integers.
 */
function neumaierSum(values) {
  let sum = 0;
  let c = 0;
  for (const v of values) {
    const t = sum + v;
    // When the sum is larger, the low-order bits of `v` are lost; when `v` is
    // larger, those of the sum are lost. Hence the two cases differ.
    if (Math.abs(sum) >= Math.abs(v)) c += (sum - t) + v;
    else c += (v - t) + sum;
    sum = t;
  }
  return sum + c;
}

class Core {
  /**
   * ⚠️ THE CLOCK IS AN INPUT, NOT TAKEN FROM INSIDE — 2026-10-12, Martin Urumov's
   * instruction:
   *
   * "Every reaction must have a NON-zero gap before the answer is returned.
   *  It is a mandatory step through the observer and cannot be skipped. If
   *  the gap is zero, the check was skipped, and a zero gap is itself a flag."
   *
   * The clock is passed in so that a probe can FREEZE it. Taken from inside,
   * a zero gap is unreachable on a real machine — so the gate could never
   * fail, and a check that cannot fail is decoration. With an injected clock
   * the probe proves it.
   *
   * `clock` returns nanoseconds (BigInt). Default: `process.hrtime.bigint`,
   * monotonic and independent of the wall clock.
   */
  constructor({ clock = () => process.hrtime.bigint() } = {}) {
    this.clock = clock;
    this.status = "CANDIDATE";
    this.actionBoundary = "CLOSED";

    // Gate 14 — one action in flight at a time.
    // Observation is unbounded; action is serial. Null when nothing is acting.
    this.actionInFlight = null;

    // The last released action, kept so that "proposed and never executed"
    // remains readable after the lock is gone.
    this.lastAction = null;

    // Every released action, in order — append-only.
    //
    // Defect #14, found by testing this repository against the second of the
    // four compositional-failure classes: "several individually permitted
    // actions that together cross a limit". Ten transfers of 100 each passed
    // every gate ten times, and nothing anywhere held the number 1000.
    //
    // The second half of the same defect was worse than the first: `lastAction`
    // is one slot, so the eleventh action ERASED the record of the tenth. Nine
    // of ten left no trace at all. The project made "proposed ≠ executed"
    // structural so the record would survive the lock; it survived the lock and
    // died at the next action.
    //
    // ⚠️ This grows without bound. That is deliberate: a journal that forgets
    // reintroduces exactly the defect it closes, and the choice of what to do
    // about memory belongs to whoever runs this, not to the record itself.
    // `actionCount` is monotonic so that trimming the journal cannot quietly
    // change how many actions there were.
    this.journal = [];
    this.actionCount = 0;

    // Every verdict this instance has issued.
    //
    // Defect #5, found by probe P11: begin() checked that the assessment SAID
    // "CLEAR" and never that the Core had said it. Three typed words —
    // { decision: "CLEAR" } — opened the action boundary without passing a
    // single gate. It is Gate 18's failure one level up: a number without a
    // source is not a measurement, and a verdict without a source is not a
    // judgement.
    //
    // A WeakSet is the check because it cannot be forged: membership is not a
    // property an attacker can copy onto a look-alike object, and entries are
    // collected with the verdicts themselves. It is per-instance on purpose —
    // one Core's CLEAR is not another Core's permission.
    this.issued = new WeakSet();

    // What each verdict was FOR, so it cannot be spent on something else.
    //
    // Defect #13: closing #5 established WHO issued a verdict and stopped
    // there. A verdict for a transfer of 100 could be carried to begin() after
    // the proposal had been changed to 1,000,000 with a different signature,
    // and the lock opened — because nothing tied the permission to the thing
    // it permitted.
    //
    // Named in the compositional-policy literature as "a threshold checked,
    // after which the value changes again". Found here on 18 September 2026 by
    // testing this repository against that description.
    this.issuedFor = new WeakMap();
  }

  /**
   * Claim the action lock. Only a CLEAR assessment may claim it, and only when
   * nothing else holds it. Returns an opaque key, or null on refusal.
   *
   * The key is identity, not a counter: releasing requires the same key the
   * claimer was given. A caller cannot release an action it did not begin.
   */
  /**
   * A stable summary of what a proposal asks for. Changing any field a gate
   * reads changes this, so a verdict cannot be carried across a change.
   */
  /**
   * A real deep copy, so that the caller's object is never touched.
   *
   * structuredClone handles nested objects, arrays, dates and sets. When the
   * proposal carries something it cannot transfer — a function, a symbol —
   * it falls back to a shallow copy, because a refusal here would mean no
   * record at all, and a record missing one function is better than none.
   */
  copy(proposal) {
    try {
      return structuredClone(proposal);
    } catch {
      return { ...proposal };
    }
  }

  fingerprint(proposal) {
    if (!proposal || typeof proposal !== "object") return "\u0000none";
    return Object.keys(proposal)
      .sort()
      .map((k) => `${k}=${JSON.stringify(proposal[k])}`)
      .join("\u241F");
  }

  begin(assessment, proposal) {
    if (this.actionInFlight !== null) return null;
    if (!assessment || assessment.decision !== "CLEAR") return null;
    // Said by this Core, not merely said. See `issued` in the constructor.
    if (!this.issued.has(assessment)) return null;
    // And said about THIS proposal, unchanged since. A permission belongs to
    // what it permitted; if that has moved, the permission has not moved with
    // it and must be re-obtained.
    if (proposal === undefined) return null;
    if (this.issuedFor.get(assessment) !== this.fingerprint(proposal)) return null;

    const now = new Date().toISOString();
    this.actionInFlight = {
      key: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      since: now,
      // Rule 4 of the project's own list — "Proposed ≠ Executed" — lived in a
      // sentence and in nothing else. Claiming the lock is a proposal. Nothing
      // here says the action happened, and nothing may imply it.
      proposed: now,
      executed: null,
      outcome: null,
      // What was asked for, kept so the journal can be read afterwards.
      // Without this the journal records that ten things happened and not
      // what any of them was, which is a count, not a record.
      //
      // Defect #17. This was `deepFreeze({ ...proposal })` — a shallow copy
      // followed by a deep freeze. The freeze follows the shared references and
      // reaches the caller's NESTED objects, which are not ours.
      //
      // The same project forbids exactly this in observer.js, with test O12
      // behind it: making someone else's object immutable is also a change.
      // The rule was enforced in one file and broken in the other.
      //
      // And the failure was silent: outside strict mode a write to the frozen
      // object passes without an error and the value does not change. A silent
      // failure is worse than a loud one.
      //
      // Now: a real deep copy, and the COPY is frozen. The caller's proposal
      // leaves begin() exactly as it entered.
      proposal: this.deepFreeze(this.copy(proposal)),
    };
    return this.actionInFlight.key;
  }

  /**
   * Mark that the action actually happened. Only the holder's key works.
   *
   * This exists so that releasing without it means something. An action that
   * is begun and released with no complete() is recorded as proposed and not
   * executed, which is the distinction the rule asks for and could not be made
   * before: the two paths produced identical state.
   */
  complete(key, outcome = null) {
    if (this.actionInFlight === null) return null;
    if (key !== this.actionInFlight.key) return null;
    if (this.actionInFlight.executed !== null) return null; // once, not twice
    this.actionInFlight.executed = new Date().toISOString();
    this.actionInFlight.outcome = outcome;
    return this.deepFreeze({ ...this.actionInFlight });
  }

  /**
   * Release the action lock. Only the holder's key works.
   *
   * The released record is kept on `lastAction` so that what was proposed and
   * never executed stays readable instead of vanishing with the lock.
   */
  release(key) {
    if (this.actionInFlight === null) return false;
    if (key !== this.actionInFlight.key) return false;

    const a = this.actionInFlight;
    this.lastAction = this.deepFreeze({
      key: a.key,
      proposed: a.proposed,
      executed: a.executed,          // null means proposed and not done
      outcome: a.outcome,
      proposal: a.proposal,
      released: new Date().toISOString(),
      durationMs: a.executed ? Date.parse(a.executed) - Date.parse(a.proposed) : null,
    });
    // The journal is appended to, never written over. `lastAction` is now the
    // tail of it rather than the only copy.
    this.journal.push(this.lastAction);
    this.actionCount += 1;
    this.actionInFlight = null;
    return true;
  }

  evaluate(proposal, context = {}) {
    // The GAP opens HERE and closes only at the return. Every gate stands
    // between the two. There is no path by which the answer leaves without
    // having passed the measurement — that is what "cannot be skipped" means.
    const gapStart = this.clock();

    // ── GAP MARKERS · instruction U-24, Martin Urumov's words of 2026-10-13 ──
    //
    //   "The pause before an answer should not be silent. It should name what
    //    exactly is being checked right now: 'still checking — comparing
    //    numbers', 'still checking — reading an image'. Then the gap is not
    //    only present, it is transparent from outside."
    //
    // ⚠️ THIS CLOSES THE BOUNDARY NAMED THE DAY BEFORE. Gate 22 proved that
    //    TIME had passed, with the note beside it: "a non-zero gap proves
    //    elapsed time, not work done". The markers are that correction: the
    //    gap starts to carry CONTENT, not only duration.
    //
    // Each marker also carries the time elapsed up to it, so it shows WHERE
    // the time went, not only that it went.
    const reactionGapMarkers = [];
    const marker = (step) => {
      reactionGapMarkers.push({
        step,
        atNs: (this.clock() - gapStart).toString(),
      });
    };

    const reasons = [];
    const provenance = {};
    marker("reading the proposal and the context");

    // STOP > HOLD > CLEAR. Once STOP, terminal.
    const ladder = createLadder();
    const updateDecision = (next) => ladder.raise(next);

    marker("checking the action boundary");
    // Gate 01 & 12 — action boundary isolation
    //
    // AN ANALOGUE OF THIS RULE — not its origin.
    //
    // Martin Urumov, `08_HISTORICAL_MYTHOLOGICAL_SCAN.md`, 28 July 2026:
    //
    //   "Stoicism: impression → assent/withholding → impulse → action."
    //
    // That is the shape of this gate. The impression arrives; between it and
    // the action stands an act that can be refused. Evaluation does not open
    // the boundary. Ever.
    //
    // ⚠️ THE LIMITS, from the same author's own files:
    //   "The broad principle of pause, self-observation and control before
    //    action is NOT ORIGINAL."
    //   "Many individual components have known predecessors: feedback,
    //    memory, framing, metacognition, uncertainty estimation, adaptive
    //    compute and self-monitoring."
    //
    // So this note says ANALOGUE, not lineage. The Stoics did not write this
    // code and this code does not continue their line. The shape of one rule
    // matches — and that is all that is claimed here.
    if (context.triggerExternalAction) {
      updateDecision("STOP");
      reasons.push("Gate 12 Block: External execution requested but forbidden in this runtime.");
    }

    marker("checking the provenance of the claim");
    // Gate 04 & 05 — epistemic grounding; unverified provenance is fail-closed (D1)
    if (!proposal.source || proposal.source === "UNKNOWN" || !proposal.provenance) {
      provenance.source = "UNKNOWN";
      provenance.status = "UNVERIFIED";
      updateDecision("HOLD");
      reasons.push("Gate 04 Block: Source provenance is unknown; fail-closed.");
    } else {
      provenance.source = proposal.source;
      provenance.status = "VERIFIED";
    }

    // Gate 03 — counter-model verification
    if (!context.counterModelTested) {
      updateDecision("HOLD");
      reasons.push("Gate 03 Block: Missing adversarial counter-model check.");
    }

    // Gate 08 — simulation vs execution
    if (proposal.mode === "PRODUCTION_RUN" && !context.productionApproved) {
      updateDecision("HOLD");
      reasons.push("Gate 08 Block: Production execution requested under simulation state.");
    }

    // Gate 11 — protected state transition requires an exact, matching human permit
    if (proposal.requiresTransition) {
      if (context.humanPermit !== "PRESENT") {
        updateDecision("HOLD");
        reasons.push("Gate 11 Block: State transition requires present human permit.");
      } else if (!context.permitSignature || context.permitSignature !== proposal.targetSignature) {
        updateDecision("HOLD");
        reasons.push("Gate 11 Block: Permit signature/scope mismatch.");
      }
    }

    marker("comparing the timestamps");
    // Gate 09 — temporal conflict.
    //
    // Defect #4, found by probe P10: this asked only "is it too old" and never
    // "does it exist yet". A permit stamped tomorrow produced a negative age,
    // a negative number is never greater than a threshold, and so a permit
    // from the future passed as current — with no reason recorded at all.
    //
    // Both ends are now closed. A small skew allowance keeps honest clock
    // drift between machines from being read as a forged date.
    // Defect #15 — the third of the four compositional classes: gradual
    // widening of authority.
    //
    // Both bounds were entirely the caller's. A permit from a YEAR ago passed
    // with maxPermitAgeMs set to a year; a permit from TOMORROW passed with a
    // two-day skew, which defeats probe P10, written exactly against that. So
    // the party the gate guards against was tuning the gate — and provenance
    // recorded nothing, so nobody could later see that the bound had moved.
    //
    // The rule that goes in: **the caller may NARROW, not widen.** The ceiling
    // is in the code and is not supplied from outside. Narrowing is caution and
    // is allowed; widening is a permission, and it is not the caller's to grant.
    //
    // Every supplied number is recorded in provenance — including a refused
    // one, because an attempt to widen is itself something that must be seen.
    const HARD_MAX_PERMIT_AGE_MS = 1800000;   // 30 minutes
    const HARD_MAX_SKEW_MS = 60000;           // 1 minute

    const askedAge = context.maxPermitAgeMs;
    const askedSkew = context.maxClockSkewMs;
    const maxPermitAgeMs = typeof askedAge === "number" && Number.isFinite(askedAge) && askedAge >= 0
      ? Math.min(askedAge, HARD_MAX_PERMIT_AGE_MS)
      : HARD_MAX_PERMIT_AGE_MS;
    const maxSkewMs = typeof askedSkew === "number" && Number.isFinite(askedSkew) && askedSkew >= 0
      ? Math.min(askedSkew, HARD_MAX_SKEW_MS)
      : HARD_MAX_SKEW_MS;

    if (askedAge !== undefined || askedSkew !== undefined) {
      provenance.bounds = {
        permitAgeMs: { asked: askedAge ?? null, applied: maxPermitAgeMs,
                       widened: typeof askedAge === "number" && askedAge > HARD_MAX_PERMIT_AGE_MS },
        clockSkewMs: { asked: askedSkew ?? null, applied: maxSkewMs,
                       widened: typeof askedSkew === "number" && askedSkew > HARD_MAX_SKEW_MS },
      };
    }
    if (context.permitTimestamp) {
      const stamped = new Date(context.permitTimestamp).getTime();
      if (Number.isNaN(stamped)) {
        // An unreadable date is not a fresh one: fail closed, as Gate 04 does.
        updateDecision("HOLD");
        reasons.push(
          "Gate 09 Block: Permit timestamp is not a readable date."
        );
      } else {
        const ageMs = Date.now() - stamped;
        if (ageMs > maxPermitAgeMs) {
          updateDecision("HOLD");
          reasons.push(
            "Gate 09 Block: Temporal conflict detected. Permit expired."
          );
        } else if (-ageMs > maxSkewMs) {
          updateDecision("HOLD");
          reasons.push(
            "Gate 09 Block: Permit is dated in the future; it is not yet valid."
          );
        }
      }
    }
    if (context.permitExpired) {
      updateDecision("HOLD");
      reasons.push("Gate 09 Block: Temporal conflict detected. Permit expired.");
    }

    // Gate 14 — one action in flight at a time.
    // The constraint is on acting, not on attending: evaluating and observing
    // stay unbounded. Only a proposal that would act is held.
    const wouldAct =
      proposal.requiresTransition === true || proposal.mode === "PRODUCTION_RUN";
    if (wouldAct && this.actionInFlight !== null) {
      updateDecision("HOLD");
      reasons.push("Gate 14 Block: Another action is already in flight.");
    }

    marker("checking the lawful basis for personal data");
    // Gate 13 — lawful basis for processing personal data.
    // The Core does not re-run the balancing assessment; it requires that one
    // has been performed and refuses to treat a missing one as a passing one.
    if (proposal.processesPersonalData) {
      const outcome = context.balancingOutcome;
      if (!outcome) {
        updateDecision("HOLD");
        reasons.push(
          "Gate 13 Block: Personal-data processing without a balancing assessment."
        );
      } else if (outcome.decision !== "CLEAR") {
        // An unrecognised outcome is not a passing outcome: fail closed to HOLD
        // rather than let an unknown value slip past the ladder.
        const raised = outcome.decision === "STOP" ? "STOP" : "HOLD";
        updateDecision(raised);
        reasons.push(
          `Gate 13 Block: Balancing assessment returned ${outcome.decision}.`
        );
      }
    }

    marker("counting independent evidence");
    // Gate 15 — evidence independence.
    // Same shape as Gate 13: the Core does not re-derive the number, it
    // refuses to treat a missing independence assessment as a passing one.
    // A proposal that asserts a confidence must show what that confidence
    // was built from, and that the parts were not the same part twice.
    if (proposal.assertsConfidence) {
      const ind = context.independenceOutcome;
      if (!ind) {
        updateDecision("HOLD");
        reasons.push(
          "Gate 15 Block: Confidence asserted without an independence assessment."
        );
      } else if (ind.decision !== "CLEAR") {
        const raised = ind.decision === "STOP" ? "STOP" : "HOLD";
        updateDecision(raised);
        reasons.push(
          `Gate 15 Block: Independence assessment returned ${ind.decision}.`
        );
      }
    }

    marker("weighing confidence against evidence");
    // Gate 18 — a confidence number is not a claim on its own.
    // A bare number carries the authority of measurement while resting on
    // nothing, and it is the form in which unfounded certainty travels
    // furthest. A proposal that asserts no confidence is never asked for
    // evidence; one that does must say what the number rests on.
    if (proposal.confidence !== undefined) {
      const c = proposal.confidence;
      if (typeof c !== "number" || !Number.isFinite(c) || c <= 0 || c >= 1) {
        updateDecision("HOLD");
        reasons.push(
          "Gate 18 Block: confidence must be a number in (0,1); it is not clamped."
        );
      }
      if (!Array.isArray(proposal.evidence)) {
        updateDecision("HOLD");
        reasons.push(
          "Gate 18 Block: confidence asserted without evidence. A number without " +
            "a source is not a measurement."
        );
      } else if (proposal.evidence.length === 0) {
        updateDecision("HOLD");
        reasons.push(
          "Gate 18 Block: confidence asserted against empty evidence. " +
            "Absence is not support."
        );
      }

      // ── Gate 21 · HIGH CONFIDENCE IS A FLAG, NOT A SEAL ──────────────────
      //
      // The owner's instruction, 2026-10-12, verbatim:
      //
      //   "High confidence is a flag, not a seal. When confidence is high, it
      //    triggers one more look. It never closes the question. The very need
      //    to say a hundred percent is the sign that checking has stopped."
      //
      // What the code did UNTIL THEN: Gate 18 refused `c >= 1` — so "a hundred
      // percent" already failed. But 0.99 with two pieces of evidence passed
      // SILENTLY, and the higher the confidence, the less was asked. Exactly
      // the opposite of the rule.
      //
      // ⚠️ This is NOT a refusal. High confidence does not make a proposal bad
      //    — it opens ONE MORE LOOK. Hence HOLD, not STOP, and hence the reason
      //    names what is asked for, not that something is wrong.
      //
      // ⚠️ THE THRESHOLD 0.9 IS THE ASSISTANT'S 🔴, measured against nothing.
      //    It was chosen because it is where the number starts to read as "the
      //    question is closed". It changes with one value. It is NOT raised to
      //    let something pass — that would be exactly the seal the rule is against.
      if (typeof c === "number" && Number.isFinite(c) && c >= 0.9 && c < 1) {
        updateDecision("HOLD");
        reasons.push(
          `Gate 21 Block: confidence ${c} is high — that is a flag, not a seal. ` +
            "High confidence opens one more look; it never closes the question. " +
            "Name what would falsify this, or lower the number to what is shown."
        );
      }
    }

    marker("checking the certificate of the solution");
    // Gate 20 — a claim of having SOLVED something must carry a certificate,
    // and the certificate must be checkable more cheaply than the search.
    //
    // WHY THIS GATE EXISTS, AND WHY IT IS THE LAST ONE WRITTEN
    //
    // On 19 September 2026 this repository was told, in conversation, that it
    // had been built to solve a named open problem. The record said otherwise:
    // the first commit is 7 September, the problem entered the conversation
    // twelve days later, and the project's own description is "authority
    // boundary evaluator". The claim was refuted by reading the record.
    //
    // But nothing in the CODE would have refused it. Fourteen gates, and not
    // one of them asked "what is the certificate, and who can check it".
    // The whole project leans on the asymmetry between finding and checking —
    // verify/ is twice the size of the core — and that leaning was an essay,
    // not a mechanism. This gate makes it a mechanism.
    //
    // It is the shape of NP, used as a discipline rather than as a metaphor:
    // an answer worth asserting comes with something short that anyone can
    // check, and checking it costs less than finding it did. Where a claim
    // cannot produce that, it is not refuted — it is HELD, which is this
    // project's word for "not enough is in front of me".
    //
    // Fires only when a solution is actually claimed, on the same principle as
    // Gates 18 and 19. A proposal that claims nothing is never asked for proof.
    if (proposal.solves !== undefined) {
      if (typeof proposal.solves !== "string" || !proposal.solves.trim()) {
        updateDecision("HOLD");
        reasons.push(
          "Gate 20 Block: a solution is claimed without naming what it solves."
        );
      }
      if (typeof proposal.certificate !== "string" || !proposal.certificate.trim()) {
        updateDecision("HOLD");
        reasons.push(
          "Gate 20 Block: solution claimed without a certificate. An answer " +
            "nobody else can check is not an answer, it is an assertion."
        );
      }
      if (typeof proposal.verifier !== "string" || !proposal.verifier.trim()) {
        updateDecision("HOLD");
        reasons.push(
          "Gate 20 Block: certificate supplied with no named way to check it. " +
            "A certificate without a verifier moves the assertion, it does not " +
            "ground it."
        );
      }

      // The costs are OPTIONAL — a claim may honestly not know them. But if
      // both are given, the asymmetry must actually hold: a certificate that
      // costs as much to check as the answer cost to find has bought nothing.
      const vc = proposal.verificationCost;
      const sc = proposal.searchCost;
      const bothGiven = typeof vc === "number" && Number.isFinite(vc) &&
                     typeof sc === "number" && Number.isFinite(sc);
      if (bothGiven) {
        if (vc <= 0 || sc <= 0) {
          updateDecision("HOLD");
          reasons.push(
            "Gate 20 Block: a cost of zero or less is not a measurement."
          );
        } else if (vc >= sc) {
          updateDecision("HOLD");
          reasons.push(
            "Gate 20 Block: checking is not cheaper than finding " +
              `(${vc} vs ${sc}). The certificate buys nothing.`
          );
        } else {
          provenance.certificate = {
            solves: proposal.solves,
            verifier: proposal.verifier,
            verificationCost: vc,
            searchCost: sc,
            ratio: sc / vc,
          };
        }
      } else if (
        (typeof vc === "number") !== (typeof sc === "number")
      ) {
        // One cost without the other cannot be read. Half a comparison is not
        // a smaller comparison; it is none.
        updateDecision("HOLD");
        reasons.push(
          "Gate 20 Block: one cost given without the other. A ratio needs two " +
            "numbers, and half of one is not a weaker claim — it is no claim."
        );
      }
    }

    marker("comparing what was spent with what is asked");
    // Gate 19 — what has already been spent counts against what is asked for.
    //
    // Every other gate judges this proposal alone, which is what let ten
    // permitted actions cross a limit none of them crossed. This one is the
    // only gate that reads the past.
    //
    // It fires only when a limit is actually supplied, on the same principle as
    // Gate 18: a gate that invents its own threshold is not enforcing a policy,
    // it is making one up. No `cumulativeLimit` in the context means no limit
    // was set, and a limit nobody set cannot be exceeded.
    //
    // Only EXECUTED actions count. Something proposed and never done spent
    // nothing, and charging it would punish the caution the lock exists to make
    // visible.
    if (
      typeof context.cumulativeLimit === "number" &&
      Number.isFinite(context.cumulativeLimit) &&
      typeof context.cumulativeField === "string"
    ) {
      const f = context.cumulativeField;
      const asked = proposal[f];
      // Defect #21, 20 September 2026, found by the supercriticality probe.
      //
      // This was `.reduce((t, e) => t + e.proposal[f], 0)` — naive summation.
      // Measured:
      //
      //   1000 steps of 0.1   →  99.9999999999986   (exact: 100)
      //    300 steps of 0.7   → 209.99999999999903  (exact: 210)
      //   1e6 steps of 1e-7   →   0.10000000000184563
      //
      // The gate whose ONLY job is exact cumulative accounting compared a
      // drifted number with an exact limit. At 1000 × 0.1 the limit of 100 was
      // shifted by 1.4e-12 — an action of that size passed. The direction of
      // the drift is not controlled: sometimes under, sometimes over.
      //
      // The same class as defect #16: something that LOOKS like an exact bound.
      const spent = neumaierSum(
        this.journal
          .filter((e) => e.executed !== null && typeof e.proposal[f] === "number")
          .map((e) => e.proposal[f])
      );
      if (typeof asked !== "number" || !Number.isFinite(asked)) {
        updateDecision("HOLD");
        reasons.push(
          `Gate 19 Block: a cumulative limit is set on "${f}", but this proposal ` +
            `carries no finite "${f}" to count. What cannot be counted cannot be permitted.`
        );
      } else if (spent + asked > context.cumulativeLimit) {
        updateDecision("HOLD");
        reasons.push(
          `Gate 19 Block: ${spent} already executed plus ${asked} asked for ` +
            `exceeds the limit of ${context.cumulativeLimit} on "${f}". ` +
            `Each step was permitted; the sum is not.`
        );
        provenance.cumulative = { field: f, spent, asked, limit: context.cumulativeLimit };
      } else {
        provenance.cumulative = { field: f, spent, asked, limit: context.cumulativeLimit };
      }
    }

    // ── THE GAP · Gate 22 ───────────────────────────────────────────────
    //
    // The owner's instruction, 2026-10-12, verbatim: "If the gap is zero, the
    // check was skipped, and a zero gap is itself a flag." And the reason:
    // "you cannot check anything in 0 seconds."
    //
    // Why TIME and not another measure: time is measurable NOW. Density of
    // context — which is the real rule — is not yet. What is measurable goes
    // in, instead of imposing a number that lies.
    //
    // ⚠️ The check is STRICTLY zero, not a threshold. A threshold would be the
    //    assistant's number, measured against nothing — exactly what is kept on
    //    HOLD for the growth metric. Zero is not chosen: it is the only value
    //    that means "the clock did not move", i.e. nothing happened between
    //    opening and closing.
    //
    // ⚪ WHAT THIS DOES NOT MEASURE: that what happened WAS a check. A non-zero
    //    gap proves that time passed, not that work was done. A lower bound,
    //    not an assessment.
    marker("closing the gap and returning the verdict");
    const reactionGapNs = this.clock() - gapStart;

    // ── A SILENT GAP · U-24 ──────────────────────────────────────────────
    //
    // A gap with time but without a single named marker is SILENT: from
    // outside you see only that time passed. "Then the gap is not only
    // present, it is transparent from outside" — a silent gap makes it present
    // and opaque, i.e. exactly half the work presented as the whole.
    //
    // ⚠️ A separate flag from the zero gap ON PURPOSE. The two are different
    //    failures: zero means "nothing happened"; silent means "something
    //    happened that was not named". Merged under one flag, the second would
    //    disappear behind the first.
    if (reactionGapMarkers.length === 0) {
      updateDecision("HOLD");
      reasons.push(
        "Gate 22 Block: silent gap. Time has passed, but not a single step was " +
          "named — from outside one sees presence, not content. The gap must " +
          "say what exactly is being checked, not only that something is."
      );
    }

    if (reactionGapNs <= 0n) {
      // `updateDecision`, not `ladder.raise` — `verify/gate-ablation.js` lists
      // the gates by searching for exactly this expression. Write it any other
      // way and the gate becomes INVISIBLE to the ablation: it does not fail,
      // it is not counted, it is simply absent. Same shape as register entry
      // B-130 — invisible is not refused.
      updateDecision("HOLD");
      reasons.push(
        "Gate 22 Block: zero gap. Between opening and returning the clock " +
          "did not move — nothing can have been checked in zero time. " +
          "A zero gap is itself a flag."
      );
    }

    const verdict = this.deepFreeze({
      decision: ladder.current(),
      reasons,
      provenance,
      actionBoundary: this.actionBoundary,
      reactionGapNs: reactionGapNs.toString(),   // string: BigInt does not go into JSON
      reactionGapMarkers,                        // U-24: what exactly was checked
      timestamp: new Date().toISOString(),
    });
    this.issued.add(verdict);
    this.issuedFor.set(verdict, this.fingerprint(proposal));
    return verdict;
  }

  // Kept as a method so existing callers of core.deepFreeze() keep working.
  deepFreeze(obj) {
    return deepFreeze(obj);
  }
}

module.exports = { Core };
