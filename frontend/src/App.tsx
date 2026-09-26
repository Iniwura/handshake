import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Fingerprint, LockKeyhole, Menu, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  CHAIN_ID, CONTRACT_ADDRESS, DEPLOYMENT_TX, SOURCE_SHA, type Capability, type Compatibility, type Importance, type Negotiation, type Party, type PositionTerm, type Synthesis,
  contractExplorerUrl, getWalletAddress, readCapability, readNegotiation, readSynthesis, requestWallet, switchToStudioDev, watchWallet, writeMethod
} from "./genlayer";

const DEMO_A: PositionTerm[] = [
  { term_id: "payment_floor", category: "payment", requirement: "Minimum payment of $2,000.", importance: "HARD" },
  { term_id: "delivery_window", category: "delivery", requirement: "Delivery within 14 days.", importance: "HARD" },
  { term_id: "revision_rounds", category: "revisions", requirement: "Two revision rounds included.", importance: "HARD" },
  { term_id: "upfront_share", category: "payment", requirement: "50% paid upfront.", importance: "PREFERENCE" },
];
const DEMO_B: PositionTerm[] = [
  { term_id: "payment_ceiling", category: "payment", requirement: "Maximum payment of $2,500.", importance: "HARD" },
  { term_id: "delivery_limit", category: "delivery", requirement: "Delivery within 21 days.", importance: "HARD" },
  { term_id: "minimum_revisions", category: "revisions", requirement: "At least two revisions.", importance: "HARD" },
  { term_id: "milestones", category: "payment", requirement: "Payment split into milestones.", importance: "PREFERENCE" },
];

function short(value: string | null | undefined) { return value ? value.slice(0, 7) + "..." + value.slice(-5) : ""; }
function same(a: string | null | undefined, b: string | null | undefined) { return Boolean(a && b && a.toLowerCase() === b.toLowerCase()); }
function pretty(value: unknown) { return JSON.stringify(value, null, 2); }
function parsePosition(value: string): PositionTerm[] { try { return JSON.parse(value || "[]") as PositionTerm[]; } catch { return []; } }
function errorText(value: unknown) { return value instanceof Error ? value.message : String(value); }

function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chain, setChain] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([getWalletAddress(), typeof window !== "undefined" && window.ethereum ? window.ethereum.request({ method: "eth_chainId" }) : null]).then(([a, c]) => { if (active) { setAddress(a); setChain(c ? String(c).toLowerCase() : null); } }).catch((e) => active && setError(errorText(e)));
    return watchWallet((a) => setAddress(a), (c) => setChain(c));
  }, []);
  const connect = async () => { try { const next = await requestWallet(); setAddress(next); setError(""); return next; } catch (e) { setError(errorText(e)); throw e; } };
  const switchNetwork = async () => { try { await switchToStudioDev(); setChain("0x" + CHAIN_ID.toString(16)); setError(""); } catch (e) { setError(errorText(e)); } };
  return { address, chain, connect, switchNetwork, error, onTarget: chain === "0x" + CHAIN_ID.toString(16) };
}

