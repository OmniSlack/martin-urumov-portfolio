import assert from "node:assert/strict";
import test from "node:test";
import { usingAsyncResource } from "../resource-lifecycle.ts";

test("test-harness resource is closed before successful use completes", async () => {
  const events: string[] = [];
  const result = await usingAsyncResource(
    () => ({ end: async () => { events.push("end"); } }),
    async () => { events.push("use"); return "ok"; },
  );
  assert.equal(result, "ok");
  assert.deepEqual(events, ["use", "end"]);
});

test("test-harness resource is closed when use throws", async () => {
  const events: string[] = [];
  await assert.rejects(
    usingAsyncResource(
      () => ({ end: async () => { events.push("end"); } }),
      async () => { events.push("use"); throw new Error("test failure"); },
    ),
    /test failure/,
  );
  assert.deepEqual(events, ["use", "end"]);
});
