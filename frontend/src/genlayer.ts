import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { TransactionHashVariant, type CalldataEncodable } from "genlayer-js/types";

export const CONTRACT_ADDRESS = String(import.meta.env.VITE_CONTRACT_ADDRESS || "0x5bF5F1BAE94563ecc64e41C7c28F6A4040A0CA18");
export const CHAIN_ID = 61997;
export const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
export const DEPLOYMENT_TX = "0xcd9f2c30e2970fd7012e17432ae7fa1f812768cbbc7ab54e40c1bfd34cfd2d9e";
export const SOURCE_SHA = "d9d916a276ac00b2d37420727917fe0ebc15b182d23eedc751a989cc388c231f";
export const RUNNER_HASH = "5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng";
export const RPC_URL = "https://studio-dev.genlayer.com/api";

type Provider = {
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
  accepted_a: boolean;
  accepted_b: boolean;
};

export async function writeMethod(address: string, functionName: string, args: unknown[], onSubmitted?: (hash: string) => void): Promise<string> {
  const wallet = injected();
  if (!wallet) throw new Error("No injected wallet detected. Connect Rabby or MetaMask.");
  const chainId = String(await wallet.request({ method: "eth_chainId" })).toLowerCase();
  if (chainId !== CHAIN_HEX) throw new Error("Switch the wallet to GenLayer Studio Dev (chain 61997).");
  const client: any = createClient({ chain, account: address as any, provider: wallet as any });
  const estimate = await client.estimateTransactionFees();
  if (BigInt(estimate.feeValue || 0) <= 0n) throw new Error("Studio Dev returned a zero fee estimate.");
  const hash = String(await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as CalldataEncodable[],
    value: 0n,
    fees: { distribution: estimate.distribution, messageAllocations: estimate.messageAllocations, feeValue: estimate.feeValue },
  }));
  onSubmitted?.(hash);
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: "decided", interval: 2500, retries: 120, fullTransaction: true });
  if (!isSuccessful(receipt)) {
    const status = receipt.statusName || String(receipt.status || "unknown");
    const result = receipt.txExecutionResultName || String(receipt.execution_result || "unknown");
    throw new Error("GenLayer transaction failed: " + status + " / " + result);
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
