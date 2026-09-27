import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const model = await import(pathToFileURL(join(process.env.FRONTEND_TEST_BUILD, "transaction-model.js")).href);


test("accepts a successful receipt with convenience fields", () => {
  assert.equal(model.receiptSucceeded({ statusName: "ACCEPTED", consensusStatus: "ACCEPTED" }), true);
});

test("accepts a successful receipt without convenience fields", () => {
  assert.equal(model.receiptSucceeded({ status: 1 }), true);
  assert.equal(model.receiptSucceeded({ lifecycle: { outcome: "accepted" } }), true);
});

test("classifies execution failure", () => {
  assert.equal(model.receiptSucceeded({ statusName: "REVERTED" }), false);
  assert.equal(model.receiptSucceeded({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_ERROR" }), false);
  assert.equal(model.stageForError(new Error("FINISHED_WITH_ERROR")), "EXECUTION FAILED");
});

test("classifies wallet rejection", () => {
  assert.equal(model.stageForError(new Error("User rejected the request (code 4001)")), "WALLET REJECTED");
});

test("classifies a pending timeout as unresolved", () => {
  assert.equal(model.stageForError(new Error("Timed out while waiting for consensus")), "CONSENSUS UNRESOLVED");
});

test("does not confirm delayed authoritative state", () => {
  assert.equal(model.authoritativeStateConfirmed(undefined, "CONSUMED"), false);
  assert.equal(model.authoritativeStateConfirmed("ACTIVE", "CONSUMED"), false);
  assert.equal(model.authoritativeStateConfirmed("CONSUMED", "CONSUMED"), true);
});

test("consume confirms only the complete CONSUMED state", () => {
  const record = { state: "CONSUMED", capability_state: "CONSUMED", consumed: true };
  assert.equal(model.capabilityConsumed(record, { activation_state: "ACTIVE", consumed: false }), false);
  assert.equal(model.capabilityConsumed(record, { activation_state: "CONSUMED", consumed: true }), true);
});


test("consume control is fail-closed for wallet and lifecycle variants", () => {
  const active = { activation_state: "ACTIVE", consumer: "0xabc", consumed: false };
  assert.equal(model.canConsumeCapability(active, null, true), false);
  assert.equal(model.canConsumeCapability(active, "0xabc", false), false);
  assert.equal(model.canConsumeCapability(active, "0xoutsider", true), false);
  assert.equal(model.canConsumeCapability(active, "0xABC", true), true);
  assert.equal(model.canConsumeCapability({ ...active, activation_state: "CONSUMED", consumed: true }, "0xabc", true), false);
  assert.equal(model.canConsumeCapability({ activation_state: "INACTIVE", consumer: "0xabc", consumed: false }, "0xabc", true), false);
});
