BEGIN;

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
  v_now timestamptz;
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
  v_now := clock_timestamp();
  IF v_now >= v_permit.expires_at THEN
    UPDATE navigator_stage1.permits SET state='EXPIRED',revision=revision+1,updated_at=v_now
      WHERE id=p_permit_id RETURNING * INTO v_permit;
    INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence)
      VALUES('PERMIT_EXPIRED',p_permit_id,jsonb_build_object('phase','CLAIM','databaseTime',v_now));
    RETURN QUERY SELECT to_jsonb(v_permit),NULL::jsonb;
    RETURN;
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
  v_now timestamptz;
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
  v_now := clock_timestamp();
  IF v_now >= v_permit.expires_at THEN
    UPDATE navigator_stage1.permits SET state='EXPIRED',revision=revision+1,updated_at=v_now
      WHERE id=v_permit.id RETURNING * INTO v_permit;
    UPDATE navigator_stage1.attempts SET state='CANCELLED',revision=revision+1,updated_at=v_now
      WHERE id=p_attempt_id RETURNING * INTO v_attempt;
    INSERT INTO navigator_stage1.audit_events(kind,subject_id,evidence)
      VALUES('PERMIT_EXPIRED',v_permit.id,jsonb_build_object('phase','DISPATCH','attemptId',p_attempt_id,'databaseTime',v_now));
    RETURN QUERY SELECT to_jsonb(v_permit),to_jsonb(v_attempt);
    RETURN;
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

INSERT INTO navigator_stage1.schema_migrations(version) VALUES(3)
ON CONFLICT(version) DO NOTHING;

COMMIT;
