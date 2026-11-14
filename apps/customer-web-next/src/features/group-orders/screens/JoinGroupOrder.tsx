"use client";

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { signInPath, useSignedIn } from "@/features/auth/lib/use-signed-in";
import { BackHeader } from "@/shared/components/navigation/BackHeader";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";
import { outlineButton } from "@/shared/ui/buttons/pill-buttons";
import { joinGroup } from "../api/group-orders";
import { GROUP_NAME_MAX, groupErrorText } from "../lib/group-order-contract";

// Answers that mean this link can't be used now; anything else can be tried again.
const DEAD: Record<string, string> = {
  GROUP_NOT_FOUND: "This group order isn't here",
  GROUP_CLOSED: "This group order is closed",
  GROUP_FULL: "This group order is full",
  REMOVED_FROM_GROUP: "You were removed from this group order",
};

/** craves.in/g/<code>: join a group order. Joining shows your name to the group, so it is never automatic. */
export default function JoinGroupOrder({ code }: { code: string }) {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ code: string; status: number } | null>(null);

  async function join(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await joinGroup(code, name.trim());
    if (result.ok) return navigate({ to: `/group-orders/${result.data.id}` });
    setBusy(false);
    if (result.status === 401) return navigate({ to: signInPath(`/g/${code}`) });
    setFailure({ code: result.code, status: result.status });
  }

  const dead = failure && DEAD[failure.code] ? failure : null;
  return (
    <main className="min-h-screen bg-white pb-16">
      <BackHeader title="Group order" backTo={signedIn ? "/group-orders" : "/"} backLabel={signedIn ? "Back to your group orders" : "Back to Craves"} />
      <div className="mx-auto max-w-md px-4 pt-8 md:px-6">
        {dead ? (
          <EmptyState illustration="notFound" heading="h1" title={DEAD[dead.code]} message={groupErrorText(dead.code, dead.status)}>
            <Link to="/group-orders" className={outlineButton}>
              Your group orders
            </Link>
          </EmptyState>
        ) : (
          <>
            <h1 className="text-2xl font-black text-[#1A1A1A]">You&apos;re invited to a group order</h1>
            <p className="mt-2 text-[0.9375rem] leading-6 text-[#4A4A4A]">
              Code <strong className="font-bold tracking-wide text-[#1A1A1A]">{code}</strong>. Everyone adds their own dishes from one kitchen, and the host pays for the whole order.
            </p>
            {signedIn === false ? (
              <Link to={signInPath(`/g/${code}`)} className={`${outlineButton} mt-6`}>
                Sign in to join
              </Link>
            ) : (
              <form onSubmit={(event) => void join(event)} className="mt-6 grid gap-2">
                <label htmlFor="join-name" className="text-sm font-bold text-[#1A1A1A]">
                  Your name for the group <span className="font-normal text-[#6B6B6B]">(optional)</span>
                </label>
                <input
                  id="join-name"
                  value={name}
                  maxLength={GROUP_NAME_MAX}
                  placeholder="Guest"
                  aria-describedby="join-help"
                  onChange={(event) => setName(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[#D1D5DB] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1A1A1A]"
                />
                <p id="join-help" className="text-sm text-[#6B6B6B]">
                  The group sees this name and your dishes. Already in this group? Join opens it.
                </p>
                <button type="submit" className={`${outlineButton} mt-2`} disabled={busy || signedIn !== true}>
                  {busy ? "Joining…" : "Join"}
                </button>
                {failure ? (
                  <p role="alert" className="text-sm font-semibold text-[#C4200F]">
                    {groupErrorText(failure.code, failure.status)}
                  </p>
                ) : null}
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
