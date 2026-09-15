"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, Copy, Gift, RefreshCw, ShieldCheck, Users, Wallet } from "lucide-react";
import { createReferralClient, ReferralApiError, referralMessage, type ReferralTransport } from "@/lib/referrals/client";
import { formatPaise, formatReferralTime, rupeesToPaise, safeReferralLink, type CashoutPage, type ReferralOverview, type RewardPage } from "@/lib/referrals/contracts";
import styles from "./referrals.module.css";

export type ReferralWorkspaceProps = {
  accountId: string; // Required: the existing authenticated owner, also used to clear stale account data.
  transport?: ReferralTransport;
  publicOrigin?: string;
  brand?: ReactNode; // Reuse the existing Craves logo component; do not add a second logo asset.
};
function message(error: unknown) { return error instanceof Error ? error.message : "This request could not be completed."; }
function status(value: string) { return value.toLowerCase().replaceAll("_", " "); }
export function ReferralWorkspace({ accountId, transport, publicOrigin = "https://craves.in", brand }: ReferralWorkspaceProps) {
  const api = useMemo(() => createReferralClient(transport), [transport]);
  const [summary, setSummary] = useState<ReferralOverview | null>(null);
  const [rewards, setRewards] = useState<RewardPage>({ items: [], nextCursor: null });
  const [cashouts, setCashouts] = useState<CashoutPage>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true), [problem, setProblem] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [amount, setAmount] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; amountPaise: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0), abort = useRef<AbortController | null>(null);
  const owner = useRef(accountId); owner.current = accountId;

  const load = useCallback(async (clear = false) => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const current = ++generation.current;
    if (clear) { setSummary(null); setRewards({ items: [], nextCursor: null }); setCashouts({ items: [], nextCursor: null }); }
    setLoading(true); setProblem("");
    try {
      const [overview, rewardPage, cashoutPage] = await Promise.all([api.overview(controller.signal), api.rewards(null, controller.signal), api.cashouts(null, controller.signal)]);
      if (current !== generation.current) return;
      safeReferralLink(overview.code.link, publicOrigin, overview.code.code);
      setSummary(overview); setRewards(rewardPage); setCashouts(cashoutPage); setNow(Date.now());
    } catch (error) {
      if (current !== generation.current || controller.signal.aborted) return;
      if (error instanceof ReferralApiError && [401, 403].includes(error.status)) { setSummary(null); setRewards({ items: [], nextCursor: null }); setCashouts({ items: [], nextCursor: null }); }
      setProblem(message(error));
    } finally { if (current === generation.current) setLoading(false); }
  }, [api, publicOrigin]);
  useEffect(() => {
    setAttempt(null); setAmount(""); setConfirmed(false); setNotice(""); void load(true);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { generation.current++; abort.current?.abort(); window.clearInterval(timer); };
  }, [accountId, load]);
  const fresh = Boolean(summary && now - Date.parse(summary.asOf) < 300000 && !problem && !loading);
  const active = fresh && !busy;
  async function share(copyOnly = false) {
    if (!summary) return;
    try {
      const url = safeReferralLink(summary.code.link, publicOrigin, summary.code.code);
      if (!copyOnly && navigator.share) await navigator.share({ title: "Cook with Craves", text: "Explore the Craves referral programme. Rewards apply to qualifying delivered sales, not signups.", url });
      else await navigator.clipboard.writeText(url);
      setNotice(copyOnly || !navigator.share ? "Your referral link was copied." : "Share sheet opened.");
    } catch { setNotice("Sharing is unavailable. Select and copy the referral link below."); }
  }
  async function requestWithdrawal(event: FormEvent) {
    event.preventDefault(); if (!summary || busy || (!attempt && (!active || !summary.cashout.eligible || !confirmed))) return;
    const forOwner = accountId; setBusy(true); setNotice("");
    try {
      const operation = attempt ?? { id: crypto.randomUUID(), amountPaise: rupeesToPaise(amount) };
      if (BigInt(operation.amountPaise) <= BigInt(0)) throw new Error("Enter an amount greater than zero.");
      setAttempt(operation);
      const result = await api.cashout(operation.id, operation.amountPaise);
      if (owner.current !== forOwner) return;
      setAttempt(null); setAmount(""); setConfirmed(false); setNotice(`Withdrawal ${status(result.status)}. A reservation is not a completed bank payment.`); await load();
    } catch (error) {
      if (owner.current !== forOwner) return;
      if (!(error instanceof ReferralApiError) || !error.uncertain) setAttempt(null);
      setNotice(message(error));
    } finally { if (owner.current === forOwner) setBusy(false); }
  }
  async function cancel(id: string) {
    if (!active) return; const forOwner = accountId; setBusy(true);
    try { await api.cancelCashout(id); if (owner.current !== forOwner) return; setNotice("The reservation was released before submission."); await load(); }
    catch (error) { if (owner.current === forOwner) setNotice(message(error)); }
    finally { if (owner.current === forOwner) setBusy(false); }
  }
  async function more(kind: "rewards" | "cashouts") {
    if (busy) return; const current = generation.current; setBusy(true);
    try {
      if (kind === "rewards" && rewards.nextCursor) {
        const page = await api.rewards(rewards.nextCursor);
        if (current === generation.current) setRewards(old => ({ items: [...old.items, ...page.items.filter(item => !old.items.some(existing => existing.id === item.id))], nextCursor: page.nextCursor }));
      } else if (kind === "cashouts" && cashouts.nextCursor) {
        const page = await api.cashouts(cashouts.nextCursor);
        if (current === generation.current) setCashouts(old => ({ items: [...old.items, ...page.items.filter(item => !old.items.some(existing => existing.id === item.id))], nextCursor: page.nextCursor }));
      }
    } catch (error) { if (current === generation.current) setNotice(message(error)); }
    finally { if (current === generation.current) setBusy(false); }
  }

  return <section className={styles.workspace} aria-labelledby="referral-title">
    <header className={styles.hero}>
      <div>{brand}<p className={styles.eyebrow}>CRAVES · REFERRAL REWARDS</p><h1 id="referral-title">Good food. Great connections.</h1><p>Invite people to Craves. Earn from qualifying delivered sales, never from signing someone up.</p></div>
      <div className={styles.heroMark} aria-hidden="true"><Gift size={42} /></div>
    </header>
    <div className={styles.toolbar}><span><ShieldCheck size={16} aria-hidden="true" /> Funded by Craves, not deducted from the selling chef’s earnings</span><button className={styles.secondary} onClick={() => void load()} disabled={loading || busy}><RefreshCw size={16} aria-hidden="true" />{loading ? "Refreshing…" : "Refresh"}</button></div>
    {problem && <div role="alert" className={styles.error}>{problem}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    {loading && !summary && <div className={styles.empty} role="status">Loading your verified referral balances…</div>}
    {!loading && !summary && !problem && <div className={styles.empty}>Your referral account is not available yet.</div>}
    {summary && <>
      {!fresh && !loading && <div className={styles.warning}>These values are not current. Refresh before making a financial request.</div>}
      {summary.onReviewHold && <div className={styles.warning}>Your account is under review. Held rewards cannot be withdrawn or spent. Existing history remains visible.</div>}
      <div className={styles.metrics}>
        <article className={styles.metric}><span><Wallet size={18} aria-hidden="true" />Available rewards</span><strong>{formatPaise(summary.availablePaise)}</strong><small>{BigInt(summary.availablePaise) < BigInt(0) ? "A refund clawback has created a recoverable balance." : "After holds and applicable reviews"}</small></article>
        <article className={styles.metric}><span>Pending rewards</span><strong>{formatPaise(summary.pendingPaise)}</strong><small>{summary.policy ? `${summary.policy.holdDays}-day hold, followed by financial verification` : "Awaiting an active programme policy"}</small></article>
        <article className={styles.metric}><span>Reserved rewards</span><strong>{formatPaise(summary.reservedPaise)}</strong><small>Withdrawals or checkout reservations in progress</small></article>
      </div>
      <p className={styles.asOf}>Balance updated {formatReferralTime(summary.balanceUpdatedAt)} · Retrieved {formatReferralTime(summary.asOf)}</p>
      <div className={styles.columns}>
        <article className={styles.card}>
          <div className={styles.cardHeading}><div><p className={styles.eyebrow}>YOUR INVITATION</p><h2>Share a place at the table.</h2></div><ArrowUpRight size={24} aria-hidden="true" /></div>
          <div className={styles.shareGrid}><div><label className={styles.label} htmlFor="referral-code">Your unique code</label><input id="referral-code" readOnly className={styles.code} value={summary.code.code} /><label className={styles.label} htmlFor="referral-link">Personal referral link</label><input id="referral-link" className={styles.input} readOnly value={summary.code.link} /><div className={styles.actions}><button className={styles.primary} onClick={() => void share()}><ArrowUpRight size={16} aria-hidden="true" />Share invitation</button><button className={styles.secondary} onClick={() => void share(true)}><Copy size={16} aria-hidden="true" />Copy link</button></div></div><div className={styles.qr}><Image unoptimized src="/api/referrals/me/code/qr" width={144} height={144} alt="Your personal Craves referral QR code" /><small>Scan to open your invitation</small></div></div>
          <p className={styles.muted}>Attribution is fixed when a new account is created. Sharing does not generate a reward by itself.</p>
        </article>
        <article className={styles.card}><p className={styles.eyebrow}>THREE GENERATIONS</p><h2>A clear, equal earning window.</h2><div className={styles.levels}>{summary.levels.map(level => <div key={level.level}><span className={styles.levelNumber}>{level.level}</span><div><strong>{level.level === 1 ? "Direct invitations" : `Generation ${level.level}`}</strong><small>{summary.policy ? `${summary.policy.ratesBps[level.level - 1] / 100}% of qualifying food subtotal` : "No active rate"}</small></div><b>{formatPaise(level.netEarnedPaise)}</b></div>)}</div><p className={styles.muted}>Only the selling chef’s three ancestors share the percentage reward. Unused shares stay with Craves.</p></article>
      </div>
      <article className={styles.card}><div className={styles.cardHeading}><h2><Users size={20} aria-hidden="true" /> Your referral network</h2><span className={styles.badge}>Privacy protected</span></div><div className={styles.network}>{[1, 2, 3].map(level => <div key={level}><strong>{summary.downline.find(item => item.level === level)?.members ?? "0"}</strong><span>Generation {level}</span></div>)}</div><p className={styles.muted}>These are account counts, not income forecasts. Network details are anonymised.</p></article>
      <div className={styles.columns}>
        <article className={styles.card}><h2>Programme rules</h2>{summary.policy ? <dl className={styles.details}><div><dt>Minimum qualifying food subtotal</dt><dd>{formatPaise(summary.policy.minimumPaise)}</dd></div><div><dt>Seller-chain maximum</dt><dd>{summary.policy.capBps / 100}%</dd></div><div><dt>First qualifying customer-order bonus</dt><dd>{formatPaise(summary.policy.customerBonusPaise)}</dd></div><div><dt>Invitee’s first-order discount</dt><dd>{formatPaise(summary.policy.inviteeDiscountPaise)}</dd></div><div><dt>Active policy revision</dt><dd>{summary.policy.revision}</dd></div></dl> : <p className={styles.warning}>No programme policy is active. Do not promise a rate or reward to invitees.</p>}<p className={styles.muted}>Customer bonuses and discounts use a separate marketing budget, outside the seller-chain cap. Taxes, delivery, tips and post-subtotal discounts are not the reward basis. Refunds can reverse rewards, including those already credited.</p></article>
        <article className={styles.card}><h2>Request a withdrawal</h2><p className={styles.muted}>Minimum {formatPaise(summary.cashout.minimumPaise)}. Eligibility, recipient checks and the approved finance policy are verified again by the server.</p>{!summary.cashout.eligible && <p className={styles.warning}>{referralMessage(summary.cashout.reason)}</p>}
          <form onSubmit={event => void requestWithdrawal(event)}><label className={styles.label} htmlFor="withdrawal-amount">Amount in rupees</label><input id="withdrawal-amount" className={styles.input} inputMode="decimal" placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy || Boolean(attempt) || !summary.cashout.eligible} required /><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy || Boolean(attempt)} />I understand this reserves rewards for review; it does not instantly send money.</label>{attempt && <p className={styles.warning}>Pending request reference: <code>{attempt.id}</code>. Retry this same request rather than creating another one.</p>}<button className={styles.primary} type="submit" disabled={busy || (!attempt && (!active || !summary.cashout.eligible || !confirmed))}><Check size={16} aria-hidden="true" />{busy ? "Checking…" : attempt ? "Retry the same request" : "Reserve withdrawal"}</button></form>
          <p className={styles.muted}>{summary.spendingEnabled ? "Wallet-spend eligibility is enabled. Checkout must separately validate and reserve the amount." : "Spending rewards at checkout is not currently enabled."}</p>
        </article>
      </div>
      <article className={styles.card}><h2>Reward history</h2>{rewards.items.length === 0 ? <p className={styles.empty}>No rewards yet. Qualifying delivered orders will appear here with their hold date.</p> : <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Your referral reward history</caption><thead><tr><th>Track</th><th>Created</th><th>Hold ends</th><th>Net reward</th><th>Status</th></tr></thead><tbody>{rewards.items.map(reward => <tr key={reward.id}><td>{reward.track === "UPLINE" ? `Chef · level ${reward.level}` : "Customer bonus"}<small>{reward.id}</small></td><td>{formatReferralTime(reward.createdAt)}</td><td>{formatReferralTime(reward.holdUntil)}</td><td>{formatPaise(reward.netPaise)}{reward.reversedPaise !== "0" && <small>{formatPaise(reward.reversedPaise)} reversed</small>}</td><td><span className={styles.badge}>{status(reward.status)}</span></td></tr>)}</tbody></table></div>}{rewards.nextCursor && <button className={styles.secondary} disabled={busy} onClick={() => void more("rewards")}>Load more rewards</button>}</article>
      <article className={styles.card}><h2>Withdrawal history</h2>{cashouts.items.length === 0 ? <p className={styles.empty}>No withdrawal requests have been made.</p> : <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Your withdrawal requests</caption><thead><tr><th>Reference</th><th>Requested</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{cashouts.items.map(item => <tr key={item.id}><td><code>{item.id}</code></td><td>{formatReferralTime(item.requestedAt)}</td><td>{formatPaise(item.amountPaise)}</td><td><span className={styles.badge}>{status(item.status)}</span>{item.status === "UNKNOWN" && <small>Do not request a replacement payment.</small>}</td><td>{["RESERVED", "APPROVED"].includes(item.status) ? <button className={styles.secondary} disabled={!active} onClick={() => void cancel(item.id)}>Cancel reservation</button> : "—"}</td></tr>)}</tbody></table></div>}{cashouts.nextCursor && <button className={styles.secondary} disabled={busy} onClick={() => void more("cashouts")}>Load more withdrawals</button>}</article>
      <footer className={styles.footer}>Rewards depend on qualifying sales and programme terms. No earnings are guaranteed. A credited wallet balance may be reduced by a later refund.</footer>
    </>}
  </section>;
}
