import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { TransactionHashVariant, type CalldataEncodable } from "genlayer-js/types";
import { receiptSucceeded, stageForError, type TransactionStage, type TransactionStatus } from "./transaction-model";

export const CONTRACT_ADDRESS = String(import.meta.env.VITE_CONTRACT_ADDRESS || "0xd0cB30DCd57e2395c4CAb2451fa06Ad574241ACE");
export const CHAIN_ID = 61997;
export const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
export const DEPLOYMENT_TX = "0x9896fa2a9231a014c27370f20a98dab0d6d0d5f81be33ebc27da507b4e00506";
export const SOURCE_SHA = "2d10d11548d5b508c4087d7425d9aa02208e17821f8308e27fa695391bc24fe7";
export const RUNNER_HASH = "5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng";
export const RPC_URL = "https://studio-dev.genlayer.com/api";

export type Provider = {
  isRabby?: boolean;
  isMetaMask?: boolean;
  providers?: Provider[];
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

declare global {
  interface Window { ethereum?: Provider; }
}

const chain = { ...studioDevnet, id: CHAIN_ID, name: "GenLayer Studio Dev", rpcUrls: { default: { http: [RPC_URL] } } } as typeof studioDevnet;
const readClient = createClient({ chain });
const readConfig = { transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL };

function injected(): Provider | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return window.ethereum.providers?.find((item) => item.isRabby) || window.ethereum;
}

function parseValue<T>(value: unknown): T {
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { return value as T; }
  }
  if (value instanceof Map) return Object.fromEntries(value.entries()) as T;
  if (Array.isArray(value)) {
    if (value.length && Array.isArray(value[0])) return Object.fromEntries(value as Array<[string, unknown]>) as T;
    return value as T;
  }
  return value as T;
}

export async function readMethod<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const value = await (readClient as any).readContract({ address: CONTRACT_ADDRESS, functionName, args: args as CalldataEncodable[], jsonSafeReturn: true, ...readConfig });
  return parseValue<T>(value);
}

export async function readNegotiation(id: string): Promise<Negotiation> {
  return readMethod<Negotiation>("get_negotiation", [id]);
}

export async function readSynthesis(id: string): Promise<Synthesis> {
  return readMethod<Synthesis>("get_synthesis", [id]);
}

export async function readCapability(id: string): Promise<Capability> {
  return readMethod<Capability>("get_capability", [id]);
}

export async function readPositionFingerprint(id: string, party: Party): Promise<string> {
  return String(await readMethod<unknown>("get_position_fingerprint", [id, party]));
}

export type Party = "A" | "B";
export type Importance = "HARD" | "PREFERENCE";
export type Compatibility = "COMPATIBLE" | "PARTIAL" | "INCOMPATIBLE";
export type PositionTerm = { term_id: string; category: string; requirement: string; importance: Importance };
export type SourceRef = { party: Party; term_id: string };
export type ProposedTerm = { synthesis_id: string; category: string; agreement: string; source_terms: SourceRef[] };
export type Issue = { synthesis_id: string; description: string; source_terms: SourceRef[] };
export type Synthesis = { compatibility: Compatibility; proposed_terms: ProposedTerm[]; conflicts: Issue[]; unresolved_items: Issue[] };
export type Capability = { negotiation_id: string; capability_id: string; party_a: string; party_b: string; synthesis_fingerprint: string; capability_fingerprint: string; action: string; resource: string; scope: string; mode: "SINGLE_USE" | "REUSABLE"; consumer: string; activation_state: "INACTIVE" | "ACTIVE" | "CONSUMED"; active: boolean; consumed: boolean };
export type Negotiation = {
  negotiation_id: string;
  party_a: string;
  party_b: string;
  fingerprint: string;
  state: string;
  party_a_position: PositionTerm[];
  party_b_position: PositionTerm[];
  party_a_position_fingerprint: string;
  party_b_position_fingerprint: string;
  synthesis_json: string;
  synthesis_fingerprint: string;
  capability_id: string;
  action: string;
  resource: string;
  scope: string;
  mode: "SINGLE_USE" | "REUSABLE";
  consumer: string;
  capability_fingerprint: string;
  capability_state: "INACTIVE" | "ACTIVE" | "CONSUMED";
  consumed: boolean;
  accepted_a: boolean;
  accepted_b: boolean;
};

export type WriteStatusHandler = (status: TransactionStatus) => void;
export type WriteMethodOptions = { onStatus?: WriteStatusHandler };