function Button({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={"button " + className} {...props}>{children}</button>;
}

function Frame({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  return <div className="site">
    <header className="masthead">
      <Link to="/" className="brand" onClick={() => setOpen(false)}><span className="brand-mark">A&amp;B</span><span><strong>HANDSHAKE</strong><small>SEMANTIC AGREEMENT PROTOCOL</small></span></Link>
      <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X size={20} /> : <Menu size={20} />}</button>
      <nav className={open ? "nav open" : "nav"}>
        <NavLink to="/app">Workspace</NavLink><NavLink to="/compare">Compare</NavLink><NavLink to="/synthesis">Synthesis</NavLink><NavLink to="/contract">Contract</NavLink>
      </nav>
      <div className="masthead-right">
        <span className={"network-pill " + (wallet.onTarget ? "live" : "")}><i /> STUDIO DEV</span>
        {wallet.address ? <span className="wallet-pill"><Wallet size={13} /> {short(wallet.address)}</span> : <Button className="button-ink compact" onClick={() => void wallet.connect()}><Wallet size={13} /> Connect</Button>}
      </div>
    </header>
    {wallet.error && <div className="alert-strip">{wallet.error}</div>}
    {!wallet.onTarget && wallet.address && <div className="network-strip">Wallet detected on another network. <button onClick={() => void wallet.switchNetwork()}>Switch to Studio Dev</button></div>}
    {children}
    <footer className="footer"><span>HANDSHAKE / GENLAYER STUDIO DEV</span><span>Two positions. One grounded proposal.</span><span>NO DEPLOYMENT CLAIMS BEYOND THE CONTRACT</span></footer>
  </div>;
}

function Home() {
  return <main>
    <section className="hero section">
      <div className="hero-kicker"><span>01 / NEGOTIATION PRIMITIVE</span><span>STUDIO DEV  CHAIN {CHAIN_ID}</span></div>
      <div className="hero-grid">
        <div className="hero-symbol">A<span>&amp;</span>B</div>
        <div className="hero-copy"><p className="eyebrow">A semantic protocol for two parties</p><h1>Agreement,<br /><em>made explicit.</em></h1><p className="hero-lede">Handshake turns two immutable positions into a proposed agreement grounded in both sources. GenLayer synthesizes the overlap; both parties activate a bounded capability only when they accept the exact result.</p><div className="hero-actions"><Link className="button button-ink" to="/app/new">Start a negotiation <ArrowRight size={15} /></Link><Link className="text-link" to="/compare">Read the compatibility model</Link></div></div>
      </div>
      <div className="hero-foot"><span>01 / DECLARE</span><span>02 / SYNTHESIZE</span><span>03 / ACCEPT</span><span>04 / ACTIVATE</span></div>
    </section>
    <section className="manifesto section section-dark"><div className="section-index">02 / THE PRIMITIVE</div><div className="manifesto-layout"><h2>Not a chat.<br />A <em>commitment surface.</em></h2><div><p>Each party submits one bounded, immutable position. No silent weakening. No ungrounded terms. No single-sided acceptance.</p><Link className="text-link light" to="/app">Open the workspace <ArrowRight size={14} /></Link></div></div></section>
    <section className="section process"><div className="section-index">03 / HOW IT WORKS</div><div className="process-grid">{[["01","POSITIONS","Two distinct addresses submit structured terms."],["02","SYNTHESIS","Independent validators check semantics and source grounding."],["03","ACCEPTANCE","Both parties accept the exact synthesis fingerprint."],["04","CAPABILITY","Dual acceptance activates a deterministic authorization." ]].map(([n,t,d]) => <div className="process-item" key={n}><span>{n}</span><strong>{t}</strong><p>{d}</p></div>)}</div></section>
    <section className="section callout"><div><span className="eyebrow">READY WHEN BOTH SIDES ARE PRESENT</span><h2>Start with the terms<br /><em>you cannot lose.</em></h2></div><Link className="round-arrow" to="/app/new"><ArrowRight /></Link></section>
  </main>;
}

function Workspace() {
  const [id, setId] = useState("handshake-v2-compatible-20260926-r1");
  return <main className="section workspace"><div className="section-index">WORKSPACE / READ THE CONTRACT</div><div className="workspace-head"><div><p className="eyebrow">A LIVE NEGOTIATION IS AN ADDRESS</p><h1>Find the<br /><em>common ground.</em></h1><p>Read an existing negotiation by its exact identifier, or create a new two-party record.</p></div><Link className="button button-ink" to="/app/new">New negotiation <ArrowRight size={15} /></Link></div><div className="lookup"><label>NEGOTIATION ID</label><div><input value={id} onChange={(e) => setId(e.target.value)} /><Link className="button button-ink" to={"/app/negotiations/" + encodeURIComponent(id)}>Open record <ArrowRight size={15} /></Link></div></div><div className="workspace-note"><ShieldCheck size={18} /><p><strong>Authoritative reads only.</strong> The contract is the source of lifecycle state, fingerprints, positions and proposals.</p></div></main>;
}

function NewNegotiation() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [id, setId] = useState("project-" + Date.now().toString(36));
  const [a, setA] = useState(wallet.address || "");
  const [b, setB] = useState("");
  const [capabilityId, setCapabilityId] = useState("docs-migration-authorization");
  const [action, setAction] = useState("AUTHORIZE_MIGRATION");
  const [resource, setResource] = useState("docs-production");
  const [scope, setScope] = useState("two-party authorization for the declared operation");
  const [mode, setMode] = useState<"SINGLE_USE" | "REUSABLE">("SINGLE_USE");
  const [consumer, setConsumer] = useState(wallet.address || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (wallet.address && !a) setA(wallet.address); if (wallet.address && !consumer) setConsumer(wallet.address); }, [wallet.address, a, consumer]);
  const create = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await writeMethod(wallet.address || "", "create_negotiation", [id.trim(), a.trim(), b.trim(), capabilityId.trim(), action.trim(), resource.trim(), scope.trim(), mode, consumer.trim()]); navigate("/app/negotiations/" + encodeURIComponent(id.trim())); }
    catch (value) { setError(errorText(value)); } finally { setBusy(false); }
  };
  return <main className="section form-page"><div className="section-index">NEW NEGOTIATION / DECLARE PARTIES</div><div className="form-intro"><p className="eyebrow">EXACTLY TWO DISTINCT ADDRESSES</p><h1>Name the<br /><em>surface.</em></h1><p>Creation is the only moment when the two-party boundary is declared. Both addresses must later sign their own position and acceptance.</p></div><form className="editorial-form" onSubmit={create}><label>NEGOTIATION ID<input required maxLength={96} value={id} onChange={(e) => setId(e.target.value)} /></label><label>PARTY A ADDRESS<input required placeholder="0x..." value={a} onChange={(e) => setA(e.target.value)} /></label><label>PARTY B ADDRESS<input required placeholder="0x..." value={b} onChange={(e) => setB(e.target.value)} /></label><label>CAPABILITY ID<input required maxLength={96} value={capabilityId} onChange={(e) => setCapabilityId(e.target.value)} /></label><label>ACTION<input required value={action} onChange={(e) => setAction(e.target.value)} /></label><label>RESOURCE<input required value={resource} onChange={(e) => setResource(e.target.value)} /></label><label>SCOPE<input required value={scope} onChange={(e) => setScope(e.target.value)} /></label><label>USAGE MODE<select value={mode} onChange={(e) => setMode(e.target.value as "SINGLE_USE" | "REUSABLE")}><option value="SINGLE_USE">SINGLE USE</option><option value="REUSABLE">REUSABLE</option></select></label><label>CONFIGURED CONSUMER<input required placeholder="0x..." value={consumer} onChange={(e) => setConsumer(e.target.value)} /></label>{error && <p className="form-error">{error}</p>}<Button className="button-ink" disabled={busy || !wallet.address}>{busy ? "Waiting for consensus..." : "Create negotiation"} <ArrowRight size={15} /></Button></form><p className="form-caption">Studio Dev / {short(CONTRACT_ADDRESS)} / no frontend state is authoritative.</p></main>;
}

