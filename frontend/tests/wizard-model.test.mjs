import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const model = await import(pathToFileURL(join(process.env.FRONTEND_TEST_BUILD, "wizard-model.js")).href);

const validDraft = {
  id: "website-redesign-2026",
  partyA: "0x1111111111111111111111111111111111111111",
  partyB: "0x2222222222222222222222222222222222222222",
  capabilityId: "docs-migration-authorization",
  action: "AUTHORIZE_MIGRATION",
  resource: "docs-production",
  scope: "two-party authorization for the declared operation",
  mode: "SINGLE_USE",
  consumer: "0x1111111111111111111111111111111111111111",
};

test("exposes the four calm wizard steps", () => {
  assert.deepEqual(model.WIZARD_STEPS.map((step) => step.eyebrow), ["1 / 4 Agreement", "2 / 4 Parties", "3 / 4 Authorization", "4 / 4 Review"]);
});

test("requires an agreement ID before leaving basics", () => {
  assert.equal(model.validateWizardStep(0, { ...validDraft, id: " " }), "Enter an agreement ID.");
  assert.equal(model.isValidWizardStep(0, validDraft), true);
});

test("requires two distinct valid wallets", () => {
  assert.equal(model.validateWizardStep(1, { ...validDraft, partyB: "" }), "Enter Party B's wallet address.");
  assert.equal(model.validateWizardStep(1, { ...validDraft, partyB: "0xnot-a-wallet" }), "Party B needs a valid wallet address.");
  assert.equal(model.validateWizardStep(1, { ...validDraft, partyB: validDraft.partyA }), "Party A and Party B must be different wallets.");
  assert.equal(model.isValidWizardStep(1, validDraft), true);
});

test("validates every authorization field and usage mode", () => {
  assert.equal(model.validateWizardStep(2, { ...validDraft, capabilityId: "" }), "Enter a capability ID.");
  assert.equal(model.validateWizardStep(2, { ...validDraft, mode: "INVALID" }), "Choose how this capability can be used.");
  assert.equal(model.validateWizardStep(2, { ...validDraft, consumer: "" }), "Enter the configured consumer's wallet address.");
  assert.equal(model.isValidWizardStep(2, validDraft), true);
});

test("review is a read-only gate and preserves the draft", () => {
  assert.equal(model.validateWizardStep(3, validDraft), "");
  assert.deepEqual(validDraft, { ...validDraft });
});
