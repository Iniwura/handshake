import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const model = await import(pathToFileURL(join(process.env.FRONTEND_TEST_BUILD, "ux-model.js")).href);

const base = {
  state: "OPEN",
  walletAddress: null,
  partyA: "0xaaa",
  partyB: "0xbbb",
  partyAPositionSubmitted: false,
  partyBPositionSubmitted: false,
  acceptedA: false,
  acceptedB: false,
  consumer: "0xccc",
};

test("tour dismissal is persistent but reopening is explicit", () => {
  assert.equal(model.tourShouldOpen(null), true);
  assert.equal(model.tourShouldOpen("dismissed"), false);
  assert.equal(model.TOUR_STORAGE_KEY, "handshake-tour-dismissed-v1");
});

test("next step asks a declared party to submit", () => {
  assert.equal(model.nextStepFor({ ...base, walletAddress: "0xAAA" }).message, "Your next step: submit your position.");
  assert.equal(model.nextStepFor({ ...base, walletAddress: null }).message, "Waiting for Party A to submit their position.");
});

test("next step explains ready and pending acceptance states", () => {
  assert.equal(model.nextStepFor({ ...base, state: "READY", partyAPositionSubmitted: true, partyBPositionSubmitted: true }).message, "Both positions are present. The proposal can now be synthesized.");
  assert.equal(model.nextStepFor({ ...base, state: "PENDING_ACCEPTANCE", partyAPositionSubmitted: true, partyBPositionSubmitted: true, walletAddress: "0xAAA" }).message, "Review the synthesis and accept the exact agreement.");
  assert.equal(model.nextStepFor({ ...base, state: "PENDING_ACCEPTANCE", partyAPositionSubmitted: true, partyBPositionSubmitted: true, walletAddress: "0xAAA", acceptedA: true }).message, "Your acceptance is recorded. Waiting for the other party.");
});

test("next step gives consumer-specific active guidance", () => {
  assert.equal(model.nextStepFor({ ...base, state: "ACTIVE", walletAddress: "0xCCC" }).message, "The agreement is active. You can now use the authorized capability.");
  assert.equal(model.nextStepFor({ ...base, state: "ACTIVE", walletAddress: "0xOUTSIDER" }).message, "The capability is active and can only be used by the configured consumer.");
  assert.equal(model.nextStepFor({ ...base, state: "CONSUMED" }).message, "This single-use authorization has already been used. Replay is blocked.");
  assert.equal(model.nextStepFor({ ...base, state: "INCOMPATIBLE" }).message, "The HARD requirements do not overlap. No capability was issued.");
});

test("explorer URLs use the verified Studio Dev paths", () => {
  assert.equal(model.contractExplorerUrlFor("0xabc"), "https://explorer-studio-dev.genlayer.com/address/0xabc");
  assert.equal(model.deploymentExplorerUrlFor("0xtx"), "https://explorer-studio-dev.genlayer.com/tx/0xtx");
});
