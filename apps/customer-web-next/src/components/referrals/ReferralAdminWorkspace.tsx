"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { adminFetch } from "@/lib/admin-renewal";
import { createReferralClient, ReferralApiError, type ReferralTransport } from "@/lib/referrals/client";
import { approvalKeys, formatPaise, formatReferralTime, policyDraftSchema, rupeesToPaise, type AdminOverview, type PolicyPage, type QueuePage } from "@/lib/referrals/contracts";
import styles from "./referrals.module.css";

type Props = { accountId: string; transport?: ReferralTransport; brand?: ReactNode };
type Queue = "fraud" | "cashouts" | "outbox" | "inbox";
type Action = "fraud-clear" | "fraud-confirm" | "cashout-approve" | "reward-reverse" | "inbox-replay" | "outbox-replay" | "policy-approve";
type Intent = { action: Action; target: string; evidence: string; amountPaise: string; withholdingPaise: string; source: "auth" | "order" | "finance"; operationId: string; effectiveAt: string; expected: string };
const queueStates: Record<Queue, string[]> = { fraud: ["OPEN", "CLEARED", "CONFIRMED"], cashouts: ["UNKNOWN", "RESERVED", "APPROVED", "SUBMITTED", "PAID", "RELEASED"], outbox: ["DEAD", "PENDING", "LEASED", "ACKED"], inbox: ["DEAD"] };
const evidenceLabels: Record<typeof approvalKeys[number], string> = { legalReviewRef: "Legal opinion reference", termsVersion: "Accepted programme terms version", taxReviewRef: "Tax assessment reference", privacyReviewRef: "Privacy / consent review", fundingReviewRef: "Commission and marketing-budget review", multiChefDecisionRef: "Multi-chef minimum / allocation decision", payoutReviewRef: "Payout and KYC review" };
const text = (error: unknown) => error instanceof Error ? error.message : "The operation could not be completed.";
const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

