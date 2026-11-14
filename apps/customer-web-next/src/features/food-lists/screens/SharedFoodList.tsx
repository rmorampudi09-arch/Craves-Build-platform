"use client";

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";
import { copySharedList, sharedList } from "../api/food-lists";
import { signInPath, useSignedIn } from "@/features/auth/lib/use-signed-in";
import { BackHeader } from "@/shared/components/navigation/BackHeader";
import { outlineButton } from "@/shared/ui/buttons/pill-buttons";
import { DishLine, dishCount } from "../components/ListParts";
import { ListPaper } from "../components/ListPaper";
import { listErrorText, type SharedList } from "../lib/food-list-contract";

type State = { kind: "loading" } | { kind: "ready"; list: SharedList } | { kind: "failed"; code: string; status: number };

/** craves.in/l/<token>: a list someone shared. Read once per visit, because the service counts each read as a view. */
export default function SharedFoodList({ token }: { token: string }) {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ kind: "loading" });
    void sharedList(token).then((result) => setState(result.ok ? { kind: "ready", list: result.data } : { kind: "failed", code: result.code, status: result.status }));
  }, [token]);
  useEffect(load, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await copySharedList(token);
    // Stay busy while leaving: copy has no idempotency key, so a second tap would make a second copy.
    if (result.ok) return navigate({ to: `/lists/${result.data.id}` });
    setSaving(false);
    if (result.status === 401) navigate({ to: signInPath(`/l/${token}`) });
    else setError(listErrorText(result.code, result.status));
  }

  return (
    <main className="min-h-screen bg-white pb-16">
      <BackHeader title="Shared list" backTo={signedIn ? "/lists" : "/"} backLabel={signedIn ? "Back to your food lists" : "Back to Craves"} />
      <div className="mx-auto max-w-2xl px-4 pt-5 md:px-6">
        {state.kind === "loading" ? (
          <p role="status" className="py-16 text-center text-[0.9375rem] text-[#6B6B6B]">
            Opening the list…
          </p>
        ) : null}

        {state.kind === "failed" ? (
          state.code === "SHARED_LIST_NOT_FOUND" ? (
            <EmptyState illustration="notFound" heading="h1" title="This list link has expired or was turned off" message="Ask the person who sent it for a new link.">
              <Link to="/home" className={outlineButton}>
                Browse kitchens
              </Link>
            </EmptyState>
          ) : (
            <EmptyState illustration="offline" heading="h1" role="alert" title="This list couldn't be opened" message={listErrorText(state.code, state.status)}>
              <button type="button" className={outlineButton} onClick={load}>
                Try again
              </button>
            </EmptyState>
          )
        ) : null}

        {state.kind === "ready" ? (
          <>
            <ListPaper title={state.list.name} note={state.list.description}>
              {state.list.items.length ? (
                state.list.items.map((item) => <DishLine key={item.menuItemId} item={item} linked={signedIn === true} />)
              ) : (
                <p className="py-3 text-[0.9375rem] text-[#6B6B6B]">This list has no dishes yet.</p>
              )}
            </ListPaper>
            <p className="mt-3 text-sm text-[#6B6B6B]">{dishCount(state.list.itemCount)}, shared with you on Craves.</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {signedIn === false ? (
                <Link to={signInPath(`/l/${token}`)} className={outlineButton}>
                  Sign in to order or save this list
                </Link>
              ) : (
                <button type="button" className={outlineButton} disabled={saving || signedIn === null} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save to my lists"}
                </button>
              )}
            </div>
            {signedIn ? <p className="mt-3 text-sm text-[#6B6B6B]">Open a dish to see it and order it.</p> : null}
            {error ? (
              <p role="alert" className="mt-3 text-sm font-semibold text-[#C4200F]">
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