function PositionPage() {
  const { id = "" } = useParams();
  const wallet = useWallet();
  const navigate = useNavigate();
  const [party, setParty] = useState<Party>("A");
  const [json, setJson] = useState(pretty(DEMO_A));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { const terms = JSON.parse(json) as PositionTerm[]; await writeMethod(wallet.address || "", "submit_position", [id, terms]); navigate("/app/negotiations/" + encodeURIComponent(id)); }
    catch (value) { setError(errorText(value)); } finally { setBusy(false); }
  };
  return <main className="section form-page"><div className="section-index">POSITION / IMMUTABLE TERMS</div><div className="form-intro"><p className="eyebrow">ONE POSITION PER PARTY</p><h1>Make it<br /><em>legible.</em></h1><p>Structured terms are normalized, fingerprinted and frozen after submission. Use term IDs that can be cited later.</p></div><form className="editorial-form position-form" onSubmit={submit}><label>SUBMIT AS<select value={party} onChange={(e) => { const next = e.target.value as Party; setParty(next); setJson(pretty(next === "A" ? DEMO_A : DEMO_B)); }}><option value="A">PARTY A</option><option value="B">PARTY B</option></select></label><label>TERMS / JSON<textarea required rows={15} value={json} onChange={(e) => setJson(e.target.value)} /></label>{error && <p className="form-error">{error}</p>}<Button className="button-ink" disabled={busy || !wallet.address}>{busy ? "Waiting for consensus..." : "Submit immutable position"} <Fingerprint size={15} /></Button></form><p className="form-caption">The sender wallet - not the selected label - determines which declared party may submit.</p></main>;
}

