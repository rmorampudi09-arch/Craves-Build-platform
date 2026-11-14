"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { signInPath, useSignedIn } from "@/features/auth/lib/use-signed-in";
import { BackHeader } from "@/shared/components/navigation/BackHeader";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";
import { outlineButton } from "@/shared/ui/buttons/pill-buttons";
import { myGroups } from "../api/group-orders";
import { groupErrorText, joinCodeFrom, joinDeadline, type GroupStatus, type GroupSummary } from "../lib/group-order-contract";

type State = { kind: "loading" } | { kind: "ready"; groups: GroupSummary[] } | { kind: "failed"; code: string; status: number };

const STATUS: Record<GroupStatus, string> = { OPEN: "Open", LOCKED: "Locked", CHECKED_OUT: "Sent to the host's cart", CANCELLED: "Cancelled" };

/** /group-orders: the person's group orders (hosted or joined), and joining with a code read out by a friend. */
export default function MyGroupOrders() {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ kind: "loading" });
    void myGroups().then((result) => setState(result.ok ? { kind: "ready", groups: result.data } : { kind: "failed", code: result.code, status: result.status }));
  }, []);
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  function openCode(event: FormEvent) {
    event.preventDefault();
    const joinCode = joinCodeFrom(code);
    if (!joinCode) return setCodeError("Check the code: 8 letters and numbers, like ABCD-EFGH.");
    navigate({ to: `/g/${joinCode}` });
  }

  return (
    <main className="min-h-screen bg-white pb-16">
      <BackHeader title="Group orders" backTo="/profile" backLabel="Back to profile" />
      <div className="mx-auto max-w-2xl px-4 pt-5 md:px-6">
        {signedIn === false ? (
          <EmptyState illustration="saved" heading="h1" title="Sign in to order with friends" message="Start a group order from any kitchen, and everyone adds their own dishes.">
            <Link to={signInPath("/group-orders")} className={outlineButton}>
              Sign in
            </Link>
          </EmptyState>
        ) : (
          <>
            <h1 className="text-2xl font-black text-[#1A1A1A]">Group orders</h1>
            <p className="mt-1 text-[0.9375rem] text-[#6B6B6B]">Order from one kitchen together. The host pays once.</p>

            {state.kind === "loading" ? (
              <p role="status" className="py-10 text-center text-[0.9375rem] text-[#6B6B6B]">
                Opening your group orders…
              </p>
            ) : null}
            {state.kind === "failed" ? (
              <div role="alert" className="mt-6 rounded-2xl bg-[#F1F3F5] p-4 text-[0.9375rem] text-[#1A1A1A]">
                <p>{groupErrorText(state.code, state.status)}</p>
                <button type="button" className={`${outlineButton} mt-3`} onClick={load}>
                  Try again
                </button>
              </div>
            ) : null}
            {state.kind === "ready" && state.groups.length === 0 ? (
              <p className="mt-6 text-[0.9375rem] text-[#4A4A4A]">No group orders yet. Open any kitchen and choose “Start a group order”, or join with a code below.</p>
            ) : null}
            {state.kind === "ready" && state.groups.length ? (
              <ul className="mt-6 grid gap-3" aria-label="Your group orders">
                {state.groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      to={`/group-orders/${group.id}`}
                      className="block rounded-2xl border border-[#E5E7EB] p-4 transition-colors hover:bg-[#F9FAFB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]"
                    >
                      <span className="block text-base font-bold text-[#1A1A1A]">{group.title}</span>
                      <span className="mt-1 block text-sm text-[#4A4A4A]">
                        {STATUS[group.status]}
                        {group.status === "OPEN" ? `, people can join until ${joinDeadline(group.joinUntil)}` : ""}. {group.youAreHost ? "You're the host." : "You joined."}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            <form onSubmit={openCode} className="mt-8 rounded-2xl border border-[#E5E7EB] p-4 md:p-5">
              <h2 className="text-lg font-black text-[#1A1A1A]">Join with a code</h2>
              <label htmlFor="join-code" className="mt-3 block text-sm font-bold text-[#1A1A1A]">
                Code from the host
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="join-code"
                  value={code}
                  maxLength={9}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ABCD-EFGH"
                  aria-describedby={codeError ? "join-code-error" : undefined}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setCodeError(null);
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#D1D5DB] px-3 text-base uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1A1A1A]"
                />
                <button type="submit" className={`${outlineButton} shrink-0`} disabled={!code.trim() || signedIn !== true}>
                  Open
                </button>
              </div>
              {codeError ? (
                <p id="join-code-error" role="alert" className="mt-2 text-sm font-semibold text-[#C4200F]">
                  {codeError}
                </p>
              ) : null}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
