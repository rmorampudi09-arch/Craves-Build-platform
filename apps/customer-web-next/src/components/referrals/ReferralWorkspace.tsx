"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createReferralClient, ReferralApiError, type ReferralTransport } from "@/lib/referrals/client";
import { safeReferralLink, rupeesToPaise, type CashoutPage, type ReferralOverview, type RewardPage } from "@/lib/referrals/contracts";
import { withdrawalAttempts, type WithdrawalAttempt } from "@/lib/referrals/attempt-store";
import { createOperationGate, mayDiscardRejectedAttempt } from "@/lib/referrals/operation-safety";
import { ReferralMemberView } from "./ReferralMemberView";

export type ReferralWorkspaceProps = { accountId: string; transport?: ReferralTransport; publicOrigin?: string; brand?: ReactNode };
function message(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed."; }
// A verified account change destroys the entire old account's view and pending request state.
export function ReferralWorkspace(props: ReferralWorkspaceProps) { return <ReferralWorkspaceContent key={props.accountId} {...props} />; }
function ReferralWorkspaceContent({ accountId, transport, publicOrigin = "https://craves.in", brand }: ReferralWorkspaceProps) {
  const [operations] = useState(createOperationGate);
  const api = useMemo(() => createReferralClient(transport), [transport]);
  const [summary, setSummary] = useState<ReferralOverview | null>(null);
  const [rewards, setRewards] = useState<RewardPage>({ items: [], nextCursor: null });
  const [cashouts, setCashouts] = useState<CashoutPage>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true), [problem, setProblem] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [amount, setAmount] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<WithdrawalAttempt | null>(null), [recoveryReady, setRecoveryReady] = useState(false);
  const [now, setNow] = useState(0);
  const generation = useRef(0), abort = useRef<AbortController | null>(null), owner = useRef("");
  const invalidate = useCallback(() => { generation.current++; abort.current?.abort(); owner.current = ""; }, []);
  const load = useCallback(async () => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller; const current = ++generation.current;
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
    owner.current = accountId; setBusy(false); setRecoveryReady(false);
    try {
      const recovered = withdrawalAttempts(window.sessionStorage, accountId).read();
      setAttempt(recovered); setRecoveryReady(true);
      if (recovered) setNotice("An earlier withdrawal request is awaiting reconciliation. Only retry that original reference.");
    } catch (error) { setNotice(message(error)); }
    void load(); const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { invalidate(); window.clearInterval(timer); };
  }, [accountId, load, invalidate]);
  const fresh = Boolean(summary && now >= Date.parse(summary.asOf) - 30000 && now - Date.parse(summary.asOf) < 300000 && !problem && !loading);
  const active = fresh && !busy && recoveryReady;
  async function share(copyOnly = false) {
    if (!summary) return;
    try {
      const url = safeReferralLink(summary.code.link, publicOrigin, summary.code.code);
      if (!copyOnly && navigator.share) await navigator.share({ title: "Cook with Craves", text: "Explore the Craves referral programme. Rewards apply to qualifying delivered sales, not signups.", url });
      else await navigator.clipboard.writeText(url);
      if (owner.current === accountId) setNotice(copyOnly || !navigator.share ? "Your referral link was copied." : "Share sheet opened.");
    } catch { if (owner.current === accountId) setNotice("Sharing is unavailable. Select and copy the referral link below."); }
  }
  async function requestWithdrawal(event: FormEvent) {
    event.preventDefault(); if (!summary || busy || !recoveryReady || (!attempt && (!active || !summary.cashout.eligible || !confirmed))) return;
    if (!operations.enter()) return;
    const recovering = Boolean(attempt);
    setBusy(true); setNotice("");
    try {
      const operation = attempt ?? { id: crypto.randomUUID(), amountPaise: rupeesToPaise(amount) };
      if (BigInt(operation.amountPaise) <= BigInt(0)) throw new Error("Enter an amount greater than zero.");
      withdrawalAttempts(window.sessionStorage, accountId).save(operation); setAttempt(operation);
      const result = await api.cashout(operation.id, operation.amountPaise);
      if (owner.current !== accountId) return;
      withdrawalAttempts(window.sessionStorage, accountId).clear(); setAttempt(null); setAmount(""); setConfirmed(false);
      setNotice(`Withdrawal ${result.status.toLowerCase()}. A reservation is not a completed bank payment.`); await load();
    } catch (error) {
      if (owner.current !== accountId) return;
      if (error instanceof ReferralApiError && mayDiscardRejectedAttempt(recovering, error.status, error.uncertain)) {
        try { withdrawalAttempts(window.sessionStorage, accountId).clear(); setAttempt(null); } catch { setRecoveryReady(false); }
      }
      setNotice(message(error));
    } finally { operations.leave(); if (owner.current === accountId) setBusy(false); }
  }
  async function cancel(id: string) {
    if (!active || !operations.enter()) return; setBusy(true);
    try { await api.cancelCashout(id); if (owner.current !== accountId) return; setNotice("The reservation was released before submission."); await load(); }
    catch (error) { if (owner.current === accountId) setNotice(message(error)); }
    finally { operations.leave(); if (owner.current === accountId) setBusy(false); }
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
    finally { if (owner.current === accountId) setBusy(false); }
  }
  return <ReferralMemberView {...{ summary, rewards, cashouts, loading, problem, notice, busy, amount, confirmed, attempt, fresh, active, brand, setAmount, setConfirmed }} onRefresh={() => void load()} onShare={copy => void share(copy)} onWithdraw={requestWithdrawal} onCancel={id => void cancel(id)} onMore={kind => void more(kind)} />;
}
