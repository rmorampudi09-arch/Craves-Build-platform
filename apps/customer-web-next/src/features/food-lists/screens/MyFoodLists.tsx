"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";
import { signInPath, useSignedIn } from "@/features/auth/lib/use-signed-in";
import { newAttemptKey } from "@/shared/lib/advanced-client";
import { BackHeader } from "@/shared/components/navigation/BackHeader";
import { outlineButton } from "@/shared/ui/buttons/pill-buttons";
import { createList, myLists } from "../api/food-lists";
import { dishCount } from "../components/ListParts";
import { ListPaper, inkClass, listRowClass } from "../components/ListPaper";
import { LIST_NAME_MAX, LIST_DESCRIPTION_MAX, listErrorText, type ListSummary } from "../lib/food-list-contract";

type State = { kind: "loading" } | { kind: "ready"; lists: ListSummary[] } | { kind: "failed"; code: string; status: number };

/** /lists: the person's food lists, and a form to start one. */
export default function MyFoodLists() {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per attempt: a retry of the same name and note reuses it, so the service never makes two lists.
  const attempt = useRef("");

  const load = useCallback(() => {
    setState({ kind: "loading" });
    void myLists().then((result) => setState(result.ok ? { kind: "ready", lists: result.data } : { kind: "failed", code: result.code, status: result.status }));
  }, []);
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  async function make(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    attempt.current ||= newAttemptKey();
    const result = await createList(name.trim(), note.trim(), attempt.current);
    if (result.ok) return navigate({ to: `/lists/${result.data.id}` });
    setBusy(false);
    setError(listErrorText(result.code, result.status));
  }

  const edited = () => {
    attempt.current = "";
  };

  return (
    <main className="min-h-screen bg-white pb-16">
      <BackHeader title="Food lists" backTo="/profile" backLabel="Back to profile" />
      <div className="mx-auto max-w-2xl px-4 pt-5 md:px-6">
        {signedIn === false ? (
          <EmptyState illustration="saved" heading="h1" title="Sign in to keep food lists" message="Keep the dishes you love in lists, and share a list with family by link.">
            <Link to={signInPath("/lists")} className={outlineButton}>
              Sign in
            </Link>
          </EmptyState>
        ) : (
          <>
            <h1 className="text-2xl font-black text-[#1A1A1A]">Food lists</h1>
            <p className="mt-1 text-[0.9375rem] text-[#6B6B6B]">Dishes you keep and share.</p>

            {state.kind === "loading" ? (
              <p role="status" className="py-10 text-center text-[0.9375rem] text-[#6B6B6B]">
                Opening your lists…
              </p>
            ) : null}
            {state.kind === "failed" ? (
              <div role="alert" className="mt-6 rounded-2xl bg-[#F1F3F5] p-4 text-[0.9375rem] text-[#1A1A1A]">
                <p>{listErrorText(state.code, state.status)}</p>
                <button type="button" className={`${outlineButton} mt-3`} onClick={load}>
                  Try again
                </button>
              </div>
            ) : null}
            {state.kind === "ready" && state.lists.length === 0 ? (
              <p className="mt-6 text-[0.9375rem] text-[#4A4A4A]">No lists yet. Start one below, or open any dish and choose “Save to a list”.</p>
            ) : null}
            {state.kind === "ready" && state.lists.length ? (
              <ul className="mt-6 grid gap-4" aria-label="Your food lists">
                {state.lists.map((list) => (
                  <li key={list.id}>
                    <Link to={`/lists/${list.id}`} className="block rounded-[1.25rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A1A1A]">
                      <ListPaper title={list.name} note={list.description} headingLevel="h2">
                        <p className={listRowClass}>
                          <span className="flex-1 text-[0.9375rem] text-[#4A4A4A]">{dishCount(list.itemCount)}</span>
                          {list.shared ? <span className={`text-[0.875rem] font-semibold ${inkClass}`}>Shared by link</span> : null}
                        </p>
                      </ListPaper>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            <form onSubmit={(event) => void make(event)} className="mt-8 rounded-2xl border border-[#E5E7EB] p-4 md:p-5">
              <h2 className="text-lg font-black text-[#1A1A1A]">Start a list</h2>
              <label htmlFor="list-name" className="mt-3 block text-sm font-bold text-[#1A1A1A]">
                Name
              </label>
              <input
                id="list-name"
                value={name}
                maxLength={LIST_NAME_MAX}
                required
                onChange={(event) => {
                  setName(event.target.value);
                  edited();
                }}
                placeholder="Sunday lunch"
                className="mt-1 min-h-11 w-full rounded-xl border border-[#D1D5DB] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1A1A1A]"
              />
              <label htmlFor="list-note" className="mt-3 block text-sm font-bold text-[#1A1A1A]">
                Note <span className="font-normal text-[#6B6B6B]">(optional)</span>
              </label>
              <textarea
                id="list-note"
                value={note}
                maxLength={LIST_DESCRIPTION_MAX}
                rows={2}
                onChange={(event) => {
                  setNote(event.target.value);
                  edited();
                }}
                placeholder="For when Amma visits"
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1A1A1A]"
              />
              <button type="submit" className={`${outlineButton} mt-3`} disabled={busy || !name.trim() || signedIn !== true}>
                {busy ? "Making the list…" : "Make the list"}
              </button>
              {error ? (
                <p role="alert" className="mt-3 text-sm font-semibold text-[#C4200F]">
                  {error}
                </p>
              ) : null}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
