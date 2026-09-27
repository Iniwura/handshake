export const TRANSACTION_STAGES = [
  "SIMULATING",
  "AWAITING WALLET",
  "SUBMITTED",
  "CONSENSUS PENDING",
  "DECISION RECEIVED",
  "CONFIRMING CONTRACT STATE",
  "CONFIRMED",
  "EXECUTION FAILED",
  "CONSENSUS UNRESOLVED",
  "WALLET REJECTED",
] as const;

export type TransactionStage = typeof TRANSACTION_STAGES[number];

export type TransactionStatus = {
  stage: TransactionStage;
  hash?: string;
  message?: string;
  error?: string;
};

export function receiptSucceeded(receipt: unknown): boolean {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as Record<string, unknown>;
  const execution = String(value.txExecutionResultName || value.execution_result || "").toUpperCase();
  if (execution) return execution === "SUCCESS" || execution === "SUCCEEDED" || execution === "FINISHED";
  const statusName = String(value.statusName || value.consensusStatus || "").toUpperCase();
  if (statusName) return statusName === "ACCEPTED" || statusName === "SUCCESS" || statusName === "SUCCEEDED";
  const lifecycle = value.lifecycle;
  if (lifecycle && typeof lifecycle === "object") {
    const outcome = String((lifecycle as Record<string, unknown>).outcome || "").toLowerCase();
    if (outcome) return outcome === "accepted" || outcome === "success" || outcome === "succeeded";
  }
  const status = value.status;
  if (status === 1 || status === "1" || String(status).toLowerCase() === "success") return true;
  return false;
}

export function stageForError(error: unknown): TransactionStage {
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied|rejected the request|request rejected|code.?4001|denied/i.test(message)) return "WALLET REJECTED";
  if (/timeout|timed out|unresolved|pending|deadline|aborted/i.test(message)) return "CONSENSUS UNRESOLVED";
  return "EXECUTION FAILED";
}

export function transactionIsOpen(status: TransactionStatus | null): boolean {
  return Boolean(status && !["CONFIRMED", "EXECUTION FAILED", "CONSENSUS UNRESOLVED", "WALLET REJECTED"].includes(status.stage));
}

export function authoritativeStateConfirmed(actual: string | undefined, expected: string): boolean {
  return actual === expected;
}

export function capabilityConsumed(record: { state?: string; capability_state?: string; consumed?: boolean }, capability: { activation_state?: string; consumed?: boolean } | null): boolean {
  return record.state === "CONSUMED" && record.capability_state === "CONSUMED" && Boolean(record.consumed) && capability?.activation_state === "CONSUMED" && Boolean(capability.consumed);
}

export function canConsumeCapability(capability: { activation_state?: string; consumer?: string; consumed?: boolean } | null, walletAddress: string | null, onTargetNetwork: boolean): boolean {
  return Boolean(capability && capability.activation_state === "ACTIVE" && !capability.consumed && walletAddress && onTargetNetwork && capability.consumer && capability.consumer.toLowerCase() === walletAddress.toLowerCase());
}