function Detail() {
  const { id = "" } = useParams();
  const wallet = useWallet();
  const [record, setRecord] = useState<Negotiation | null>(null);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = async () => { try { setError(""); const next = await readNegotiation(id); setRecord(next); setCapability(await readCapability(id)); if (next.synthesis_fingerprint) setSynthesis(await readSynthesis(id)); } catch (e) { setError(errorText(e)); } };
  useEffect(() => { void load(); }, [id]);
  const positionA = useMemo(() => record ? record.party_a_position : [], [record]);
  const positionB = useMemo(() => record ? record.party_b_position : [], [record]);
  const run = async (method: string, args: unknown[], next: string) => { setBusy(next); setError(""); try { await writeMethod(wallet.address || "", method, args); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(""); } };
  if (!record) return <main className="section loading">{error ? <p className="form-error">{error}</p> : "Reading authoritative state..."}</main>;
  const hasBoth = record.party_a_position.length > 0 && record.party_b_position.length > 0;
  const active = record.state === "ACTIVE";
  const consumed = record.state === "CONSUMED";
  return <main className="section dossier"><div className="section-index">NEGOTIATION / {record.negotiation_id}</div><div className="dossier-head"><div><p className="eyebrow">AUTHORITATIVE RECORD</p><h1>{record.negotiation_id}</h1><p className="mono">{record.fingerprint}</p></div><StateBadge state={record.state} /></div><StateRail state={record.state} /><div className="party-columns"><PositionPanel label="PARTY A" address={record.party_a} position={positionA} fingerprint={record.party_a_position_fingerprint} /><PositionPanel label="PARTY B" address={record.party_b} position={positionB} fingerprint={record.party_b_position_fingerprint} /></div>{error && <p className="form-error">{error}</p>}<div className="dossier-actions">{!hasBoth && <Link className="button button-quiet" to={"/app/negotiations/" + encodeURIComponent(id) + "/position"}>Submit a position <ArrowRight size={15} /></Link>}{hasBoth && !record.synthesis_fingerprint && <Button className="button-ink" disabled={Boolean(busy)} onClick={() => void run("synthesize", [id], "synthesize")}>{busy === "synthesize" ? "Consensus is working..." : "Synthesize proposal"} <Sparkles size={15} /></Button>}{record.synthesis_fingerprint && record.state === "PENDING_ACCEPTANCE" && <Button className="button-ink" disabled={Boolean(busy) || !record.synthesis_fingerprint} onClick={() => void run("accept_synthesis", [id, record.synthesis_fingerprint], "accept")}>{busy === "accept" ? "Recording acceptance..." : "Accept exact synthesis"} <Check size={15} /></Button>}{active && <span className="seal-stamp"><ShieldCheck size={16} /> CAPABILITY ACTIVE</span>}{consumed && <span className="seal-stamp"><LockKeyhole size={16} /> CAPABILITY CONSUMED</span>}{record.state === "INCOMPATIBLE" && <span className="seal-stamp conflict">NO CAPABILITY ISSUED</span>}</div>{capability && <CapabilityPanel capability={capability} />}{synthesis && <SynthesisPanel synthesis={synthesis} fingerprint={record.synthesis_fingerprint} />}</main>;
}

