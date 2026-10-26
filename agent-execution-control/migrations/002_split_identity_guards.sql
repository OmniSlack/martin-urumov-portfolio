BEGIN;

DROP TRIGGER IF EXISTS permit_identity_guard ON navigator_stage1.permits;
DROP TRIGGER IF EXISTS attempt_identity_guard ON navigator_stage1.attempts;

CREATE OR REPLACE FUNCTION navigator_stage1.enforce_permit_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR
     NEW.envelope <> OLD.envelope OR
     NEW.envelope_digest <> OLD.envelope_digest OR
     NEW.issued_at <> OLD.issued_at OR
     NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'permit authority binding is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION navigator_stage1.enforce_attempt_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR
     NEW.permit_id <> OLD.permit_id OR
     NEW.proposal_id <> OLD.proposal_id THEN
    RAISE EXCEPTION 'attempt identity binding is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER permit_identity_guard BEFORE UPDATE ON navigator_stage1.permits
FOR EACH ROW EXECUTE FUNCTION navigator_stage1.enforce_permit_identity();

CREATE TRIGGER attempt_identity_guard BEFORE UPDATE ON navigator_stage1.attempts
FOR EACH ROW EXECUTE FUNCTION navigator_stage1.enforce_attempt_identity();

DROP FUNCTION IF EXISTS navigator_stage1.enforce_bound_identity();

INSERT INTO navigator_stage1.schema_migrations(version) VALUES(2)
ON CONFLICT(version) DO NOTHING;

COMMIT;
