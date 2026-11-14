"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";
import { deleteList, getList, removeDish, shareList, stopSharing, updateList } from "../api/food-lists";
import { DishLine, ListHeader, dishCount, outlineButton, quietButton, signInPath } from "../components/ListParts";
import { ListPaper } from "../components/ListPaper";
import { LIST_NAME_MAX, LIST_DESCRIPTION_MAX, listErrorText, type ListDetail } from "../lib/food-list-contract";
import { useSignedIn } from "../lib/use-signed-in";

type State = { kind: "loading" } | { kind: "ready"; list: ListDetail } | { kind: "failed"; code: string; status: number };
type Asking = null | "new-link" | "stop-sharing" | "delete";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** /lists/<id>: one of the person's lists. Share by link, stop sharing, rename, remove dishes, delete. */
export default function FoodListPage({ listId }: { listId: string }) {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  // A confirm step replaces the button that opened it, so move focus to its action, and back when it closes
  // (to the share heading while that button is busy or gone). The edit form does the same with its opener.
  const mainRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const asked = useRef<Asking>(null);
  useEffect(() => {
    if (asking) {
      asked.current = asking;
      confirmRef.current?.focus();
    } else if (asked.current) {
      const opener = mainRef.current?.querySelector<HTMLElement>(`[data-opens="${asked.current}"]:not(:disabled)`);
      (opener ?? mainRef.current?.querySelector<HTMLElement>("#share-heading"))?.focus();
      asked.current = null;
    }
  }, [asking]);
  const editButton = useRef<HTMLButtonElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) nameField.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  // Only the newest load may set the page, so a slow old answer never brings back a removed dish. A quiet load
  // (after a change that worked) keeps the page as it is when it fails, so a link shown once is not lost.
  const loads = useRef(0);
  const load = useCallback(
    (quiet = false) => {
      const turn = ++loads.current;
      void getList(listId).then((result) => {
        if (turn !== loads.current) return;
        if (result.ok) setState({ kind: "ready", list: result.data });
        else if (!quiet) setState({ kind: "failed", code: result.code, status: result.status });
      });
    },
    [listId],
  );
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  /** Runs one change; a list in the answer replaces the page's copy, anything else reloads it. */
  async function change(run: () => Promise<{ ok: true; data: unknown } | { ok: false; status: number; code: string }>, done?: string) {
    setBusy(true);
    setNotice(null);
    setAsking(null);
    const result = await run();
    setBusy(false);
    if (!result.ok) {
      setNotice({ kind: "error", text: listErrorText(result.code, result.status) });
      // The dish or the whole list is already gone: show what is there now.
      if (result.code === "LIST_ITEM_NOT_FOUND") load(true);
      else if (result.code === "LIST_NOT_FOUND") load();
      return false;
    }
    if (result.data && typeof result.data === "object" && "items" in result.data) {
      loads.current++; // a reload still on its way is older than this answer
      setState({ kind: "ready", list: result.data as ListDetail });
    } else load(true);
    if (done) setNotice({ kind: "ok", text: done });
    return true;
  }

  async function share() {
    setBusy(true);
    setNotice(null);
    setAsking(null);
    const result = await shareList(listId);
    setBusy(false);
    if (!result.ok) return setNotice({ kind: "error", text: listErrorText(result.code, result.status) });
    setNewLink(result.data.url);
    load(true);
  }

  async function removeList() {
    setBusy(true);
    setNotice(null);
    const result = await deleteList(listId);
    if (result.ok) return navigate({ to: "/lists" });
    setBusy(false);
    setAsking(null);
    setNotice({ kind: "error", text: listErrorText(result.code, result.status) });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ kind: "ok", text: "Link copied." });
    } catch {
      setNotice({ kind: "error", text: "Copy didn't work here. Select the link and copy it." });
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (await change(() => updateList(listId, name.trim(), note.trim()), "Saved.")) setEditing(false);
  }

  if (signedIn === false) {
    return (
      <main className="min-h-screen bg-white px-4 pb-16 pt-10">
        <EmptyState illustration="saved" heading="h1" title="Sign in to see this list" message="Food lists belong to the person who made them.">
          <Link to={signInPath(`/lists/${listId}`)} className={outlineButton}>
            Sign in
          </Link>
        </EmptyState>
      </main>
    );
  }

  return (
    <main ref={mainRef} className="min-h-screen bg-white pb-16">
      <ListHeader title="Food list" backTo="/lists" backLabel="Back to your food lists" />
      <div className="mx-auto max-w-2xl px-4 pt-5 md:px-6">
        {state.kind === "loading" ? (
          <p role="status" className="py-16 text-center text-[0.9375rem] text-[#6B6B6B]">
            Opening the list…
          </p>
        ) : null}

        {state.kind === "failed" ? (
          state.code === "LIST_NOT_FOUND" || state.code === "MALFORMED_REQUEST" ? (
            <EmptyState illustration="notFound" heading="h1" title="This list isn't here any more" message="It may have been deleted.">
              <Link to="/lists" className={outlineButton}>
                Your food lists
              </Link>
            </EmptyState>
          ) : (
            <EmptyState illustration="offline" heading="h1" role="alert" title="This list couldn't be opened" message={listErrorText(state.code, state.status)}>
              <button type="button" className={outlineButton} onClick={() => load()}>
                Try again
              </button>
            </EmptyState>
          )
        ) : null}

        {state.kind === "ready" ? (
          <>
            {editing ? (
              <form onSubmit={(event) => void save(event)} className="rounded-2xl border border-[#E5E7EB] p-4 md:p-5">
                <h1 className="text-lg font-black text-[#1A1A1A]">Edit the list</h1>
                <label htmlFor="edit-name" className="mt-3 block text-sm font-bold text-[#1A1A1A]">
                  Name
                </label>
                <input ref={nameField} id="edit-name" value={name} maxLength={LIST_NAME_MAX} required onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#D1D5DB] px-3 text-base focus-visible:outline-2 focus-visible:outline-[#1A1A1A]" />
                <label htmlFor="edit-note" className="mt-3 block text-sm font-bold text-[#1A1A1A]">
                  Note <span className="font-normal text-[#6B6B6B]">(optional)</span>
                </label>
                <textarea id="edit-note" value={note} maxLength={LIST_DESCRIPTION_MAX} rows={2} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-[#1A1A1A]" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="submit" className={outlineButton} disabled={busy || !name.trim()}>
                    Save
                  </button>
                  <button type="button" className={quietButton} onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <ListPaper title={state.list.name} note={state.list.description}>
                {state.list.items.length ? (
                  state.list.items.map((item) => (
                    <DishLine
                      key={item.menuItemId}
                      item={item}
                      linked
                      action={
                        <button type="button" className={quietButton} disabled={busy} aria-label={`Remove ${item.itemName} from the list`} onClick={() => void change(() => removeDish(listId, item.menuItemId), `${item.itemName} removed.`)}>
                          Remove
                        </button>
                      }
                    />
                  ))
                ) : (
                  <p className="py-3 text-[0.9375rem] text-[#4A4A4A]">
                    No dishes yet. Open a dish and choose “Save to a list”.{" "}
                    <Link to="/home" className="font-semibold text-[#C92716] underline underline-offset-4">
                      Browse dishes
                    </Link>
                  </p>
                )}
              </ListPaper>
            )}
            <p className="mt-3 text-sm text-[#6B6B6B]">{dishCount(state.list.itemCount)}</p>

            {notice ? (
              <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 text-sm font-semibold ${notice.kind === "error" ? "text-[#C4200F]" : "text-[#1A1A1A]"}`}>
                {notice.text}
              </p>
            ) : null}

            <section aria-labelledby="share-heading" className="mt-8 rounded-2xl border border-[#E5E7EB] p-4 md:p-5">
              <h2 id="share-heading" tabIndex={-1} className="text-lg font-black text-[#1A1A1A]">
                Share by link
              </h2>
              {newLink ? (
                <div className="mt-2">
                  <p className="text-[0.9375rem] text-[#4A4A4A]">Copy this link now. Craves shows it only once.</p>
                  <input readOnly value={newLink} aria-label="Share link" onFocus={(event) => event.currentTarget.select()} className="mt-2 min-h-11 w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-3 text-[0.9375rem]" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={outlineButton} onClick={() => void copy(newLink)}>
                      Copy link
                    </button>
                    {typeof navigator !== "undefined" && "share" in navigator ? (
                      <button type="button" className={outlineButton} onClick={() => void navigator.share({ title: state.list.name, url: newLink }).catch(() => undefined)}>
                        Share
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : state.list.share ? (
                <p className="mt-2 text-[0.9375rem] text-[#4A4A4A]">Shared by link since {day(state.list.share.createdAt)}. Anyone with the link sees the list’s name, note and dishes with their notes, but not your name or your orders.</p>
              ) : (
                <p className="mt-2 text-[0.9375rem] text-[#4A4A4A]">Anyone with the link sees the list’s name, note and dishes with their notes, but not your name or your orders.</p>
              )}

              {asking === "new-link" || asking === "stop-sharing" ? (
                <div role="group" aria-label="Confirm" className="mt-3 rounded-xl bg-[#F1F3F5] p-3">
                  <p id="confirm-share" className="text-[0.9375rem] text-[#1A1A1A]">{asking === "new-link" ? "The link you sent before will stop working. Make a new link?" : "The link will stop working at once. Stop sharing?"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button ref={confirmRef} aria-describedby="confirm-share" type="button" className={outlineButton} disabled={busy} onClick={() => void (asking === "new-link" ? share() : change(() => stopSharing(listId), "Sharing stopped.").then((stopped) => stopped && setNewLink(null)))}>
                      {asking === "new-link" ? "Make a new link" : "Stop sharing"}
                    </button>
                    <button type="button" className={quietButton} onClick={() => setAsking(null)}>
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {state.list.share || newLink ? (
                    <>
                      <button type="button" data-opens="new-link" className={outlineButton} disabled={busy} onClick={() => setAsking("new-link")}>
                        New link
                      </button>
                      <button type="button" data-opens="stop-sharing" className={quietButton} disabled={busy} onClick={() => setAsking("stop-sharing")}>
                        Stop sharing
                      </button>
                    </>
                  ) : (
                    <button type="button" className={outlineButton} disabled={busy} onClick={() => void share()}>
                      Share link
                    </button>
                  )}
                </div>
              )}
            </section>

            <div className="mt-6 flex flex-wrap gap-2">
              {!editing ? (
                <button
                  ref={editButton}
                  type="button"
                  className={quietButton}
                  onClick={() => {
                    setName(state.list.name);
                    setNote(state.list.description ?? "");
                    setEditing(true);
                  }}
                >
                  Edit name and note
                </button>
              ) : null}
              {asking === "delete" ? (
                <span role="group" aria-label="Confirm delete" className="flex flex-wrap items-center gap-2">
                  <span id="confirm-delete" className="text-[0.9375rem] text-[#1A1A1A]">Delete this list for good?</span>
                  <button ref={confirmRef} aria-describedby="confirm-delete" type="button" className={outlineButton} disabled={busy} onClick={() => void removeList()}>
                    Delete
                  </button>
                  <button type="button" className={quietButton} onClick={() => setAsking(null)}>
                    Keep it
                  </button>
                </span>
              ) : (
                <button type="button" data-opens="delete" className={quietButton} onClick={() => setAsking("delete")}>
                  Delete list
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
