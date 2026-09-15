"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { adminFetch } from "@/lib/admin-renewal";
import { createReferralClient, ReferralApiError, type ReferralTransport } from "@/lib/referrals/client";
import { approvalKeys, formatPaise, formatReferralTime, nonnegativePaiseSchema, policyDraftSchema, rupeesToPaise, uuidSchema, type AdminOverview, type PolicyPage, type QueuePage } from "@/lib/referrals/contracts";
import styles from "./referrals.module.css";

type Props = { accountId: string; transport?: ReferralTransport; brand?: ReactNode };
type Queue = "fraud" | "cashouts" | "outbox" | "inbox";
const intentSchema = z.object({ action: z.enum(["fraud-clear", "fraud-confirm", "cashout-approve", "reward-reverse", "inbox-replay", "outbox-replay", "policy-approve"]), target: z.string().min(1).max(64), evidence: z.string().max(180), amountPaise: nonnegativePaiseSchema, withholdingPaise: nonnegativePaiseSchema, source: z.enum(["auth", "order", "finance"]), operationId: uuidSchema, effectiveAt: z.string().max(40), expected: nonnegativePaiseSchema });
type Intent = z.infer<typeof intentSchema>;
type Action = Intent["action"];
const queueStates: Record<Queue, string[]> = { fraud: ["OPEN", "CLEARED", "CONFIRMED"], cashouts: ["UNKNOWN", "RESERVED", "APPROVED", "SUBMITTED", "PAID", "RELEASED"], outbox: ["DEAD", "PENDING", "LEASED", "ACKED"], inbox: ["DEAD"] };
const evidenceLabels: Record<typeof approvalKeys[number], string> = { legalReviewRef: "Legal opinion reference", termsVersion: "Accepted programme terms version", taxReviewRef: "Tax assessment reference", privacyReviewRef: "Privacy / consent review", fundingReviewRef: "Commission and marketing-budget review", multiChefDecisionRef: "Multi-chef allocation decision", payoutReviewRef: "Payout and KYC review" };
const text = (error: unknown) => error instanceof Error ? error.message : "The operation could not be completed.";
const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
export function ReferralAdminWorkspace(props: Props) { return <ReferralAdminContent key={props.accountId} {...props} />; }
function ReferralAdminContent({ accountId, transport = adminFetch, brand }: Props) {
  const api = useMemo(() => createReferralClient(transport), [transport]);
  const [overview, setOverview] = useState<AdminOverview | null>(null), [policies, setPolicies] = useState<PolicyPage | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [problem, setProblem] = useState(""), [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"overview" | "policy" | "review" | "audit">("overview");
  const [queue, setQueue] = useState<Queue>("fraud"), [state, setState] = useState("OPEN"), [source, setSource] = useState<"auth" | "order" | "finance">("order");
  const [page, setPage] = useState<QueuePage>({ items: [], nextCursor: null });
  const [action, setAction] = useState<Action>("fraud-clear"), [target, setTarget] = useState("");
  const [pending, setPending] = useState<Intent | null>(null), [recoveryReady, setRecoveryReady] = useState(false);
  const [auditAfter, setAuditAfter] = useState("0"), [auditMore, setAuditMore] = useState(true), [now, setNow] = useState(0);
  const abort = useRef<AbortController | null>(null), generation = useRef(0), queueGeneration = useRef(0), mounted = useRef(false);
  const storageKey = `craves:referral:admin-intent:v1:${accountId}`;
  const invalidate = useCallback(() => { generation.current++; queueGeneration.current++; abort.current?.abort(); mounted.current = false; }, []);
  const load = useCallback(async () => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller; const current = ++generation.current;
    setLoading(true); setProblem("");
    try {
      const [nextOverview, nextPolicies] = await Promise.all([api.adminOverview(controller.signal), api.policies(controller.signal)]);
      if (current !== generation.current) return;
      if (nextOverview.viewerId !== accountId) { setOverview(null); setPolicies(null); throw new Error("Administrator identity changed. Sign in again before reviewing financial data."); }
      setOverview(nextOverview); setPolicies(nextPolicies); setNow(Date.now());
    } catch (error) {
      if (current !== generation.current || controller.signal.aborted) return;
      if (error instanceof ReferralApiError && [401, 403].includes(error.status)) { setOverview(null); setPolicies(null); setPage({ items: [], nextCursor: null }); }
      setProblem(text(error));
    } finally { if (current === generation.current) setLoading(false); }
  }, [api, accountId]);
  useEffect(() => {
    mounted.current = true;
    try {
      uuidSchema.parse(accountId); const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        if (raw.length > 4096) throw new Error("Saved action exceeds the recovery limit.");
        const intent = intentSchema.parse(JSON.parse(raw)); setPending(intent); setAction(intent.action); setTarget(intent.target); setSource(intent.source); setTab("review");
        setNotice("An earlier administrative action needs reconciliation. Its original operation reference is retained.");
      }
      setRecoveryReady(true);
    } catch { setRecoveryReady(false); setNotice("Saved action could not be verified. Reconcile the audit trail before submitting another financial action."); }
    void load(); const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { invalidate(); window.clearInterval(timer); };
  }, [accountId, storageKey, load, invalidate]);
  const fresh = Boolean(overview && now >= Date.parse(overview.asOf) - 30000 && now - Date.parse(overview.asOf) < 300000);
  const disabled = busy || loading || Boolean(problem) || !overview || !fresh || !recoveryReady;
  async function loadQueue(cursor?: string | null) {
    const current = ++queueGeneration.current; setBusy(true); setNotice("");
    try {
      const result = queue === "inbox" ? await api.inbox(source, cursor) : await api.queue(queue, state, cursor);
      if (current !== queueGeneration.current || !mounted.current) return;
      setPage({ items: result.items, nextCursor: "nextCursor" in result ? result.nextCursor : result.nextId });
    } catch (error) { if (current === queueGeneration.current && mounted.current) setNotice(text(error)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!policies || disabled) return;
    const data = new FormData(event.currentTarget); setBusy(true); setNotice("");
    try {
      const draft = policyDraftSchema.parse({ expectedLatestRevision: policies.latestRevision, l1Bps: Number(field(data, "l1")), l2Bps: Number(field(data, "l2")), l3Bps: Number(field(data, "l3")), capBps: 400, holdDays: Number(field(data, "hold")), minimumPaise: rupeesToPaise(field(data, "minimum")), customerBonusPaise: rupeesToPaise(field(data, "bonus")), inviteeDiscountPaise: rupeesToPaise(field(data, "discount")), approvals: Object.fromEntries(approvalKeys.map(key => [key, field(data, key)])) });
      const result = await api.createPolicy(draft); if (!mounted.current) return;
      setNotice(`Draft revision ${result.revision} saved. A different administrator must approve it. Existing orders keep their original policy.`); await load();
    } catch (error) { if (mounted.current) { setNotice(`${text(error)} Refresh the revision list before another draft submission.`); await load(); } }
    finally { if (mounted.current) setBusy(false); }
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
    event.preventDefault(); if (busy || !policies || !recoveryReady) return;
    const data = new FormData(event.currentTarget); setBusy(true); setNotice("");
    try {
      if (!pending && (field(data, "confirm") !== target || disabled)) throw new Error("Refresh the current state and type the exact target reference to confirm.");
      const intent = pending ?? intentSchema.parse({ action, target, evidence: field(data, "evidence"), source, amountPaise: ["cashout-approve", "reward-reverse"].includes(action) ? rupeesToPaise(field(data, "amount")) : "0", withholdingPaise: action === "cashout-approve" ? rupeesToPaise(field(data, "withholding")) : "0", effectiveAt: action === "policy-approve" ? new Date(field(data, "effective")).toISOString() : "", expected: policies.latestActivatedRevision, operationId: crypto.randomUUID() });
      const encoded = JSON.stringify(intent); window.sessionStorage.setItem(storageKey, encoded);
      if (window.sessionStorage.getItem(storageKey) !== encoded) throw new Error("Recovery storage unavailable. No action was sent.");
      setPending(intent); await execute(intent); if (!mounted.current) return;
      window.sessionStorage.removeItem(storageKey); setPending(null); setTarget(""); setPage({ items: [], nextCursor: null });
      setNotice("The server accepted this action. Approval or replay does not prove a bank payment completed."); await load();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ReferralApiError && !error.uncertain) {
        try { window.sessionStorage.removeItem(storageKey); setPending(null); } catch { setRecoveryReady(false); }
      }
      setNotice(text(error));
    } finally { if (mounted.current) setBusy(false); }
  }
  async function exportAudit() {
    if (disabled) return; setBusy(true);
    try {
      const response = await transport(`/api/referrals/admin/audit/export?afterId=${auditAfter}&limit=500`, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/x-ndjson" } });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("application/x-ndjson")) throw new Error("The audited export could not be verified.");
      const next = response.headers.get("X-Next-Audit-Id"), more = response.headers.get("X-Has-More");
      if (!next || !/^\d{1,19}$/.test(next) || !["true", "false"].includes(more ?? "")) throw new Error("Missing export pagination evidence.");
      const blob = await response.blob(); if (!mounted.current) return;
      if (blob.size > 2097152) throw new Error("The export page exceeds the response limit.");
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `craves-referral-audit-after-${auditAfter}.ndjson`;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAuditAfter(next); setAuditMore(more === "true"); setNotice(`Exported one bounded page. Next ID: ${next}. Handle as internal audit data.`);
    } catch (error) { if (mounted.current) setNotice(text(error)); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section className={styles.workspace} aria-labelledby="referral-admin-title">
    <header className={styles.hero}><div>{brand}<p className={styles.eyebrow}>CRAVES · CONTROL CENTRE</p><h1 id="referral-admin-title">Referral operations</h1><p>Policy, reward liabilities and exception review. Every financial action is re-authorised by the referral service.</p></div><div className={styles.heroMark} aria-hidden="true"><ShieldCheck size={40} /></div></header>
    <div className={styles.toolbar}><span>No direct bank-payment or runtime-switch controls are exposed here.</span><button className={styles.secondary} onClick={() => void load()} disabled={loading || busy}><RefreshCw size={16} aria-hidden="true" />{loading ? "Refreshing…" : "Refresh verified state"}</button></div>
    {problem && <div className={styles.error} role="alert">{problem}</div>}{notice && <div className={styles.notice} role="status">{notice}</div>}
    {loading && !overview && <div className={styles.empty} role="status">Verifying administrator access and loading referral operations…</div>}
    {overview && <>
      <p className={styles.asOf}>As of {formatReferralTime(overview.asOf)}</p>{!fresh && <p className={styles.warning}>This snapshot is stale. Refresh before approving or reversing money.</p>}
      <nav className={styles.tabs} aria-label="Referral operations sections">{(["overview", "policy", "review", "audit"] as const).map(value => <button key={value} className={`${styles.secondary} ${value === tab ? styles.tabActive : ""}`} aria-pressed={value === tab} onClick={() => setTab(value)}>{value === "review" ? "Review & recovery" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</nav>
      {tab === "overview" && <><div className={styles.switches}>{Object.entries(overview.flags).map(([name, enabled]) => <span className={styles.badge} key={name}>{name}: {enabled ? "enabled" : "disabled"}</span>)}</div><div className={styles.metrics}>{([ ["Pending liability", overview.pendingPaise], ["Available balance", overview.availablePaise], ["Reserved funds", overview.reservedPaise] ] as const).map(([name, value]) => <article className={styles.metric} key={name}><span>{name}</span><strong>{formatPaise(value)}</strong></article>)}</div><div className={styles.statGrid} style={{ marginTop: 16 }}>{([ ["Enrolled members", overview.members], ["Open fraud cases", overview.fraudOpen], ["Failed inbound events", overview.inboxDead], ["Failed outbound events", overview.outboxDead], ["Uncertain transfers", overview.unknownCashouts], ["Wallet mismatches", overview.walletDriftCount] ] as const).map(([name, value]) => <article className={styles.metric} key={name}><span>{name}</span><strong>{value}</strong></article>)}</div>{overview.walletDriftCount !== "0" && <p className={styles.error}>Wallet reconciliation is not clean. Pause financial execution and investigate before releasing funds.</p>}<article className={styles.card} style={{ marginTop: 18 }}><h2>Separately funded marketing budgets</h2><dl className={styles.details}>{overview.budgets.map(budget => <div key={budget.track}><dt>{budget.track}</dt><dd>{formatPaise(budget.availablePaise)}</dd></div>)}</dl><p className={styles.muted}>Seller-chain rewards require order-specific commission funding. Customer bonuses and invitee discounts are outside the 4% cap.</p></article></>}
      {tab === "policy" && policies && <><article className={styles.card}><h2>Immutable policy revisions</h2><p className={styles.muted}>Active: {policies.activeRevision}. Latest: {policies.latestRevision}. Initial seed policy cannot be activated without real evidence and a second administrator.</p><div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Policy revisions</caption><thead><tr><th>Revision</th><th>Rates</th><th>Minimum / hold</th><th>State / time</th><th>Review</th></tr></thead><tbody>{policies.items.map(policy => <tr key={policy.revision}><td>{policy.revision}</td><td>{policy.ratesBps.map(rate => `${rate / 100}%`).join(" / ")}</td><td>{formatPaise(policy.minimumPaise)} · {policy.holdDays} days</td><td>{policy.state}<small>{policy.effectiveAt ? formatReferralTime(policy.effectiveAt) : "Not scheduled"}</small></td><td><button className={styles.secondary} disabled={disabled || Boolean(pending) || policy.state !== "DRAFT" || !policy.createdBy || policy.createdBy === overview.viewerId} onClick={() => { setAction("policy-approve"); setTarget(policy.revision); setTab("review"); }}>Review activation</button></td></tr>)}</tbody></table></div></article>
        <article className={styles.card}><h2>Create a future-order policy draft</h2><p className={styles.warning}>Evidence fields must reference real approvals. This form does not provide legal, tax, KYC or budget approval.</p><form onSubmit={event => void saveDraft(event)}><fieldset disabled={disabled || Boolean(pending)} style={{ border: 0, padding: 0, margin: 0 }}><div className={styles.formGrid}>{[ ["l1", "Level 1 (basis points)", "200"], ["l2", "Level 2 (basis points)", "120"], ["l3", "Level 3 (basis points)", "80"], ["hold", "Refund hold (days)", "14"], ["minimum", "Qualifying subtotal (rupees)", "800"], ["bonus", "Customer bonus (rupees)", "400"], ["discount", "Invitee discount (rupees)", "250"] ].map(([name, label, value]) => <label key={name} className={styles.label}>{label}<input className={styles.input} name={name} defaultValue={value} inputMode="decimal" required /></label>)}{approvalKeys.map(key => <label key={key} className={styles.label}>{evidenceLabels[key]}<input name={key} className={styles.input} maxLength={180} autoComplete="off" required /></label>)}</div><label className={styles.check}><input type="checkbox" required />These references identify reviewed evidence, not assumed approvals.</label><button className={styles.primary} type="submit">Save draft for second-person review</button></fieldset></form></article></>}
      {tab === "review" && <><article className={styles.card}><h2>Bounded exception queues</h2><div className={styles.formGrid}><label className={styles.label}>Queue<select className={styles.select} value={queue} disabled={busy} onChange={event => { const value = event.target.value as Queue; queueGeneration.current++; setQueue(value); setState(queueStates[value][0]); setPage({ items: [], nextCursor: null }); }}><option value="fraud">Fraud review</option><option value="cashouts">Withdrawal review</option><option value="inbox">Failed source events</option><option value="outbox">Outgoing events</option></select></label><label className={styles.label}>State<select className={styles.select} disabled={busy} value={state} onChange={event => { queueGeneration.current++; setState(event.target.value); setPage({ items: [], nextCursor: null }); }}>{queueStates[queue].map(value => <option key={value}>{value}</option>)}</select></label>{queue === "inbox" && <label className={styles.label}>Source<select className={styles.select} value={source} disabled={busy || Boolean(pending)} onChange={event => { setSource(event.target.value as typeof source); setPage({ items: [], nextCursor: null }); }}><option>auth</option><option>order</option><option>finance</option></select></label>}</div><div className={styles.actions}><button className={styles.secondary} disabled={disabled} onClick={() => void loadQueue()}>Load first page</button>{page.nextCursor && <button className={styles.secondary} disabled={disabled} onClick={() => void loadQueue(page.nextCursor)}>Next page</button>}</div>{page.items.length === 0 ? <p className={styles.empty}>No rows loaded for this selection. Load the queue to verify it.</p> : <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Exception queue</caption><thead><tr><th>Reference</th><th>Status / type</th><th>Evidence</th><th>Select</th></tr></thead><tbody>{page.items.map((row, index) => { const rowId = String(row.id ?? row.event_id ?? index); return <tr key={rowId}><td><code>{rowId}</code></td><td>{String(row.status ?? "")}<small>{String(row.reason_code ?? row.event_type ?? "")}</small></td><td><pre className={styles.queueMeta}>{JSON.stringify(row, null, 2)}</pre></td><td><button className={styles.secondary} disabled={disabled || Boolean(pending)} onClick={() => { setTarget(rowId); setAction(queue === "fraud" ? "fraud-clear" : queue === "cashouts" ? "cashout-approve" : queue === "inbox" ? "inbox-replay" : "outbox-replay"); }}>Select record</button></td></tr>; })}</tbody></table></div>}<p className={styles.warning}>UNKNOWN payouts must be reconciled with the original attempt by Finance. Never create a replacement or mark them paid here.</p></article>
        <article className={styles.card}><h2>Single-record, audited action</h2><form onSubmit={event => void review(event)}><fieldset disabled={busy || Boolean(pending)} style={{ border: 0, padding: 0, margin: 0 }}><label className={styles.label}>Action<select value={action} className={styles.select} onChange={event => setAction(event.target.value as Action)}><option value="fraud-clear">Clear reviewed fraud case</option><option value="fraud-confirm">Confirm fraud case</option><option value="cashout-approve">Approve reserved withdrawal</option><option value="reward-reverse">Append reward reversal</option><option value="inbox-replay">Replay failed source event</option><option value="outbox-replay">Replay outgoing event</option><option value="policy-approve">Approve future policy</option></select></label><label className={styles.label}>Exact target reference<input className={styles.input} value={target} onChange={event => setTarget(event.target.value.trim())} required /></label>{action === "inbox-replay" && <label className={styles.label}>Source<select className={styles.select} value={source} onChange={event => setSource(event.target.value as typeof source)}><option>auth</option><option>order</option><option>finance</option></select></label>}{["cashout-approve", "reward-reverse"].includes(action) && <label className={styles.label}>{action === "cashout-approve" ? "Net payout (rupees)" : "Reversal amount (rupees)"}<input name="amount" className={styles.input} inputMode="decimal" required /></label>}{action === "cashout-approve" && <label className={styles.label}>Assessed withholding (rupees)<input name="withholding" className={styles.input} inputMode="decimal" required /></label>}{action === "policy-approve" ? <label className={styles.label}>Future effective time (device time zone)<input name="effective" type="datetime-local" className={styles.input} required /></label> : <label className={styles.label}>{action === "reward-reverse" ? "Audited reason code" : "Review evidence reference"}<input name="evidence" className={styles.input} maxLength={action === "reward-reverse" ? 80 : 180} autoComplete="off" required /></label>}<label className={styles.label}>Type the target reference again<input name="confirm" className={styles.input} autoComplete="off" required /></label></fieldset>{pending && <p className={styles.warning}>Original action reference: {pending.operationId}. The intent is retained for same-tab reload recovery. Retry only this original action.</p>}<div className={styles.actions}><button className={styles.danger} type="submit" disabled={busy || !recoveryReady || (!pending && disabled)}>{pending ? "Retry original action" : "Submit audited action"}</button></div></form></article></>}
      {tab === "audit" && <article className={styles.card}><h2>Append-only audit export</h2><p>At most 500 records per page, newline-delimited JSON. Each export is audited. Protect amounts and evidence references as internal data.</p><dl className={styles.details}><div><dt>Cursor</dt><dd>{auditAfter}</dd></div><div><dt>More records reported</dt><dd>{auditMore ? "Yes / not checked" : "No at last read"}</dd></div></dl><div className={styles.actions}><button className={styles.primary} disabled={disabled} onClick={() => void exportAudit()}><Download size={16} aria-hidden="true" />Export next audit page</button><button className={styles.secondary} disabled={busy} onClick={() => { setAuditAfter("0"); setAuditMore(true); }}>Reset cursor</button></div></article>}
      <footer className={styles.footer}>No runtime flags, provider payments, selling-chef earnings or compliance evidence are changed automatically. After closing a tab, verify history before creating a replacement financial request.</footer>
    </>}
  </section>;
}
