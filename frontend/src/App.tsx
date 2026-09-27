import { FormEvent, ReactNode, useEffect, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Fingerprint, LockKeyhole, Menu, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  CHAIN_ID, CONTRACT_ADDRESS, DEPLOYMENT_TX, SOURCE_SHA, type Capability, type Importance, type Negotiation, type Party, type PositionTerm, type Synthesis,
  contractExplorerUrl, deploymentExplorerUrl, getWalletAddress, readCapability, readNegotiation, readSynthesis, requestWallet, switchToStudioDev, watchWallet, writeMethod
} from "./genlayer";
import { authoritativeStateConfirmed, canConsumeCapability, capabilityConsumed, transactionIsOpen, type TransactionStatus } from "./transaction-model";
import { nextStepFor, TOUR_STORAGE_KEY, tourShouldOpen } from "./ux-model";
import { isValidWizardStep, validateWizardStep, WIZARD_STEPS, type AgreementDraft } from "./wizard-model";

const COMPATIBLE_ID = "handshake-v2-compatible-20260926-r1";
const INCOMPATIBLE_ID = "handshake-v2-incompatible-20260926-r1";

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

type LoadedNegotiation = { record: Negotiation; capability: Capability; synthesis: Synthesis | null };

function short(value: string | null | undefined) { return value ? value.slice(0, 7) + "..." + value.slice(-5) : ""; }
function same(a: string | null | undefined, b: string | null | undefined) { return Boolean(a && b && a.toLowerCase() === b.toLowerCase()); }
function pretty(value: unknown) { return JSON.stringify(value, null, 2); }
function errorText(value: unknown) { return value instanceof Error ? value.message : String(value); }
function initialTourOpen() {
  if (typeof window === "undefined") return false;
  try { return tourShouldOpen(window.localStorage.getItem(TOUR_STORAGE_KEY)); } catch { return false; }
}

function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chain, setChain] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([getWalletAddress(), typeof window !== "undefined" && window.ethereum ? window.ethereum.request({ method: "eth_chainId" }) : null])
      .then(([a, c]) => { if (active) { setAddress(a); setChain(c ? String(c).toLowerCase() : null); } })
      .catch((e) => active && setError(errorText(e)));
    return watchWallet((a) => setAddress(a), (c) => setChain(c));
  }, []);
  const connect = async () => { try { const next = await requestWallet(); setAddress(next); setError(""); return next; } catch (e) { setError(errorText(e)); throw e; } };
  const switchNetwork = async () => { try { await switchToStudioDev(); setChain("0x" + CHAIN_ID.toString(16)); setError(""); } catch (e) { setError(errorText(e)); } };
  return { address, chain, connect, switchNetwork, error, onTarget: chain === "0x" + CHAIN_ID.toString(16) };
}

