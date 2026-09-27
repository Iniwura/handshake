export const TOUR_STORAGE_KEY = "handshake-tour-dismissed-v1";

export type NextStepContext = {
  state: string;
  walletAddress?: string | null;
  partyA: string;
  partyB: string;
  partyAPositionSubmitted: boolean;
  partyBPositionSubmitted: boolean;
  acceptedA: boolean;
  acceptedB: boolean;
  consumer?: string | null;
};

export type NextStep = {
  message: string;
  tone: "action" | "waiting" | "terminal" | "info";
};

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function nextStepFor(context: NextStepContext): NextStep {
  const walletIsA = sameAddress(context.walletAddress, context.partyA);
  const walletIsB = sameAddress(context.walletAddress, context.partyB);

  if (context.state === "OPEN") {
    if (walletIsA && !context.partyAPositionSubmitted) return { message: "Your next step: submit your position.", tone: "action" };
    if (walletIsB && !context.partyBPositionSubmitted) return { message: "Your next step: submit your position.", tone: "action" };
    if (!context.partyAPositionSubmitted) return { message: "Waiting for Party A to submit their position.", tone: "waiting" };
    if (!context.partyBPositionSubmitted) return { message: "Waiting for Party B to submit their position.", tone: "waiting" };
    return { message: "Both positions are present. The proposal can now be synthesized.", tone: "info" };
  }

  if (context.state === "READY") return { message: "Both positions are present. The proposal can now be synthesized.", tone: "action" };

  if (context.state === "PENDING_ACCEPTANCE") {
    if (walletIsA && !context.acceptedA) return { message: "Review the synthesis and accept the exact agreement.", tone: "action" };
    if (walletIsB && !context.acceptedB) return { message: "Review the synthesis and accept the exact agreement.", tone: "action" };
    if ((walletIsA && context.acceptedA) || (walletIsB && context.acceptedB)) return { message: "Your acceptance is recorded. Waiting for the other party.", tone: "waiting" };
    return { message: "Both parties must accept the exact synthesis.", tone: "waiting" };
  }

  if (context.state === "ACTIVE") {
    if (sameAddress(context.walletAddress, context.consumer)) return { message: "The agreement is active. You can now use the authorized capability.", tone: "action" };
    return { message: "The capability is active and can only be used by the configured consumer.", tone: "info" };
  }

  if (context.state === "CONSUMED") return { message: "This single-use authorization has already been used. Replay is blocked.", tone: "terminal" };
  if (context.state === "INCOMPATIBLE") return { message: "The HARD requirements do not overlap. No capability was issued.", tone: "terminal" };
  return { message: "Read the authoritative agreement state for the next step.", tone: "info" };
}

export function tourShouldOpen(storedValue: string | null): boolean {
  return storedValue !== "dismissed";
}

export function contractExplorerUrlFor(address: string): string {
  return "https://explorer-studio-dev.genlayer.com/address/" + address;
}

export function deploymentExplorerUrlFor(transaction: string): string {
  return "https://explorer-studio-dev.genlayer.com/tx/" + transaction;
}