export function ReferralAdminWorkspace(props: Props) { return <ReferralAdminContent key={props.accountId} {...props} />; }
function ReferralAdminContent({ transport = adminFetch, brand }: Props) {
  const api = useMemo(() => createReferralClient(transport), [transport]);
  const [overview, setOverview] = useState<AdminOverview | null>(null), [policies, setPolicies] = useState<PolicyPage | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [problem, setProblem] = useState(""), [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"overview" | "policy" | "review" | "audit">("overview");
  const [queue, setQueue] = useState<Queue>("fraud"), [state, setState] = useState("OPEN"), [source, setSource] = useState<"auth" | "order" | "finance">("order");
  const [page, setPage] = useState<QueuePage>({ items: [], nextCursor: null });
  const [action, setAction] = useState<Action>("fraud-clear"), [target, setTarget] = useState("");
  const [pending, setPending] = useState<Intent | null>(null), [auditAfter, setAuditAfter] = useState("0"), [auditMore, setAuditMore] = useState(true);
  const abort = useRef<AbortController | null>(null), generation = useRef(0), queueGeneration = useRef(0);
  const load = useCallback(async () => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller; const current = ++generation.current;
    setLoading(true); setProblem("");
    try {
      const [nextOverview, nextPolicies] = await Promise.all([api.adminOverview(controller.signal), api.policies(controller.signal)]);
      if (current !== generation.current) return; setOverview(nextOverview); setPolicies(nextPolicies);
    } catch (error) {
      if (current !== generation.current || controller.signal.aborted) return;
      if (error instanceof ReferralApiError && [401, 403].includes(error.status)) { setOverview(null); setPolicies(null); setPage({ items: [], nextCursor: null }); }
      setProblem(text(error));
    } finally { if (current === generation.current) setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); return () => { generation.current++; queueGeneration.current++; abort.current?.abort(); }; }, [load]);
  async function loadQueue(cursor?: string | null) {
    const current = ++queueGeneration.current, identity = generation.current; setBusy(true); setNotice("");
    try {
      const result = queue === "inbox" ? await api.inbox(source, cursor) : await api.queue(queue, state, cursor);
      if (current !== queueGeneration.current || identity !== generation.current) return;
      const nextCursor = "nextCursor" in result ? result.nextCursor : result.nextId;
      setPage({ items: result.items, nextCursor });
    } catch (error) { if (current === queueGeneration.current && identity === generation.current) setNotice(text(error)); }
    finally { if (current === queueGeneration.current && identity === generation.current) setBusy(false); }
  }
  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!policies || busy || problem) return;
    const data = new FormData(event.currentTarget), current = generation.current; setBusy(true); setNotice("");
    try {
      const draft = policyDraftSchema.parse({ expectedLatestRevision: policies.latestRevision,
        l1Bps: Number(field(data, "l1")), l2Bps: Number(field(data, "l2")), l3Bps: Number(field(data, "l3")), capBps: 400,
        holdDays: Number(field(data, "hold")), minimumPaise: rupeesToPaise(field(data, "minimum")),
        customerBonusPaise: rupeesToPaise(field(data, "bonus")), inviteeDiscountPaise: rupeesToPaise(field(data, "discount")),
        approvals: Object.fromEntries(approvalKeys.map(key => [key, field(data, key)])) });
      const result = await api.createPolicy(draft);
      if (current !== generation.current) return;
      setNotice(`Draft revision ${result.revision} saved. A different administrator must approve it. Existing orders keep their original policy.`); await load();
    } catch (error) { if (current === generation.current) setNotice(`${text(error)} Refresh the revision list before another draft submission.`); }
    finally { setBusy(false); }
  }
  async function execute(intent: Intent) {
    switch (intent.action) {
      case "fraud-clear": return api.resolveFraud(intent.target, "CLEARED", intent.evidence);
      case "fraud-confirm": return api.resolveFraud(intent.target, "CONFIRMED", intent.evidence);
      case "cashout-approve": return api.approveCashout(intent.target, intent.amountPaise, intent.withholdingPaise, intent.evidence);
      case "reward-reverse": return api.reverseReward(intent.target, intent.operationId, intent.amountPaise, intent.evidence);
      case "inbox-replay": return api.replayInbox(intent.source, intent.target, intent.evidence);
      case "outbox-replay": return api.replayOutbox(intent.target, intent.evidence);
      case "policy-approve": return api.approvePolicy(intent.target, intent.effectiveAt, intent.expected);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !policies) return;
    const data = new FormData(event.currentTarget), current = generation.current; setBusy(true); setNotice("");
    try {
      if (!pending && (field(data, "confirm") !== target || problem || loading)) throw new Error("Refresh the current state and type the exact target reference to confirm.");
      const intent = pending ?? { action, target, evidence: field(data, "evidence"), source,
        amountPaise: ["cashout-approve", "reward-reverse"].includes(action) ? rupeesToPaise(field(data, "amount")) : "0",
        withholdingPaise: action === "cashout-approve" ? rupeesToPaise(field(data, "withholding")) : "0",
        effectiveAt: action === "policy-approve" ? new Date(field(data, "effective")).toISOString() : "",
        expected: policies.latestActivatedRevision, operationId: crypto.randomUUID() };
      setPending(intent); await execute(intent);
      if (current !== generation.current) return;
      setPending(null); setTarget(""); setPage({ items: [], nextCursor: null });
      setNotice("The server accepted this operation. Review the updated record; approval or replay does not prove that a bank payment completed."); await load();
    } catch (error) {
      if (current !== generation.current) return;
      if (!(error instanceof ReferralApiError) || !error.uncertain) setPending(null);
      setNotice(text(error));
    } finally { setBusy(false); }
  }
  async function exportAudit() {
    if (busy || problem) return; const current = generation.current; setBusy(true);
    try {
      const response = await transport(`/api/referrals/admin/audit/export?afterId=${auditAfter}&limit=500`, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/x-ndjson" } });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("application/x-ndjson")) throw new Error("The audited export could not be verified.");
      const next = response.headers.get("X-Next-Audit-Id"), more = response.headers.get("X-Has-More");
      if (!next || !/^\d{1,19}$/.test(next) || !["true", "false"].includes(more ?? "")) throw new Error("Missing export pagination evidence.");
      const blob = await response.blob(); if (current !== generation.current) return;
      if (blob.size > 2097152) throw new Error("The export page exceeds the configured response limit.");
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `craves-referral-audit-after-${auditAfter}.ndjson`;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAuditAfter(next); setAuditMore(more === "true"); setNotice(`Exported one bounded audit page. Next ID: ${next}. Protect this file as internal audit data.`);
    } catch (error) { if (current === generation.current) setNotice(text(error)); }
    finally { setBusy(false); }
  }
  const disabled = busy || loading || Boolean(problem) || !overview;
  return <section className={styles.workspace} aria-labelledby="referral-admin-title">
    <header className={styles.hero}><div>{brand}<p className={styles.eyebrow}>CRAVES · CONTROL CENTRE</p><h1 id="referral-admin-title">Referral operations</h1><p>Policy, reward liabilities and exception review in one place. Every financial action is re-authorised by the referral service.</p></div><div className={styles.heroMark} aria-hidden="true"><ShieldCheck size={40} /></div></header>
    <div className={styles.toolbar}><span>No direct bank-payment or runtime-switch controls are exposed here.</span><button className={styles.secondary} onClick={() => void load()} disabled={loading || busy}><RefreshCw size={16} aria-hidden="true" />{loading ? "Refreshing…" : "Refresh verified state"}</button></div>
    {problem && <div className={styles.error} role="alert">{problem}</div>}{notice && <div className={styles.notice} role="status">{notice}</div>}
    {loading && !overview && <div className={styles.empty} role="status">Verifying administrator access and loading referral operations…</div>}
    {overview && <>
      <p className={styles.asOf}>As of {formatReferralTime(overview.asOf)}</p>
      <nav className={styles.tabs} aria-label="Referral operations sections">{(["overview", "policy", "review", "audit"] as const).map(value => <button key={value} className={`${styles.secondary} ${value === tab ? styles.tabActive : ""}`} aria-pressed={value === tab} onClick={() => setTab(value)}>{value === "review" ? "Review & recovery" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</nav>
      {tab === "overview" && <><div className={styles.switches}>{Object.entries(overview.flags).map(([name, enabled]) => <span className={styles.badge} key={name}>{name}: {enabled ? "enabled" : "disabled"}</span>)}</div><div className={styles.metrics}>{([ ["Pending liability", overview.pendingPaise], ["Available balance", overview.availablePaise], ["Reserved funds", overview.reservedPaise] ] as const).map(([name, value]) => <article className={styles.metric} key={name}><span>{name}</span><strong>{formatPaise(value)}</strong></article>)}</div><div className={styles.statGrid} style={{ marginTop: 16 }}>{([ ["Enrolled members", overview.members], ["Open fraud cases", overview.fraudOpen], ["Failed inbound events", overview.inboxDead], ["Failed outbound events", overview.outboxDead], ["Uncertain transfers", overview.unknownCashouts], ["Wallet reconciliation mismatches", overview.walletDriftCount] ] as const).map(([name, value]) => <article className={styles.metric} key={name}><span>{name}</span><strong>{value}</strong></article>)}</div>{overview.walletDriftCount !== "0" && <p className={styles.error}>Wallet reconciliation is not clean. Pause financial execution and investigate before releasing funds.</p>}<article className={styles.card} style={{ marginTop: 18 }}><h2>Separately funded marketing budgets</h2><dl className={styles.details}>{overview.budgets.map(budget => <div key={budget.track}><dt>{budget.track}</dt><dd>{formatPaise(budget.availablePaise)}</dd></div>)}</dl><p className={styles.muted}>Seller-chain rewards require order-specific, finance-confirmed commission funding. Customer bonuses and invitee discounts are not included in the 4% cap.</p></article></>}
      {tab === "policy" && policies && <><article className={styles.card}><h2>Immutable policy revisions</h2><p className={styles.muted}>Active: {policies.activeRevision}. Latest draft: {policies.latestRevision}. The initial seeded revision cannot be activated without real review evidence and a second administrator.</p><div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Referral policy revisions</caption><thead><tr><th>Revision</th><th>Rates</th><th>Minimum / hold</th><th>State / effective time</th><th>Review</th></tr></thead><tbody>{policies.items.map(policy => <tr key={policy.revision}><td>{policy.revision}</td><td>{policy.ratesBps.map(rate => `${rate / 100}%`).join(" / ")}</td><td>{formatPaise(policy.minimumPaise)} · {policy.holdDays} days</td><td>{policy.state}<small>{policy.effectiveAt ? formatReferralTime(policy.effectiveAt) : "Not scheduled"}</small></td><td><button className={styles.secondary} disabled={disabled || policy.state !== "DRAFT" || !policy.createdBy || policy.createdBy === overview.viewerId} onClick={() => { setAction("policy-approve"); setTarget(policy.revision); setTab("review"); }}>Review activation</button></td></tr>)}</tbody></table></div></article>
        <article className={styles.card}><h2>Create a future-order policy draft</h2><p className={styles.warning}>Evidence fields must reference real approvals. This form does not provide legal, tax, KYC or budget approval and never changes historic orders.</p><form onSubmit={event => void saveDraft(event)}><fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}><div className={styles.formGrid}>{[ ["l1", "Level 1 (basis points)", "200"], ["l2", "Level 2 (basis points)", "120"], ["l3", "Level 3 (basis points)", "80"], ["hold", "Refund hold (days)", "14"], ["minimum", "Qualifying subtotal (rupees)", "800"], ["bonus", "Customer bonus (rupees)", "400"], ["discount", "Invitee discount (rupees)", "250"] ].map(([name, label, value]) => <label key={name} className={styles.label}>{label}<input className={styles.input} name={name} defaultValue={value} inputMode="decimal" required /></label>)}{approvalKeys.map(key => <label key={key} className={styles.label}>{evidenceLabels[key]}<input name={key} className={styles.input} maxLength={180} autoComplete="off" required /></label>)}</div><label className={styles.check}><input type="checkbox" required />I am recording reviewed evidence, not creating or assuming an approval.</label><button className={styles.primary} type="submit">Save draft for second-person review</button></fieldset></form></article></>}
      {tab === "review" && <><article className={styles.card}><h2>Bounded exception queues</h2><div className={styles.formGrid}><label className={styles.label}>Queue<select className={styles.select} value={queue} disabled={busy} onChange={event => { const value = event.target.value as Queue; queueGeneration.current++; setQueue(value); setState(queueStates[value][0]); setPage({ items: [], nextCursor: null }); }}><option value="fraud">Fraud review</option><option value="cashouts">Withdrawal review</option><option value="inbox">Failed source events</option><option value="outbox">Outgoing events</option></select></label><label className={styles.label}>State<select className={styles.select} disabled={busy} value={state} onChange={event => { queueGeneration.current++; setState(event.target.value); setPage({ items: [], nextCursor: null }); }}>{queueStates[queue].map(value => <option key={value}>{value}</option>)}</select></label>{queue === "inbox" && <label className={styles.label}>Authoritative source<select className={styles.select} value={source} disabled={busy} onChange={event => { setSource(event.target.value as typeof source); setPage({ items: [], nextCursor: null }); }}><option>auth</option><option>order</option><option>finance</option></select></label>}</div><div className={styles.actions}><button className={styles.secondary} disabled={disabled} onClick={() => void loadQueue()}>Load first page</button>{page.nextCursor && <button className={styles.secondary} disabled={disabled} onClick={() => void loadQueue(page.nextCursor)}>Next page</button>}</div>{page.items.length === 0 ? <p className={styles.empty}>No rows loaded for this selection. Load the queue to verify its current contents.</p> : <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Selected referral exception queue</caption><thead><tr><th>Reference</th><th>Status / type</th><th>Evidence</th><th>Select</th></tr></thead><tbody>{page.items.map((row, index) => { const rowId = String(row.id ?? row.event_id ?? index); return <tr key={rowId}><td><code>{rowId}</code></td><td>{String(row.status ?? "")}<small>{String(row.reason_code ?? row.event_type ?? "")}</small></td><td><pre className={styles.queueMeta}>{JSON.stringify(row, null, 2)}</pre></td><td><button className={styles.secondary} disabled={disabled || Boolean(pending)} onClick={() => { setTarget(rowId); setAction(queue === "fraud" ? "fraud-clear" : queue === "cashouts" ? "cashout-approve" : queue === "inbox" ? "inbox-replay" : "outbox-replay"); }}>Select record</button></td></tr>; })}</tbody></table></div>}<p className={styles.warning}>UNKNOWN payouts must be reconciled against the original attempt by Finance. Do not approve a new payment or mark them paid from this screen.</p></article>
        <article className={styles.card}><h2>Single-record, audited action</h2><form onSubmit={event => void review(event)}><fieldset disabled={busy || Boolean(pending)} style={{ border: 0, padding: 0, margin: 0 }}><label className={styles.label}>Action<select value={action} className={styles.select} onChange={event => setAction(event.target.value as Action)}><option value="fraud-clear">Clear a reviewed fraud case</option><option value="fraud-confirm">Confirm a fraud case</option><option value="cashout-approve">Approve a reserved withdrawal</option><option value="reward-reverse">Append a manual reward reversal</option><option value="inbox-replay">Replay a failed source event</option><option value="outbox-replay">Replay a failed outgoing event</option><option value="policy-approve">Approve a future policy revision</option></select></label><label className={styles.label}>Exact target reference<input className={styles.input} value={target} onChange={event => setTarget(event.target.value.trim())} required /></label>{action === "inbox-replay" && <label className={styles.label}>Source<select className={styles.select} value={source} onChange={event => setSource(event.target.value as typeof source)}><option>auth</option><option>order</option><option>finance</option></select></label>}{["cashout-approve", "reward-reverse"].includes(action) && <label className={styles.label}>{action === "cashout-approve" ? "Net cash payout (rupees)" : "Reversal amount (rupees)"}<input name="amount" className={styles.input} inputMode="decimal" required /></label>}{action === "cashout-approve" && <label className={styles.label}>Assessed withholding (rupees)<input name="withholding" className={styles.input} inputMode="decimal" required /></label>}{action === "policy-approve" ? <label className={styles.label}>Future effective time (your device’s time zone)<input name="effective" type="datetime-local" className={styles.input} required /></label> : <label className={styles.label}>{action === "reward-reverse" ? "Audited reason code (maximum 80 characters)" : "Review evidence reference"}<input name="evidence" className={styles.input} maxLength={action === "reward-reverse" ? 80 : 180} autoComplete="off" required /></label>}<label className={styles.label}>Type the exact target reference again to confirm<input name="confirm" className={styles.input} autoComplete="off" required /></label></fieldset>{pending && <p className={styles.warning}>Outcome not yet reconciled. The original intent and operation reference {pending.operationId} are retained. Retry only this same action.</p>}<div className={styles.actions}><button className={styles.danger} type="submit" disabled={busy || (!pending && disabled)}>{pending ? "Retry original action" : "Submit audited action"}</button></div></form></article></>}
      {tab === "audit" && <article className={styles.card}><h2>Append-only audit export</h2><p>Export at most 500 records at a time as newline-delimited JSON. The export itself is audited. Financial values and evidence references must be handled as internal data.</p><dl className={styles.details}><div><dt>Current cursor</dt><dd>{auditAfter}</dd></div><div><dt>More records reported</dt><dd>{auditMore ? "Yes / not yet checked" : "No at the last read"}</dd></div></dl><div className={styles.actions}><button className={styles.primary} disabled={disabled} onClick={() => void exportAudit()}><Download size={16} aria-hidden="true" />Export next audit page</button><button className={styles.secondary} disabled={busy} onClick={() => { setAuditAfter("0"); setAuditMore(true); }}>Reset cursor</button></div></article>}
      <footer className={styles.footer}>This workspace does not change runtime switches, call payment providers, alter selling-chef earnings or manufacture compliance evidence. Deployment and activation are separate release gates.</footer>
    </>}
  </section>;
}
