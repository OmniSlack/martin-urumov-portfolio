import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("migration 002 binds separate identity guards to Permit and Attempt row types", async () => {
  const migration = await readFile(new URL("../../migrations/002_split_identity_guards.sql", import.meta.url), "utf8");
  assert.match(migration, /enforce_permit_identity\(\)/);
  assert.match(migration, /enforce_attempt_identity\(\)/);
  assert.match(migration, /permit_identity_guard[\s\S]*enforce_permit_identity\(\)/);
  assert.match(migration, /attempt_identity_guard[\s\S]*enforce_attempt_identity\(\)/);

  const permitFunction = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION navigator_stage1.enforce_permit_identity"),
    migration.indexOf("CREATE OR REPLACE FUNCTION navigator_stage1.enforce_attempt_identity"),
  );
  const attemptFunction = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION navigator_stage1.enforce_attempt_identity"),
    migration.indexOf("CREATE TRIGGER permit_identity_guard"),
  );
  assert.doesNotMatch(permitFunction, /NEW\.(permit_id|proposal_id)/);
  assert.doesNotMatch(attemptFunction, /NEW\.(envelope|envelope_digest|issued_at|expires_at)/);
});

test("migration 003 returns durable expiry outcomes instead of rolling them back with RAISE", async () => {
  const migration = await readFile(new URL("../../migrations/003_durable_expiry_signals.sql", import.meta.url), "utf8");
  assert.match(migration, /SET state='EXPIRED'[\s\S]*RETURN QUERY SELECT to_jsonb\(v_permit\),NULL::jsonb/);
  assert.match(migration, /SET state='EXPIRED'[\s\S]*SET state='CANCELLED'[\s\S]*RETURN QUERY SELECT to_jsonb\(v_permit\),to_jsonb\(v_attempt\)/);
  assert.match(migration, /v_now := clock_timestamp\(\)/);
  assert.doesNotMatch(migration, /SET state='EXPIRED'[^;]*;\s*RAISE EXCEPTION/);
});

test("migration 004 enforces exact NO-OVERRIDE dual gate at issue, claim and dispatch", async () => {
  const migration = await readFile(new URL("../../migrations/004_no_override_dual_gate.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS navigator_stage1\.core_decisions/);
  assert.match(migration, /decision text NOT NULL CHECK \(decision IN \('CLEAR','HOLD','UNKNOWN'\)\)/);
  assert.match(migration, /permit_dual_gate_issue_guard/);
  assert.match(migration, /exact Core CLEAR required before permit issue/);
  assert.match(migration, /exact Core CLEAR is missing, stale, HOLD, or UNKNOWN/);
  assert.match(migration, /dispatch requires exact current Core CLEAR/);
  assert.doesNotMatch(migration, /HUMAN_OVERRIDE|resumeExact|scoped override/i);
});