function StateBadge({ state }: { state: string }) { return <span className={"state-badge " + state.toLowerCase()}>{state}</span>; }
function StateRail({ state }: { state: string }) { const labels = ["OPEN", "READY", "PENDING_ACCEPTANCE", "ACTIVE", "CONSUMED"]; const current = state === "INCOMPATIBLE" ? 2 : Math.max(0, labels.indexOf(state)); return <div className="state-rail">{labels.map((label, i) => <div className={i <= current ? "past" : ""} key={label}><i /><span>{label}</span></div>)}</div>; }
function CapabilityPanel({ capability }: { capability: Capability }) { return <section className="capability-panel"><div className="panel-head"><span>AUTHORIZATION CAPABILITY</span><StateBadge state={capability.activation_state} /></div><div className="capability-grid"><div><span>CAPABILITY</span><strong>{capability.capability_id}</strong></div><div><span>ACTION</span><strong>{capability.action}</strong></div><div><span>RESOURCE</span><strong>{capability.resource}</strong></div><div><span>MODE</span><strong>{capability.mode}</strong></div><div><span>CONSUMER</span><strong className="mono">{short(capability.consumer)}</strong></div><div><span>CAPABILITY FINGERPRINT</span><strong className="mono">{capability.capability_fingerprint || "PENDING DUAL ACCEPTANCE"}</strong></div></div><p className="synthesis-note">This definition is bound at negotiation creation. It becomes actionable only after both exact parties accept the persisted synthesis fingerprint.</p></section>; }

function PositionPanel({ label, address, position, fingerprint }: { label: string; address: string; position: PositionTerm[]; fingerprint: string }) { return <section className="position-panel"><div className="panel-head"><span>{label}</span><span className="mono">{short(address)}</span></div>{position.length ? position.map((term) => <div className="term-row" key={term.term_id}><div><strong>{term.term_id}</strong><span>{term.category}</span></div><p>{term.requirement}</p><b className={term.importance === "HARD" ? "hard" : "preference"}>{term.importance}</b></div>) : <p className="empty-panel">Position not submitted.</p>}<div className="fingerprint"><Fingerprint size={13} /> {fingerprint || "PENDING"}</div></section>; }
function SynthesisPanel({ synthesis, fingerprint }: { synthesis: Synthesis; fingerprint: string }) { return <section className="synthesis-panel"><div className="panel-head"><span>GENLAYER SYNTHESIS</span><StateBadge state={synthesis.compatibility} /></div><p className="synthesis-note">Every item below is grounded in source party and term IDs. Independent validators check the semantic interpretation before persistence.</p><h3>PROPOSED TERMS</h3>{synthesis.proposed_terms.map((item) => <div className="synthesis-row" key={item.synthesis_id}><strong>{item.synthesis_id}</strong><div><span>{item.category}</span><p>{item.agreement}</p><small>{item.source_terms.map((source) => source.party + " / " + source.term_id).join("  ")}</small></div></div>)}{synthesis.conflicts.length > 0 && <><h3>CONFLICTS</h3>{synthesis.conflicts.map((item) => <div className="issue-row" key={item.synthesis_id}><strong>{item.synthesis_id}</strong><p>{item.description}</p></div>)}</>}{synthesis.unresolved_items.length > 0 && <><h3>UNRESOLVED ITEMS</h3>{synthesis.unresolved_items.map((item) => <div className="issue-row" key={item.synthesis_id}><strong>{item.synthesis_id}</strong><p>{item.description}</p></div>)}</>}<div className="fingerprint synthesis-fp"><Fingerprint size={13} /> exact synthesis / {fingerprint}</div></section>; }

function Compare() {
  return <main className="section compare"><div className="section-index">COMPATIBILITY / A SHARED VOCABULARY</div><div className="compare-head"><p className="eyebrow">REALISTIC TEST SCENARIO</p><h1>Where positions<br /><em>meet.</em></h1><p>Compatibility is not a score. It is a grounded statement about what can be proposed without weakening what either party marked HARD.</p></div><div className="compare-table"><div className="compare-labels"><span>TERM DOMAIN</span><span>PARTY A</span><span>PARTY B</span><span>READING</span></div>{[["PAYMENT","min $2,000 / HARD","max $2,500 / HARD","compatible range"],["DELIVERY","within 14 days / HARD","within 21 days / HARD","14-day floor"],["REVISIONS","two rounds / HARD","at least two / HARD","aligned"],["PAYMENT TIMING","50% upfront / PREFERENCE","milestones / PREFERENCE","unresolved preference"]].map((row) => <div className="compare-row" key={row[0]}>{row.map((value, i) => i === 0 ? <strong key={value}>{value}</strong> : <span key={value} className={i === 3 ? "reading" : ""}>{value}</span>)}</div>)}</div><div className="compatibility-note"><span>COMPATIBLE != AUTOMATICALLY ACTIVE</span><p>A compatible proposal still needs the exact synthesis fingerprint accepted by both distinct parties before its bound capability becomes ACTIVE.</p></div><div className="compare-split"><div><h2>Hard constraints<br /><em>stay hard.</em></h2><p>Conflicting HARD payment or ownership terms cannot be returned as fully COMPATIBLE. Preferences may remain unresolved, but they never override a requirement.</p></div><div className="conflict-card"><span>IRRECONCILABLE EXAMPLE</span><strong>A: minimum $5,000</strong><strong>B: maximum $2,000</strong><b>INCOMPATIBLE</b></div></div></main>;
}

