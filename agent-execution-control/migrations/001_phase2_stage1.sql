BEGIN;

CREATE SCHEMA IF NOT EXISTS navigator_stage1;

CREATE TABLE IF NOT EXISTS navigator_stage1.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS navigator_stage1.execution_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  state text NOT NULL CHECK (state IN ('OPEN','HOLD','STOP','UNKNOWN')),
  reason text,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO navigator_stage1.execution_gate(singleton,state)
VALUES(true,'OPEN') ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS navigator_stage1.holds (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  provenance text NOT NULL CHECK (length(btrim(provenance)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS navigator_stage1.current_state (
  scope_id text PRIMARY KEY CHECK (length(btrim(scope_id)) > 0),
  version text NOT NULL CHECK (length(btrim(version)) > 0),
  dependency_digest text NOT NULL CHECK (dependency_digest ~ '^[0-9a-f]{64}$'),
  known boolean NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS navigator_stage1.permits (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  envelope_digest text NOT NULL CHECK (envelope_digest ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('ISSUED','CLAIMED','CONSUMED','REVOKED','EXPIRED','UNKNOWN')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  claimed_attempt_id text UNIQUE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS navigator_stage1.attempts (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  permit_id text NOT NULL UNIQUE REFERENCES navigator_stage1.permits(id),
  proposal_id text NOT NULL CHECK (length(btrim(proposal_id)) > 0),
  state text NOT NULL CHECK (state IN ('REQUESTED','CLAIMED','ATTEMPTED','COMPLETED','VERIFIED','FAILED','CANCELLED','UNKNOWN')),
  dispatch_fence text UNIQUE,
  adapter_outcome jsonb,
  verification_outcome jsonb,
  invocation_started boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (state <> 'CANCELLED' OR invocation_started = false),
  CHECK (state NOT IN ('ATTEMPTED','COMPLETED','VERIFIED') OR invocation_started = true)
);

DO $$ BEGIN
  ALTER TABLE navigator_stage1.permits
    ADD CONSTRAINT permits_claimed_attempt_fk FOREIGN KEY(claimed_attempt_id)
    REFERENCES navigator_stage1.attempts(id) DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS navigator_stage1.audit_events (
  sequence bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (length(btrim(kind)) > 0),
  subject_id text NOT NULL CHECK (length(btrim(subject_id)) > 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION navigator_stage1.enforce_permit_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = OLD.state THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.state = 'ISSUED' AND NEW.state IN ('CLAIMED','REVOKED','EXPIRED','UNKNOWN')) OR
    (OLD.state = 'CLAIMED' AND NEW.state IN ('CONSUMED','REVOKED','EXPIRED','UNKNOWN'))
  ) THEN RAISE EXCEPTION 'invalid permit transition % -> %', OLD.state, NEW.state USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION navigator_stage1.enforce_bound_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'permits' AND (
    NEW.id <> OLD.id OR NEW.envelope <> OLD.envelope OR NEW.envelope_digest <> OLD.envelope_digest OR
    NEW.issued_at <> OLD.issued_at OR NEW.expires_at <> OLD.expires_at
  ) THEN RAISE EXCEPTION 'permit authority binding is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME = 'attempts' AND (
    NEW.id <> OLD.id OR NEW.permit_id <> OLD.permit_id OR NEW.proposal_id <> OLD.proposal_id
  ) THEN RAISE EXCEPTION 'attempt identity binding is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS permit_transition_guard ON navigator_stage1.permits;
CREATE TRIGGER permit_transition_guard BEFORE UPDATE OF state ON navigator_stage1.permits
FOR EACH ROW EXECUTE FUNCTION navigator_stage1.enforce_permit_transition();

DROP TRIGGER IF EXISTS permit_identity_guard ON navigator_stage1.permits;
CREATE TRIGGER permit_identity_guard BEFORE UPDATE ON navigator_stage1.permits
FOR EACH ROW EXECUTE FUNCTION navigator_stage1.enforce_bound_identity();

CREATE OR REPLACE FUNCTION navigator_stage1.enforce_attempt_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = OLD.state THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.state = 'REQUESTED' AND NEW.state IN ('CLAIMED','CANCELLED')) OR
    (OLD.state = 'CLAIMED' AND NEW.state IN ('ATTEMPTED','CANCELLED','UNKNOWN')) OR
    (OLD.state = 'ATTEMPTED' AND NEW.state IN ('COMPLETED','FAILED','UNKNOWN')) OR
    (OLD.state = 'COMPLETED' AND NEW.state = 'VERIFIED')
  ) THEN RAISE EXCEPTION 'invalid attempt transition % -> %', OLD.state, NEW.state USING ERRCODE='23514';
  END IF;
  IF NEW.state = 'CANCELLED' AND NEW.invocation_started THEN
    RAISE EXCEPTION 'CANCELLED requires invocation_started=false' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attempt_transition_guard ON navigator_stage1.attempts;
CREATE TRIGGER attempt_transition_guard BEFORE UPDATE OF state ON navigator_stage1.attempts
FOR EACH ROW EXECUTE FUNCTION navigator_stage1.enforce_attempt_transition();

DROP TRIGGER IF EXISTS attempt_identity_guard ON navigator_stage1.attempts;
CREATE TRIGGER attempt_identity_guard BEFORE UPDATE ON navigator_stage1.attempts
FOR EACH ROW EXECUTE FUNCTION navigator_stage1.enforce_bound_identity();

CREATE OR REPLACE FUNCTION navigator_stage1.claim_permit(
  p_permit_id text,
  p_attempt_id text,
  p_proposal_id text,
  p_envelope_digest text,
  p_version text,
  p_dependency_digest text
) RETURNS TABLE(permit jsonb, attempt jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  v_gate navigator_stage1.execution_gate%ROWTYPE;
  v_permit navigator_stage1.permits%ROWTYPE;
  v_attempt navigator_stage1.attempts%ROWTYPE;
  v_state navigator_stage1.current_state%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM pg_advisory_xact_lock(71001);
  SELECT * INTO v_gate FROM navigator_stage1.execution_gate WHERE singleton=true FOR UPDATE;
  IF v_gate.state <> 'OPEN' OR EXISTS(SELECT 1 FROM navigator_stage1.holds) THEN
    RAISE EXCEPTION 'execution gate is not OPEN' USING ERRCODE='55000';
  END IF;

  PERFORM pg_advisory_xact_lock(71002, hashtext(p_proposal_id));
  SELECT * INTO v_state FROM navigator_stage1.current_state WHERE scope_id=p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT v_state.known THEN RAISE EXCEPTION 'state is UNKNOWN' USING ERRCODE='55000'; END IF;
  IF v_state.version <> p_version OR v_state.dependency_digest <> p_dependency_digest THEN
    RAISE EXCEPTION 'material state/dependency drift' USING ERRCODE='55000';
  END IF;

  PERFORM pg_advisory_xact_lock(71003, hashtext(p_permit_id));
  SELECT * INTO v_permit FROM navigator_stage1.permits WHERE id=p_permit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'permit not found' USING ERRCODE='P0002'; END IF;
  IF v_permit.state <> 'ISSUED' OR v_permit.claimed_attempt_id IS NOT NULL THEN
    RAISE EXCEPTION 'permit is not claimable' USING ERRCODE='55000';
  END IF;
  IF v_now >= v_permit.expires_at THEN
    UPDATE navigator_stage1.permits SET state='EXPIRED',revision=revision+1,updated_at=v_now WHERE id=p_permit_id;
    RAISE EXCEPTION 'permit expired' USING ERRCODE='55000';
  END IF;
  IF v_permit.envelope_digest <> p_envelope_digest OR v_permit.envelope->>'proposalId' <> p_proposal_id THEN
    RAISE EXCEPTION 'exact envelope mismatch' USING ERRCODE='55000';
  END IF;

  INSERT INTO navigator_stage1.attempts(id,permit_id,proposal_id,state)
    VALUES(p_attempt_id,p_permit_id,p_proposal_id,'REQUESTED') RETURNING * INTO v_attempt;
  UPDATE navigator_stage1.attempts SET state='CLAIMED',revision=revision+1,updated_at=v_now
    WHERE id=p_attempt_id RETURNING * INTO v_attempt;
  UPDATE navigator_stage1.permits SET state='CLAIMED',claimed_attempt_id=p_attempt_id,revision=revision+1,updated_at=v_now
    WHERE id=p_permit_id RETURNING * INTO v_permit;
  INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence)
    VALUES('ATOMIC_CLAIM',p_attempt_id,jsonb_build_object('permitId',p_permit_id,'databaseTime',v_now));
  RETURN QUERY SELECT to_jsonb(v_permit),to_jsonb(v_attempt);
END $$;

CREATE OR REPLACE FUNCTION navigator_stage1.reserve_dispatch(
  p_attempt_id text,
  p_fence text,
  p_envelope_digest text,
  p_version text,
  p_dependency_digest text,
  p_proposal_id text
) RETURNS TABLE(permit jsonb, attempt jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  v_gate navigator_stage1.execution_gate%ROWTYPE;
  v_permit navigator_stage1.permits%ROWTYPE;
  v_attempt navigator_stage1.attempts%ROWTYPE;
  v_state navigator_stage1.current_state%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_gate FROM navigator_stage1.execution_gate WHERE singleton=true FOR UPDATE;
  IF v_gate.state <> 'OPEN' OR EXISTS(SELECT 1 FROM navigator_stage1.holds) THEN
    RAISE EXCEPTION 'dispatch gate is not OPEN' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_state FROM navigator_stage1.current_state WHERE scope_id=p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT v_state.known OR v_state.version <> p_version OR v_state.dependency_digest <> p_dependency_digest THEN
    RAISE EXCEPTION 'dispatch state/dependency mismatch or UNKNOWN' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_attempt FROM navigator_stage1.attempts WHERE id=p_attempt_id;
  IF NOT FOUND OR v_attempt.state <> 'CLAIMED' OR v_attempt.dispatch_fence IS NOT NULL THEN
    RAISE EXCEPTION 'attempt is not dispatchable' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_permit FROM navigator_stage1.permits WHERE id=v_attempt.permit_id FOR UPDATE;
  IF v_permit.state <> 'CLAIMED' OR v_permit.claimed_attempt_id <> p_attempt_id THEN
    RAISE EXCEPTION 'permit no longer authorizes this attempt' USING ERRCODE='55000';
  END IF;
  IF v_now >= v_permit.expires_at THEN
    UPDATE navigator_stage1.permits SET state='EXPIRED',revision=revision+1,updated_at=v_now WHERE id=v_permit.id;
    RAISE EXCEPTION 'permit expired at dispatch' USING ERRCODE='55000';
  END IF;
  IF v_permit.envelope_digest <> p_envelope_digest THEN
    RAISE EXCEPTION 'dispatch envelope mismatch' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_attempt FROM navigator_stage1.attempts WHERE id=p_attempt_id FOR UPDATE;
  IF v_attempt.state <> 'CLAIMED' OR v_attempt.dispatch_fence IS NOT NULL THEN
    RAISE EXCEPTION 'attempt changed before dispatch reservation' USING ERRCODE='55000';
  END IF;
  UPDATE navigator_stage1.attempts SET dispatch_fence=p_fence,revision=revision+1,updated_at=v_now
    WHERE id=p_attempt_id RETURNING * INTO v_attempt;
  INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence)
    VALUES('DISPATCH_RESERVED',p_attempt_id,jsonb_build_object('fence',p_fence,'databaseTime',v_now));
  RETURN QUERY SELECT to_jsonb(v_permit),to_jsonb(v_attempt);
END $$;

INSERT INTO navigator_stage1.schema_migrations(version) VALUES(1)
ON CONFLICT(version) DO NOTHING;

COMMIT;