function Button({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={"button " + className} {...props}>{children}</button>;
}

function TransactionStatusPanel({ status }: { status: TransactionStatus | null }) {
  if (!status) return null;
  return <section className={"transaction-status transaction-status-" + status.stage.toLowerCase().replaceAll(" ", "-")} aria-live="polite">
    <div className="transaction-status-head"><span>TRANSACTION LIFECYCLE</span><strong>{status.stage}</strong></div>
    {status.hash && <div className="transaction-hash"><span>TX HASH</span><code>{status.hash}</code></div>}
    <p>{status.message || (status.error ? status.error : "")}</p>
    {status.stage === "CONFIRMED" && <b className="transaction-confirmed">Authoritative contract state confirmed.</b>}
    {status.stage === "CONSENSUS UNRESOLVED" && <b className="transaction-unresolved">Do not retry blindly: the final contract state was not confirmed.</b>}
  </section>;
}


type TourStep = { title: string; body: string; target: string; path?: string };
const TOUR_STEPS: TourStep[] = [
  { title: "START A NEW AGREEMENT", body: "Create a two-party agreement here.", target: "[data-tour='start']" },
  { title: "PARTY SELECTION", body: "These are the only wallets allowed to submit and accept.", target: "[data-tour='parties']", path: "/app/new" },
  { title: "CAPABILITY FIELDS", body: "This defines what becomes authorized if both parties agree.", target: "[data-tour='capability-fields']", path: "/app/new" },
  { title: "POSITION SUBMISSION", body: "Each party independently submits their HARD requirements and preferences.", target: "[data-tour='position']", path: "/app/negotiations/" + COMPATIBLE_ID + "/position" },
  { title: "SYNTHESIS", body: "GenLayer finds the grounded intersection without weakening HARD terms.", target: "[data-tour='synthesis']", path: "/app/negotiations/" + COMPATIBLE_ID },
  { title: "ACCEPTANCE", body: "Both parties must accept the exact synthesis.", target: "[data-tour='acceptance']", path: "/app/negotiations/" + COMPATIBLE_ID },
  { title: "CAPABILITY", body: "Only then does the permission become ACTIVE.", target: "[data-tour='capability']", path: "/app/negotiations/" + COMPATIBLE_ID },
];

function findVisibleTourTarget(selector: string): Element | null {
  return Array.from(document.querySelectorAll(selector)).find((element) => element.getClientRects().length > 0) || null;
}

function ProductTour({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const step = TOUR_STEPS[stepIndex];

  useEffect(() => { if (open) setStepIndex(0); }, [open]);
  useEffect(() => {
    if (!open || !step) return;
    if (step.path && location.pathname !== step.path) {
      navigate(step.path);
      return;
    }
    let highlighted: Element | null = null;
    let retry: number | undefined;
    const attemptHighlight = () => {
      const target = findVisibleTourTarget(step.target);
      if (!target) {
        retry = window.setTimeout(attemptHighlight, 120);
        return;
      }
      highlighted = target;
      target.classList.add("tour-highlight");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    attemptHighlight();
    return () => {
      if (retry !== undefined) window.clearTimeout(retry);
      highlighted?.classList.remove("tour-highlight");
    };
  }, [location.pathname, navigate, open, step]);

  if (!open || !step) return null;
  const last = stepIndex === TOUR_STEPS.length - 1;
  const finish = () => onDismiss();
  return <aside className="tour-card" role="dialog" aria-modal="false" aria-label="How Handshake works">
    <div className="tour-card-head"><span>HOW IT WORKS / {String(stepIndex + 1).padStart(2, "0")} OF {String(TOUR_STEPS.length).padStart(2, "0")}</span><button type="button" onClick={finish} aria-label="Skip tour">×</button></div>
    <strong>{step.title}</strong><p>{step.body}</p>
    <div className="tour-card-actions"><Button className="button-quiet compact" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>Back</Button><Button className="button-ink compact" onClick={() => last ? finish() : setStepIndex((current) => current + 1)}>{last ? "Finish" : "Next"} <ArrowRight size={13} /></Button></div>
    {!last && <button type="button" className="tour-skip" onClick={finish}>Skip</button>}
  </aside>;
}

function Frame({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(initialTourOpen);
  const dismissTour = () => {
    try { window.localStorage.setItem(TOUR_STORAGE_KEY, "dismissed"); } catch { /* Tour still closes when storage is unavailable. */ }
    setTourOpen(false);
    setOpen(false);
  };
  return <div className="site">
    <header className="masthead">
      <Link to="/" className="brand" onClick={() => setOpen(false)}><span className="brand-mark">A&amp;B</span><span><strong>HANDSHAKE</strong><small>SEMANTIC AGREEMENT PROTOCOL</small></span></Link>
      <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X size={20} /> : <Menu size={20} />}</button>
      <nav className={open ? "nav open" : "nav"}>
        <NavLink className="nav-start" data-tour="start" to="/app/new" onClick={() => setOpen(false)}>Start a new agreement</NavLink><NavLink to="/app" onClick={() => setOpen(false)}>Agreements</NavLink><NavLink to="/app/demo" onClick={() => setOpen(false)}>Live demo</NavLink><button type="button" className="nav-tour-button" onClick={() => { setTourOpen(true); setOpen(false); }}>How it works</button><NavLink to="/contract" onClick={() => setOpen(false)}>Contract</NavLink>
      </nav>
      <div className="masthead-right">
        <span className={"network-pill " + (wallet.onTarget ? "live" : "")}><i /> STUDIO DEV</span>
        {wallet.address ? <span className="wallet-pill"><Wallet size={13} /> {short(wallet.address)}</span> : <Button className="button-ink compact" onClick={() => void wallet.connect()}><Wallet size={13} /> Connect</Button>}
      </div>
    </header>
    {wallet.error && <div className="alert-strip">{wallet.error}</div>}
    {!wallet.onTarget && wallet.address && <div className="network-strip">Wallet detected on another network. <button onClick={() => void wallet.switchNetwork()}>Switch to Studio Dev</button></div>}
    {children}
    <ProductTour open={tourOpen} onDismiss={dismissTour} />
    <footer className="footer"><span>HANDSHAKE / GENLAYER STUDIO DEV</span><span>Two positions. One grounded proposal.</span><span>NO DEPLOYMENT CLAIMS BEYOND THE CONTRACT</span></footer>
  </div>;
}

function Home() {
  return <main>
    <section className="hero section">
      <div className="hero-kicker"><span>01 / NEGOTIATION PRIMITIVE</span><span>STUDIO DEV  CHAIN {CHAIN_ID}</span></div>
      <div className="hero-grid">
        <div className="hero-symbol">A<span>&amp;</span>B</div>
        <div className="hero-copy"><p className="eyebrow">A semantic protocol for two parties</p><h1>Agreement,<br /><em>made explicit.</em></h1><p className="hero-lede">Handshake turns two immutable positions into a proposal grounded in both sources. GenLayer finds the valid intersection; both parties activate a bounded capability only when they accept the exact result.</p><div className="hero-actions"><Link className="button button-ink hero-primary" data-tour="start" to="/app/new">Start a new agreement <ArrowRight size={15} /></Link><Link className="text-link" to="/app/demo">Read the live proof</Link></div></div>
      </div>
      <div className="hero-foot"><span>01 / DECLARE</span><span>02 / SYNTHESIZE</span><span>03 / ACCEPT</span><span>04 / ACTIVATE</span></div>
    </section>
    <section className="manifesto section section-dark"><div className="section-index">02 / THE PRIMITIVE</div><div className="manifesto-layout"><h2>Not a chat.<br />A <em>commitment surface.</em></h2><div><p>Each party submits one bounded, immutable position. No silent weakening. No ungrounded terms. No single-sided acceptance.</p><Link className="text-link light" to="/app/new">Create the agreement surface <ArrowRight size={14} /></Link></div></div></section>
    <section className="section process"><div className="section-index">03 / HOW IT WORKS</div><div className="process-grid">{[["01","POSITIONS","Two distinct wallets submit structured terms."],["02","SYNTHESIS","Independent validators check the grounded intersection."],["03","ACCEPTANCE","Both parties accept the exact synthesis."],["04","CAPABILITY","Dual acceptance activates a bounded authorization."]].map(([n,t,d]) => <div className="process-item" key={n}><span>{n}</span><strong>{t}</strong><p>{d}</p></div>)}</div></section>
    <section className="section callout"><div><span className="eyebrow">REVIEW THE DEPLOYED PROOF</span><h2>See the path from<br /><em>ACTIVE to CONSUMED.</em></h2></div><Link className="round-arrow" to="/app/demo" aria-label="Read the live demo"><ArrowRight /></Link></section>
  </main>;
}

function Workspace() {
  const [id, setId] = useState(COMPATIBLE_ID);
  return <main className="section workspace"><div className="section-index">AGREEMENTS / AUTHORITATIVE WORKSPACE</div><div className="workspace-head"><div><p className="eyebrow">START WITH TWO DISTINCT WALLETS</p><h1>Make an<br /><em>agreement.</em></h1><p>Choose the two parties and define what their agreement can authorize.</p></div><Link className="button button-ink workspace-primary" data-tour="start" to="/app/new">Start a new agreement <ArrowRight size={15} /></Link></div><div className="workspace-choice\"><div><span>OR OPEN AN EXISTING AGREEMENT</span><p>Already have an agreement ID? Read its authoritative lifecycle, positions and proposal below.</p></div></div><div className="lookup"><label>AGREEMENT ID</label><div><input aria-label="Agreement ID" placeholder="handshake-v2-compatible-20260926-r1" value={id} onChange={(e) => setId(e.target.value)} /><Link className="button button-ink" to={"/app/negotiations/" + encodeURIComponent(id)}>Open agreement <ArrowRight size={15} /></Link></div></div><div className="workspace-note"><ShieldCheck size={18} /><p><strong>Authoritative reads only.</strong> The contract is the source of lifecycle state, fingerprints, positions and proposals.</p></div></main>;
}

function FormField({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <label className="form-field"><span className="form-field-copy"><strong>{label}</strong><small>{help}</small></span>{children}</label>;
}

function ReviewGroup({ title, rows, onEdit }: { title: string; rows: Array<[string, string]>; onEdit: () => void }) {
  return <section className="review-group"><div className="review-group-head"><h2>{title}</h2><button type="button" className="review-edit" onClick={onEdit}>Edit</button></div><div className="review-rows">{rows.map(([label, value]) => <div className="review-row" key={label}><span>{label}</span><strong className={label.includes("ADDRESS") || label === "CONSUMER" ? "mono" : ""}>{value || "—"}</strong></div>)}</div></section>;
}

const WIZARD_COPY = [
  { title: "Agreement basics", copy: "Give this agreement a unique name." },
  { title: "Who is agreeing?", copy: "Choose the two wallets that are part of this agreement." },
  { title: "What can this agreement authorize?", copy: "Define the permission that only becomes usable if both parties agree." },
  { title: "Review before creating", copy: "Check the agreement, parties and authorization before creating the base record." },
] as const;

function NewNegotiation() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AgreementDraft>(() => ({
    id: "project-" + Date.now().toString(36),
    partyA: wallet.address || "",
    partyB: "",
    capabilityId: "docs-migration-authorization",
    action: "AUTHORIZE_MIGRATION",
    resource: "docs-production",
    scope: "two-party authorization for the declared operation",
    mode: "SINGLE_USE",
    consumer: wallet.address || "",
  }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [transaction, setTransaction] = useState<TransactionStatus | null>(null);

  useEffect(() => {
    if (!wallet.address) return;
    setDraft((current) => ({
      ...current,
      partyA: current.partyA || wallet.address || "",
      consumer: current.consumer || wallet.address || "",
    }));
  }, [wallet.address]);

  const update = <K extends keyof AgreementDraft>(key: K, value: AgreementDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };
  const stepError = validateWizardStep(step, draft);
  const goNext = () => {
    const validation = validateWizardStep(step, draft);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setStep((current) => Math.min(WIZARD_STEPS.length - 1, current + 1));
  };
  const goBack = () => {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (step < WIZARD_STEPS.length - 1) {
      goNext();
      return;
    }
    const validation = validateWizardStep(2, draft);
    if (validation) {
      setStep(2);
      setError(validation);
      return;
    }
    setError("");
    setTransaction(null);
    try {
      const hash = await writeMethod(wallet.address || "", "create_negotiation", [draft.id.trim(), draft.partyA.trim(), draft.partyB.trim(), draft.capabilityId.trim(), draft.action.trim(), draft.resource.trim(), draft.scope.trim(), draft.mode, draft.consumer.trim()], { onStatus: setTransaction });
      setTransaction({ stage: "CONFIRMING CONTRACT STATE", hash, message: "Decision received; rereading authoritative OPEN state." });
      const record = await readNegotiation(draft.id.trim());
      if (!authoritativeStateConfirmed(record.state, "OPEN") || record.negotiation_id !== draft.id.trim()) throw new Error("Authoritative OPEN state was not readable after creation.");
      setTransaction({ stage: "CONFIRMED", hash, message: "Authoritative OPEN agreement confirmed." });
      navigate("/app/negotiations/" + encodeURIComponent(draft.id.trim()));
    } catch (value) {
      setError(errorText(value));
      setTransaction((current) => current?.stage === "CONFIRMING CONTRACT STATE" && current.hash ? { stage: "CONSENSUS UNRESOLVED", hash: current.hash, error: errorText(value), message: "The decision was received, but the authoritative OPEN state could not be confirmed." } : current);
    }
  };

  const blocked = transactionIsOpen(transaction);
  const currentStep = WIZARD_STEPS[step];
  return <main className="section form-page">
    <div className="section-index">START A NEW AGREEMENT / DECLARE PARTIES</div>
    <div className="form-intro">
      <p className="eyebrow">CREATE AN AGREEMENT BETWEEN TWO PARTIES</p>
      <h1>Start a new<br /><em>agreement.</em></h1>
      <p>You’re creating the base record. The positions and GenLayer synthesis come after this step.</p>
    </div>
    <nav className="wizard-progress" aria-label="Agreement creation progress">
      {WIZARD_STEPS.map((item, index) => <div className={(index === step ? "current " : "") + (index < step ? "complete" : "")} aria-current={index === step ? "step" : undefined} key={item.label}><span>{item.index + 1} / 4</span><strong>{item.label}</strong></div>)}
    </nav>
    <form className="editorial-form wizard-form" onSubmit={create}>
      <div className="wizard-step-heading"><p className="eyebrow">{currentStep.eyebrow}</p><h2>{WIZARD_COPY[step].title}</h2><p>{WIZARD_COPY[step].copy}</p></div>
      {step === 0 && <div className="wizard-step-content"><FormField label="AGREEMENT ID" help="Give this agreement a unique name."><input autoFocus required maxLength={96} placeholder="website-redesign-2026" value={draft.id} onChange={(e) => update("id", e.target.value)} /></FormField></div>}
      {step === 1 && <fieldset className="field-group wizard-step-content" data-tour="parties"><legend>WHO IS AGREEING?</legend><p className="wizard-copy">Choose the two wallets that are part of this agreement.</p><FormField label="PARTY A ADDRESS" help="First person or wallet taking part in the agreement."><input autoFocus required placeholder="0x... Party A wallet" value={draft.partyA} onChange={(e) => update("partyA", e.target.value)} /></FormField><FormField label="PARTY B ADDRESS" help="Second person or wallet taking part in the agreement."><input required placeholder="0x... Party B wallet" value={draft.partyB} onChange={(e) => update("partyB", e.target.value)} /></FormField></fieldset>}
      {step === 2 && <fieldset className="field-group wizard-step-content" data-tour="capability-fields"><legend>WHAT CAN THIS AGREEMENT AUTHORIZE?</legend><p className="wizard-copy">Define the permission that only becomes usable if both parties agree.</p><FormField label="CAPABILITY ID" help="A unique name for the permission created if both parties agree."><input autoFocus required maxLength={96} placeholder="docs-migration-authorization" value={draft.capabilityId} onChange={(e) => update("capabilityId", e.target.value)} /></FormField><FormField label="ACTION" help="What the final agreement allows."><input required placeholder="AUTHORIZE_MIGRATION" value={draft.action} onChange={(e) => update("action", e.target.value)} /></FormField><FormField label="RESOURCE" help="What the permission applies to."><input required placeholder="docs-production" value={draft.resource} onChange={(e) => update("resource", e.target.value)} /></FormField><FormField label="SCOPE" help="A plain-language description of what is authorized."><input required placeholder="two parties authorize the agreed operation" value={draft.scope} onChange={(e) => update("scope", e.target.value)} /></FormField><FormField label="USAGE MODE" help="SINGLE_USE can be used once. REUSABLE stays active after use."><select value={draft.mode} onChange={(e) => update("mode", e.target.value as AgreementDraft["mode"])}><option value="SINGLE_USE">SINGLE USE</option><option value="REUSABLE">REUSABLE</option></select></FormField><FormField label="CONFIGURED CONSUMER" help="The wallet allowed to use the activated capability."><input required placeholder="0x... consumer wallet" value={draft.consumer} onChange={(e) => update("consumer", e.target.value)} /></FormField></fieldset>}
      {step === 3 && <div className="wizard-step-content wizard-review"><ReviewGroup title="Agreement" rows={[["AGREEMENT ID", draft.id]]} onEdit={() => setStep(0)} /><ReviewGroup title="Parties" rows={[["PARTY A ADDRESS", draft.partyA], ["PARTY B ADDRESS", draft.partyB]]} onEdit={() => setStep(1)} /><ReviewGroup title="Authorization" rows={[["CAPABILITY ID", draft.capabilityId], ["ACTION", draft.action], ["RESOURCE", draft.resource], ["SCOPE", draft.scope], ["USAGE MODE", draft.mode === "SINGLE_USE" ? "SINGLE USE" : "REUSABLE"], ["CONSUMER", draft.consumer]]} onEdit={() => setStep(2)} /></div>}
      {stepError && <p className="wizard-validation">{stepError}</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="wizard-actions"><Button type="button" className="button-quiet" disabled={step === 0 || blocked} onClick={goBack}>Back</Button>{step < WIZARD_STEPS.length - 1 ? <Button type="submit" className="button-ink" disabled={blocked || !isValidWizardStep(step, draft)}>Next <ArrowRight size={15} /></Button> : <Button type="submit" className="button-ink" disabled={blocked || !wallet.address}>{blocked ? transaction?.stage : "Create agreement"} <ArrowRight size={15} /></Button>}</div>
    </form>
    <TransactionStatusPanel status={transaction} />
    <p className="form-caption">The contract creates the agreement record; later positions, synthesis and acceptance remain authoritative on Studio Dev.</p>
  </main>;
}

function PositionPage() {
  const { id = "" } = useParams();
  const wallet = useWallet();
  const navigate = useNavigate();
  const [party, setParty] = useState<Party>("A");
  const [json, setJson] = useState(pretty(DEMO_A));
  const [error, setError] = useState("");
  const [transaction, setTransaction] = useState<TransactionStatus | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setTransaction(null);
    try {
      const hash = await writeMethod(wallet.address || "", "submit_position", [id, JSON.parse(json) as PositionTerm[]], { onStatus: setTransaction });
      setTransaction({ stage: "CONFIRMING CONTRACT STATE", hash, message: "Decision received; rereading authoritative immutable position state." });
      const record = await readNegotiation(id);
      const submitted = same(wallet.address, record.party_a) ? record.party_a_position.length > 0 : same(wallet.address, record.party_b) ? record.party_b_position.length > 0 : false;
      if (!submitted) throw new Error("Authoritative position state was not readable after submission.");
      setTransaction({ stage: "CONFIRMED", hash, message: "Authoritative immutable position confirmed." });
      navigate("/app/negotiations/" + encodeURIComponent(id));
    } catch (value) {
      setError(errorText(value));
      setTransaction((current) => current?.stage === "CONFIRMING CONTRACT STATE" && current.hash ? { stage: "CONSENSUS UNRESOLVED", hash: current.hash, error: errorText(value), message: "The decision was received, but the authoritative position state could not be confirmed." } : current);
    }
  };
  const blocked = transactionIsOpen(transaction);
  return <main className="section form-page"><div className="section-index">POSITION / IMMUTABLE TERMS</div><div className="form-intro"><p className="eyebrow">ONE POSITION PER PARTY</p><h1>Make it<br /><em>legible.</em></h1><p>Each party submits once. HARD requirements must be respected; PREFERENCE terms describe what you would like when the positions overlap. Use term IDs that can be cited later.</p></div><form className="editorial-form position-form" data-tour="position" onSubmit={submit}><label>SUBMIT AS<select value={party} onChange={(e) => { const next = e.target.value as Party; setParty(next); setJson(pretty(next === "A" ? DEMO_A : DEMO_B)); }}><option value="A">PARTY A</option><option value="B">PARTY B</option></select></label><label>TERMS / JSON<textarea required rows={15} value={json} onChange={(e) => setJson(e.target.value)} /></label>{error && <p className="form-error">{error}</p>}<Button className="button-ink" disabled={blocked || !wallet.address}>{blocked ? transaction?.stage : "Submit immutable position"} <Fingerprint size={15} /></Button></form><TransactionStatusPanel status={transaction} /><p className="form-caption">The sender wallet - not the selected label - determines which declared party may submit.</p></main>;
}

function Detail() {
  const { id = "" } = useParams();
  const wallet = useWallet();
  const [record, setRecord] = useState<Negotiation | null>(null);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [transaction, setTransaction] = useState<TransactionStatus | null>(null);
  const [error, setError] = useState("");
  const load = async (): Promise<LoadedNegotiation> => {
    const next = await readNegotiation(id);
    const nextCapability = await readCapability(id);
    const nextSynthesis = next.synthesis_fingerprint ? await readSynthesis(id) : null;
    setRecord(next); setCapability(nextCapability); setSynthesis(nextSynthesis);
    return { record: next, capability: nextCapability, synthesis: nextSynthesis };
  };
  useEffect(() => { let active = true; void load().catch((e) => { if (active) setError(errorText(e)); }); return () => { active = false; }; }, [id]);
  const run = async (method: string, args: unknown[], expectedLabel: string, expected: (loaded: LoadedNegotiation) => boolean) => {
    setError(""); setTransaction(null);
    try {
      const hash = await writeMethod(wallet.address || "", method, args, { onStatus: setTransaction });
      setTransaction((current) => ({ ...(current || { stage: "DECISION RECEIVED" }), stage: "CONFIRMING CONTRACT STATE", hash, message: "Consensus succeeded; rereading authoritative contract state." }));
      const loaded = await load();
      if (!expected(loaded)) {
        setTransaction({ stage: "CONSENSUS UNRESOLVED", hash, error: "Expected authoritative state was not observable.", message: "The decision was received, but the contract state did not confirm the requested transition." });
        return;
      }
      setTransaction({ stage: "CONFIRMED", hash, message: "Authoritative state confirmed: " + expectedLabel + "." });
    } catch (value) {
      setError(errorText(value));
      setTransaction((current) => current?.stage === "CONFIRMING CONTRACT STATE" && current.hash ? { stage: "CONSENSUS UNRESOLVED", hash: current.hash, error: errorText(value), message: "The decision was received, but the authoritative state could not be confirmed." } : current);
    }
  };
  if (!record) return <main className="section loading">{error ? <p className="form-error">{error}</p> : "Reading authoritative state..."}</main>;
  const hasBoth = record.party_a_position.length > 0 && record.party_b_position.length > 0;
  const active = record.state === "ACTIVE";
  const consumed = record.state === "CONSUMED";
  const incompatible = record.state === "INCOMPATIBLE";
  const firstAcceptanceAlreadyStored = record.accepted_a || record.accepted_b;
  const canConsume = canConsumeCapability(capability, wallet.address, wallet.onTarget);
  const transactionBusy = transactionIsOpen(transaction);
  const nextStep = nextStepFor({ state: record.state, walletAddress: wallet.address, partyA: record.party_a, partyB: record.party_b, partyAPositionSubmitted: record.party_a_position.length > 0, partyBPositionSubmitted: record.party_b_position.length > 0, acceptedA: record.accepted_a, acceptedB: record.accepted_b, consumer: capability?.consumer || record.consumer });
  return <main className="section dossier"><div className="section-index">NEGOTIATION / {record.negotiation_id}</div><div className="dossier-head"><div><p className="eyebrow">AUTHORITATIVE RECORD</p><h1>{record.negotiation_id}</h1><p className="mono">{record.fingerprint}</p></div><StateBadge state={record.state} /></div><StateRail state={record.state} /><section className={"next-step-panel next-step-" + nextStep.tone}><span>NEXT STEP</span><strong>{nextStep.message}</strong></section><div className="party-columns"><PositionPanel label="PARTY A" address={record.party_a} position={record.party_a_position} fingerprint={record.party_a_position_fingerprint} /><PositionPanel label="PARTY B" address={record.party_b} position={record.party_b_position} fingerprint={record.party_b_position_fingerprint} /></div>{error && <p className="form-error">{error}</p>}<div className="dossier-actions" data-tour="acceptance">{!hasBoth && <Link className="button button-quiet" to={"/app/negotiations/" + encodeURIComponent(id) + "/position"}>Submit a position <ArrowRight size={15} /></Link>}{hasBoth && !record.synthesis_fingerprint && <Button className="button-ink" disabled={transactionBusy} onClick={() => void run("synthesize", [id], "SYNTHESIS PERSISTED", (loaded) => Boolean(loaded.record.synthesis_fingerprint))}>{transactionBusy ? transaction?.stage : "Synthesize proposal"} <Sparkles size={15} /></Button>}{record.synthesis_fingerprint && record.state === "PENDING_ACCEPTANCE" && <Button className="button-ink" disabled={transactionBusy || !record.synthesis_fingerprint} onClick={() => void run("accept_synthesis", [id, record.synthesis_fingerprint], firstAcceptanceAlreadyStored ? "ACTIVE" : "PENDING_ACCEPTANCE", (loaded) => firstAcceptanceAlreadyStored ? authoritativeStateConfirmed(loaded.record.state, "ACTIVE") : authoritativeStateConfirmed(loaded.record.state, "PENDING_ACCEPTANCE"))}>{transactionBusy ? transaction?.stage : "Accept exact synthesis"} <Check size={15} /></Button>}{active && <span className="seal-stamp"><ShieldCheck size={16} /> CAPABILITY ACTIVE</span>}{consumed && <span className="seal-stamp"><LockKeyhole size={16} /> CAPABILITY CONSUMED</span>}{incompatible && <span className="seal-stamp conflict">NO CAPABILITY ISSUED</span>}</div><TransactionStatusPanel status={transaction} />{!incompatible && capability && <CapabilityPanel capability={capability} canConsume={canConsume} walletAddress={wallet.address} onTarget={wallet.onTarget} onConsume={() => void run("consume_capability", [id], "CONSUMED", (loaded) => capabilityConsumed(loaded.record, loaded.capability))} disabled={transactionBusy} />}{incompatible && capability && <NoCapabilityPanel capability={capability} />}{synthesis && <SynthesisPanel synthesis={synthesis} fingerprint={record.synthesis_fingerprint} />}</main>;
}

function StateBadge({ state }: { state: string }) { return <span className={"state-badge " + state.toLowerCase()}>{state}</span>; }
function StateRail({ state }: { state: string }) {
  const upstream = ["OPEN", "READY"];
  const success = ["PENDING_ACCEPTANCE", "ACTIVE", "CONSUMED"];
  const successIndex = success.indexOf(state);
  return <div className="state-map" aria-label="Negotiation lifecycle">
    <div className="state-rail state-rail-upstream">{upstream.map((label, i) => <div className={upstream.indexOf(state) >= i ? "past" : ""} key={label}><i /><span>{label}</span></div>)}</div>
    <div className="state-branch-grid">
      <div className={"state-branch success-branch " + (state !== "INCOMPATIBLE" && successIndex >= 0 ? "branch-current" : "")}><span className="branch-label">THEN</span><div className="state-rail state-rail-success">{success.map((label, i) => <div className={successIndex >= i ? "past" : ""} key={label}><i /><span>{label}</span></div>)}</div></div>
      <div className={"state-branch incompatible-branch " + (state === "INCOMPATIBLE" ? "branch-current" : "")}><span className="branch-label">OR</span><div className="incompatible-node"><i /><strong>INCOMPATIBLE</strong><small>TERMINAL / NO CAPABILITY</small></div></div>
    </div>
  </div>;
}

function CapabilityPanel({ capability, canConsume, walletAddress, onTarget, onConsume, disabled }: { capability: Capability; canConsume: boolean; walletAddress: string | null; onTarget: boolean; onConsume: () => void; disabled: boolean }) {
  const actionable = capability.activation_state === "ACTIVE" && !capability.consumed;
  return <section className="capability-panel" data-tour="capability"><div className="panel-head"><span>AUTHORIZATION CAPABILITY</span><StateBadge state={capability.activation_state} /></div><div className="capability-grid"><div><span>CAPABILITY ID</span><strong>{capability.capability_id}</strong></div><div><span>ACTION</span><strong>{capability.action}</strong></div><div><span>RESOURCE</span><strong>{capability.resource}</strong></div><div><span>MODE</span><strong>{capability.mode}</strong></div><div><span>CONFIGURED CONSUMER</span><strong className="mono consumer-value">{capability.consumer}</strong></div><div><span>CAPABILITY FINGERPRINT</span><strong className="mono">{capability.capability_fingerprint || "PENDING DUAL ACCEPTANCE"}</strong></div><div><span>STATUS</span><strong>{capability.activation_state}</strong></div><div><span>CURRENTLY ACTIVE</span><strong>{capability.active ? "YES" : "NO"}</strong></div><div><span>CONSUMED</span><strong>{capability.consumed ? "YES" : "NO"}</strong></div></div><p className="synthesis-note">This definition is bound at agreement creation. It becomes actionable only after both exact parties accept the persisted synthesis fingerprint.</p>{actionable && canConsume && <Button className="button-ink capability-action" disabled={disabled} onClick={onConsume}>{disabled ? "Confirming consumption..." : "Consume authorized capability"} <LockKeyhole size={15} /></Button>}{actionable && !canConsume && <p className="consumer-gate">{!walletAddress ? "Connect the configured consumer wallet to consume." : !onTarget ? "Switch the connected wallet to GenLayer Studio Dev before consuming." : "Configured consumer only — this wallet cannot consume this capability."}</p>}{capability.activation_state === "CONSUMED" && <p className="consumer-gate consumed-gate"><LockKeyhole size={15} /> CAPABILITY CONSUMED. This SINGLE_USE action is terminal; replay is rejected by the contract.</p>}</section>;
}

function NoCapabilityPanel({ capability }: { capability: Capability }) { return <section className="no-capability-panel"><div className="panel-head"><span>DOWNSTREAM CONSEQUENCE</span><StateBadge state="INCOMPATIBLE" /></div><h2>NO CAPABILITY ISSUED</h2><p>No capability can be activated from this agreement. The HARD requirements do not overlap, so the contract issued no usable permission.</p><div className="no-capability-facts"><span>STATUS</span><strong>INCOMPATIBLE</strong><span>CURRENTLY ACTIVE</span><strong>NO</strong><span>CONSUMED</span><strong>NO</strong><span>CAPABILITY FINGERPRINT</span><strong className="mono">(empty)</strong></div></section>; }

function PositionPanel({ label, address, position, fingerprint }: { label: string; address: string; position: PositionTerm[]; fingerprint: string }) { return <section className="position-panel"><div className="panel-head"><span>{label}</span><span className="mono">{short(address)}</span></div>{position.length ? position.map((term) => <div className="term-row" key={term.term_id}><div><strong>{term.term_id}</strong><span>{term.category}</span></div><p>{term.requirement}</p><b className={term.importance === "HARD" ? "hard" : "preference"}>{term.importance}</b></div>) : <p className="empty-panel">Position not submitted.</p>}<div className="fingerprint"><Fingerprint size={13} /> {fingerprint || "PENDING"}</div></section>; }
function SynthesisPanel({ synthesis, fingerprint }: { synthesis: Synthesis; fingerprint: string }) { return <section className="synthesis-panel" data-tour="synthesis"><div className="panel-head"><span>GENLAYER SYNTHESIS</span><StateBadge state={synthesis.compatibility} /></div><p className="synthesis-note">Every item below is grounded in source party and term IDs. Independent validators check the semantic interpretation before persistence.</p>{synthesis.proposed_terms.length > 0 && <><h3>PROPOSED TERMS</h3>{synthesis.proposed_terms.map((item) => <div className="synthesis-row" key={item.synthesis_id}><strong>{item.synthesis_id}</strong><div><span>{item.category}</span><p>{item.agreement}</p><small>{item.source_terms.map((source) => source.party + " / " + source.term_id).join("  ")}</small></div></div>)}</>}{synthesis.conflicts.length > 0 && <><h3>CONFLICTS</h3>{synthesis.conflicts.map((item) => <div className="issue-row" key={item.synthesis_id}><strong>{item.synthesis_id}</strong><div><p>{item.description}</p><small>{item.source_terms.map((source) => source.party + " / " + source.term_id).join("  ")}</small></div></div>)}</>}{synthesis.unresolved_items.length > 0 && <><h3>UNRESOLVED ITEMS</h3>{synthesis.unresolved_items.map((item) => <div className="issue-row" key={item.synthesis_id}><strong>{item.synthesis_id}</strong><div><p>{item.description}</p><small>{item.source_terms.map((source) => source.party + " / " + source.term_id).join("  ")}</small></div></div>)}</>}<div className="fingerprint synthesis-fp"><Fingerprint size={13} /> exact synthesis / {fingerprint}</div></section>; }

function LiveFacts({ record, synthesis, capability }: LoadedNegotiation) {
  const facts: Array<[string, string]> = [
    ["NEGOTIATION STATE", record.state],
    ["ACCEPTED A / B", String(record.accepted_a) + " / " + String(record.accepted_b)],
    ["SYNTHESIS FINGERPRINT", record.synthesis_fingerprint || "(empty)"],
    ["CAPABILITY FINGERPRINT", capability.capability_fingerprint || "(empty)"],
    ["CAPABILITY ID", capability.capability_id],
    ["ACTION", capability.action],
    ["RESOURCE", capability.resource],
    ["MODE", capability.mode],
    ["CONFIGURED CONSUMER", capability.consumer],
    ["STATUS", capability.activation_state],
    ["CURRENTLY ACTIVE", capability.active ? "YES" : "NO"],
    ["CONSUMED", capability.consumed ? "YES" : "NO"],
  ];
  return <div className="live-facts">{facts.map(([label, value]) => <div key={label}><span>{label}</span><strong className={label.includes("FINGERPRINT") || label.includes("CONSUMER") ? "mono" : ""}>{value}</strong></div>)}{synthesis && <div><span>SYNTHESIS RESULT</span><strong>{synthesis.compatibility}</strong></div>}</div>;
}

function useLiveNegotiation(id: string) {
  const [data, setData] = useState<LoadedNegotiation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    Promise.all([readNegotiation(id), readCapability(id)]).then(async ([record, capability]) => {
      const synthesis = record.synthesis_fingerprint ? await readSynthesis(id) : null;
      if (active) { setData({ record, capability, synthesis }); setLoading(false); }
    }).catch((e) => { if (active) { setError(errorText(e)); setLoading(false); } });
    return () => { active = false; };
  }, [id]);
  return { data, error, loading };
}

function LiveDemoCase({ title, eyebrow, id, live, incompatible = false }: { title: string; eyebrow: string; id: string; live: ReturnType<typeof useLiveNegotiation>; incompatible?: boolean }) {
  if (live.loading) return <article className="live-case"><div className="live-case-head"><span>{eyebrow}</span><strong>{title}</strong></div><p className="loading-inline">Reading Studio Dev authoritative state...</p></article>;
  if (live.error || !live.data) return <article className="live-case"><div className="live-case-head"><span>{eyebrow}</span><strong>{title}</strong></div><p className="form-error">{live.error || "The authoritative record could not be read."}</p></article>;
  const { data } = live;
  const currentConsumed = capabilityConsumed(data.record, data.capability);
  return <article className={"live-case " + (incompatible ? "live-case-incompatible" : "")}><div className="live-case-head"><div><span>{eyebrow}</span><h2>{title}</h2><p className="mono">{id}</p></div><StateBadge state={data.record.state} /></div>{incompatible ? <div className="lifecycle-proof lifecycle-proof-terminal"><span>NO INTERSECTION</span><strong>INCOMPATIBLE</strong><p>Terminal branch. No capability can be activated from this negotiation.</p></div> : <div className="lifecycle-proof"><span>LIVE SEQUENCE</span><strong>DUAL ACCEPTANCE → ACTIVE → CONSUMED</strong><p>Current authoritative read: {data.record.state}. Both acceptance flags are true; the configured consumer completed the single-use operation and replay was rejected.</p></div>}<LiveFacts {...data} /><div className="party-columns"><PositionPanel label="PARTY A / IMMUTABLE" address={data.record.party_a} position={data.record.party_a_position} fingerprint={data.record.party_a_position_fingerprint} /><PositionPanel label="PARTY B / IMMUTABLE" address={data.record.party_b} position={data.record.party_b_position} fingerprint={data.record.party_b_position_fingerprint} /></div>{data.synthesis && <SynthesisPanel synthesis={data.synthesis} fingerprint={data.record.synthesis_fingerprint} />}{incompatible ? <NoCapabilityPanel capability={data.capability} /> : <div className="live-proof-footer"><strong>{currentConsumed ? "CONSUMED / REPLAY PROTECTED" : "ACTIVE / READY FOR CONFIGURED CONSUMER"}</strong><Link className="text-link" to={"/app/negotiations/" + encodeURIComponent(id)}>Open authoritative record <ArrowRight size={14} /></Link></div>}</article>;
}

function DemoPage() {
  const compatible = useLiveNegotiation(COMPATIBLE_ID);
  const incompatible = useLiveNegotiation(INCOMPATIBLE_ID);
  return <main className="section demo-page"><div className="section-index">LIVE DEMO / STUDIO DEV READS</div><div className="demo-intro"><div><p className="eyebrow">PRIMARY REVIEWER WALKTHROUGH</p><h1>Proof, not<br /><em>promise.</em></h1><p className="demo-lede">This page reads the deployed Handshake v2 contract directly. No wallet is required to understand the two outcomes: a grounded authorization that reached CONSUMED, and a genuine HARD conflict that issued nothing.</p></div><div className="demo-contract-mark"><span>CONTRACT</span><strong>{short(CONTRACT_ADDRESS)}</strong><span>CHAIN {CHAIN_ID}</span></div></div><div className="demo-actions"><Link className="button button-ink" data-tour="start" to="/app/new">Start a new agreement <ArrowRight size={15} /></Link><Link className="text-link" to="/compare">Understand the model</Link></div><LiveDemoCase eyebrow="LIVE / COMPATIBLE MIGRATION AUTHORIZATION" title="Two positions. One consumed capability." id={COMPATIBLE_ID} live={compatible} /><LiveDemoCase eyebrow="LIVE / FAIL-CLOSED CONFLICT" title="No intersection." id={INCOMPATIBLE_ID} live={incompatible} incompatible /></main>;
}

function Compare() {
  return <main className="section compare"><div className="section-index">COMPATIBILITY / EDUCATIONAL MODEL</div><div className="compare-head"><p className="eyebrow">STATIC EXPLANATION / LIVE PROOF AT /APP/DEMO</p><h1>Where positions<br /><em>meet.</em></h1><p>This payment, delivery and revision shape is an educational example. The primary reviewer walkthrough uses the real deployed migration authorization records.</p><Link className="button button-ink" to="/app/demo">Open live v2 demo <ArrowRight size={15} /></Link></div><div className="compare-table"><div className="compare-labels"><span>TERM DOMAIN</span><span>PARTY A</span><span>PARTY B</span><span>READING</span></div>{[["PAYMENT","min $2,000 / HARD","max $2,500 / HARD","compatible range"],["DELIVERY","within 14 days / HARD","within 21 days / HARD","14-day floor"],["REVISIONS","two rounds / HARD","at least two / HARD","aligned"],["PAYMENT TIMING","50% upfront / PREFERENCE","milestones / PREFERENCE","unresolved preference"]].map((row) => <div className="compare-row" key={row[0]}>{row.map((value, i) => i === 0 ? <strong key={value}>{value}</strong> : <span key={value} className={i === 3 ? "reading" : ""}>{value}</span>)}</div>)}</div><div className="compatibility-note"><span>COMPATIBLE != AUTOMATICALLY ACTIVE</span><p>A compatible proposal still needs the exact synthesis fingerprint accepted by both distinct parties before its bound capability becomes ACTIVE.</p></div><div className="compare-split"><div><h2>Hard constraints<br /><em>stay hard.</em></h2><p>Conflicting HARD payment or ownership terms cannot be returned as fully COMPATIBLE. Preferences may remain unresolved, but they never override a requirement.</p></div><div className="conflict-card"><span>IRRECONCILABLE EXAMPLE</span><strong>A: minimum $5,000</strong><strong>B: maximum $2,000</strong><b>INCOMPATIBLE</b></div></div></main>;
}

function SynthesisPage() { return <main className="section synthesis-route"><div className="section-index">SYNTHESIS / PROVENANCE</div><div className="route-intro"><p className="eyebrow">NO BLACK BOX AGREEMENTS</p><h1>Every line has<br /><em>a source.</em></h1><p>A proposal is only persistable when its items cite real terms from Party A or Party B. Empty provenance is a validation failure.</p></div><div className="provenance-diagram"><div className="diagram-party">A<div>downtime-limit<br />preserve-urls<br />rollback-checkpoint</div></div><div className="diagram-center">&amp;<span>semantic<br />validation</span></div><div className="diagram-party">B<div>history-preserved<br />maintenance-window<br />rollback-tested</div></div></div><Link className="button button-ink" to="/app/demo">Read the live synthesis <ArrowRight size={15} /></Link></main>; }

function ContractPage() { return <main className="section contract-page"><div className="section-index">CONTRACT / DEPLOYMENT FACTS</div><div className="contract-head"><p className="eyebrow">SOURCE OF TRUTH</p><h1>Small surface.<br /><em>Hard edges.</em></h1><p>Handshake is contract-first. This site is a reader and transaction surface for the immutable record on GenLayer Studio Dev.</p></div><div className="facts-list">{[["CONTRACT", CONTRACT_ADDRESS],["DEPLOYMENT TX", DEPLOYMENT_TX],["RUNNER", "py-genlayer / " + "5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng"],["SOURCE SHA", SOURCE_SHA],["LIFECYCLE", "OPEN -> READY -> PENDING_ACCEPTANCE -> ACTIVE -> CONSUMED (SINGLE_USE)" ]].map(([label,value]) => <div className="fact-line" key={label}><span>{label}</span><strong className="mono">{value}</strong><button onClick={() => void navigator.clipboard?.writeText(value)} aria-label={"Copy " + label}><Copy size={14} /></button></div>)}</div><div className="contract-actions"><Link className="button button-quiet" to="/app/demo">Open reviewer demo <ArrowRight size={14} /></Link><a className="external-line" href={contractExplorerUrl()} target="_blank" rel="noreferrer">Open contract in Studio Dev explorer <ExternalLink size={14} /></a><a className="external-line" href={deploymentExplorerUrl()} target="_blank" rel="noreferrer">Open deployment transaction <ExternalLink size={14} /></a></div></main>; }

function App() {
  return <Frame><Routes><Route path="/" element={<Home />} /><Route path="/app" element={<Workspace />} /><Route path="/app/new" element={<NewNegotiation />} /><Route path="/app/negotiations/:id" element={<Detail />} /><Route path="/app/negotiations/:id/position" element={<PositionPage />} /><Route path="/app/demo" element={<DemoPage />} /><Route path="/compare" element={<Compare />} /><Route path="/synthesis" element={<SynthesisPage />} /><Route path="/contract" element={<ContractPage />} /><Route path="*" element={<Home />} /></Routes></Frame>;
}

export default App;