function SynthesisPage() { return <main className="section synthesis-route"><div className="section-index">SYNTHESIS / PROVENANCE</div><div className="route-intro"><p className="eyebrow">NO BLACK BOX AGREEMENTS</p><h1>Every line has<br /><em>a source.</em></h1><p>A proposal is only persistable when its items cite real terms from Party A or Party B. Empty provenance is a validation failure.</p></div><div className="provenance-diagram"><div className="diagram-party">A<div>payment_floor<br />delivery_window<br />revision_rounds</div></div><div className="diagram-center">&amp;<span>semantic<br />validation</span></div><div className="diagram-party">B<div>payment_ceiling<br />delivery_limit<br />minimum_revisions</div></div></div><Link className="button button-ink" to="/app">Read a live synthesis <ArrowRight size={15} /></Link></main>; }

function ContractPage() { return <main className="section contract-page"><div className="section-index">CONTRACT / DEPLOYMENT FACTS</div><div className="contract-head"><p className="eyebrow">SOURCE OF TRUTH</p><h1>Small surface.<br /><em>Hard edges.</em></h1><p>Handshake is contract-first. This site is a reader and transaction surface for the immutable record on GenLayer Studio Dev.</p></div><div className="facts-list">{[["CONTRACT", CONTRACT_ADDRESS],["DEPLOYMENT TX", DEPLOYMENT_TX],["RUNNER", "py-genlayer / " + "5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng"],["SOURCE SHA", SOURCE_SHA],["LIFECYCLE", "OPEN -> READY -> PENDING_ACCEPTANCE -> ACTIVE -> CONSUMED (SINGLE_USE)"]].map(([label,value]) => <div className="fact-line" key={label}><span>{label}</span><strong className="mono">{value}</strong><button onClick={() => void navigator.clipboard?.writeText(value)} aria-label={"Copy " + label}><Copy size={14} /></button></div>)}</div><a className="external-line" href={contractExplorerUrl()} target="_blank" rel="noreferrer">Open contract in Studio Dev explorer <ExternalLink size={14} /></a></main>; }

function DemoPage() { return <main className="section demo-page"><div className="section-index">DEMO / POSITION SHEETS</div><div className="demo-intro"><p className="eyebrow">A / B</p><h1>Start with<br /><em>real terms.</em></h1></div><div className="party-columns"><PositionPanel label="PARTY A / CLIENT" address="0xa35dc047f9937bf668743efbdf8ea93b31a55888" position={DEMO_A} fingerprint="" /><PositionPanel label="PARTY B / PROVIDER" address="0x30fd7e8539a8462591e62894739c6864e9b81fa2" position={DEMO_B} fingerprint="" /></div><Link className="button button-ink" to="/app/new">Use this shape <ArrowRight size={15} /></Link></main>; }

function App() {
  return <Frame><Routes><Route path="/" element={<Home />} /><Route path="/app" element={<Workspace />} /><Route path="/app/new" element={<NewNegotiation />} /><Route path="/app/negotiations/:id" element={<Detail />} /><Route path="/app/negotiations/:id/position" element={<PositionPage />} /><Route path="/app/demo" element={<DemoPage />} /><Route path="/compare" element={<Compare />} /><Route path="/synthesis" element={<SynthesisPage />} /><Route path="/contract" element={<ContractPage />} /><Route path="*" element={<Home />} /></Routes></Frame>;
}

export default App;