function emit(handler: WriteStatusHandler | undefined, stage: TransactionStage, fields: Omit<TransactionStatus, "stage"> = {}) {
  handler?.({ stage, ...fields });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function writeMethod(address: string, functionName: string, args: unknown[], options: WriteMethodOptions = {}): Promise<string> {
  const { onStatus } = options;
  emit(onStatus, "SIMULATING", { message: "Estimating Studio Dev execution fees." });
  const wallet = injected();
  if (!wallet) {
    const error = new Error("No injected wallet detected. Connect Rabby or MetaMask.");
    emit(onStatus, "EXECUTION FAILED", { error: error.message, message: "A wallet is required for this write." });
    throw error;
  }
  const chainId = String(await wallet.request({ method: "eth_chainId" })).toLowerCase();
  if (chainId !== CHAIN_HEX) {
    const error = new Error("Switch the wallet to GenLayer Studio Dev (chain 61997).");
    emit(onStatus, "EXECUTION FAILED", { error: error.message, message: "The connected wallet is on the wrong network." });
    throw error;
  }
  const client: any = createClient({ chain, account: address as any, provider: wallet as any });
  let estimate: any;
  try {
    estimate = await client.estimateTransactionFees();
    if (BigInt(estimate.feeValue || 0) <= 0n) throw new Error("Studio Dev returned a zero fee estimate.");
  } catch (error) {
    const message = errorMessage(error);
    emit(onStatus, stageForError(error), { error: message, message: "Fee simulation did not complete." });
    throw error;
  }
  emit(onStatus, "AWAITING WALLET", { message: "Review and authorize the Studio Dev transaction." });
  let hash: string;
  try {
    hash = String(await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args: args as CalldataEncodable[],
      value: 0n,
      fees: { distribution: estimate.distribution, messageAllocations: estimate.messageAllocations, feeValue: estimate.feeValue },
    }));
  } catch (error) {
    const message = errorMessage(error);
    emit(onStatus, stageForError(error), { error: message, message: "The wallet did not submit a successful transaction." });
    throw error;
  }
  emit(onStatus, "SUBMITTED", { hash, message: "Transaction hash received from the wallet." });
  emit(onStatus, "CONSENSUS PENDING", { hash, message: "Waiting for the GenLayer decision." });
  let receipt: unknown;
  try {
    receipt = await client.waitForTransactionReceipt({ hash, waitUntil: "decided", interval: 2500, retries: 120, fullTransaction: true });
  } catch (error) {
    const message = errorMessage(error);
    emit(onStatus, stageForError(error), { hash, error: message, message: "The consensus decision was not resolved within the wait window." });
    throw error;
  }
  emit(onStatus, "DECISION RECEIVED", { hash, message: "A GenLayer decision was received; checking execution result." });
  if (!receiptSucceeded(receipt)) {
    const error = new Error("GenLayer transaction did not execute successfully.");
    emit(onStatus, "EXECUTION FAILED", { hash, error: error.message, message: "The decided transaction did not succeed." });
    throw error;
  }
  return hash;
}

export async function getWalletAddress(): Promise<string | null> {
  const wallet = injected();
  if (!wallet) return null;
  const accounts = await wallet.request({ method: "eth_accounts" }) as string[];
  return accounts?.[0] || null;
}

export async function requestWallet(): Promise<string> {
  const wallet = injected();
  if (!wallet) throw new Error("Install Rabby or another injected EVM wallet.");
  const accounts = await wallet.request({ method: "eth_requestAccounts" }) as string[];
  if (!accounts?.[0]) throw new Error("The wallet returned no account.");
  return accounts[0];
}

export async function switchToStudioDev(): Promise<void> {
  const wallet = injected();
  if (!wallet) throw new Error("No injected wallet detected.");
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? Number((error as { code: unknown }).code) : 0;
    if (code !== 4902) throw error;
    await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: "GenLayer Studio Dev", nativeCurrency: { name: "GenLayer", symbol: "GEN", decimals: 18 }, rpcUrls: [RPC_URL] }] });
  }
}

export function watchWallet(onAccount: (address: string | null) => void, onChain: (chainId: string) => void): () => void {
  const wallet = injected();
  if (!wallet?.on) return () => undefined;
  const accounts = (...args: unknown[]) => onAccount((args[0] as string[] | undefined)?.[0] || null);
  const chains = (...args: unknown[]) => onChain(String(args[0] || "").toLowerCase());
  wallet.on("accountsChanged", accounts);
  wallet.on("chainChanged", chains);
  return () => { wallet.removeListener?.("accountsChanged", accounts); wallet.removeListener?.("chainChanged", chains); };
}

export function contractExplorerUrl(): string {
  return "https://studio-dev.genlayer.com/explorer/address/" + CONTRACT_ADDRESS;
}
