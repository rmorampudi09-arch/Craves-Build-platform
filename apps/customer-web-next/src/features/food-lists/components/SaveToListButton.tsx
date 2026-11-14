"use client";

import { useRef, useState, type FormEvent } from "react";
import { ListPlus } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { getSession, loadSession } from "@/features/auth/api/cravesAuth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/overlays/dialog";
import { signInPath } from "@/features/auth/lib/use-signed-in";
import { newAttemptKey, type AdvancedResult } from "@/shared/lib/advanced-client";
import { outlineButton } from "@/shared/ui/buttons/pill-buttons";
import { createList, getList, myLists, saveDish } from "../api/food-lists";
import { LIST_NAME_MAX, listErrorText, type ListSummary } from "../lib/food-list-contract";
import { dishCount } from "./ListParts";

/** "Save to a list" on a dish page. Guests go to sign-in and come back to the dish. */
export function SaveToListButton({ menuItemId }: { menuItemId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // One key per new-list attempt: a retry with the same name reuses it, so the service never makes two lists.
  const attempt = useRef("");
  const opening = useRef(false);

  /** A 401 means the sign-in ended: go to sign-in and come back to this dish. */
  function failed(result: Extract<AdvancedResult<unknown>, { ok: false }>, prefix = "") {
    if (result.status === 401) {
      setOpen(false);
      return navigate({ to: signInPath(window.location.pathname) });
    }
    setMessage({ kind: "error", text: `${prefix}${listErrorText(result.code, result.status)}` });
  }

  async function openDialog() {
    if (opening.current) return;
    opening.current = true;
    try {
      const session = getSession() ?? (await loadSession().catch(() => null));
      if (!session) return navigate({ to: signInPath(window.location.pathname) });
      attempt.current = "";
      setName("");
      setMessage(null);
      setLists(null);
      setOpen(true);
      const result = await myLists();
      if (result.ok) setLists(result.data);
      else failed(result);
    } finally {
      opening.current = false;
    }
  }

  async function saveTo(list: ListSummary) {
    setBusy(true);
    setMessage(null);
    // Saving a dish that is already there would clear its note (the service's save sets the note), so check first.
    const current = await getList(list.id);
    if (!current.ok) {
      setBusy(false);
      return failed(current);
    }
    if (current.data.items.some((item) => item.menuItemId === menuItemId)) {
      setBusy(false);
      return setMessage({ kind: "ok", text: `Already in ${list.name}.` });
    }
    const result = await saveDish(list.id, menuItemId);
    setBusy(false);
    if (!result.ok) return failed(result);
    setLists((lists) => lists?.map((each) => (each.id === list.id ? { ...each, itemCount: result.data.itemCount } : each)) ?? lists);
    setMessage({ kind: "ok", text: `Saved to ${list.name}.` });
  }

  async function saveToNew(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    attempt.current ||= newAttemptKey();
    const made = await createList(name.trim(), "", attempt.current);
    if (!made.ok) {
      setBusy(false);
      return failed(made);
    }
    attempt.current = "";
    setName("");
    // Lists that never loaded stay unloaded, so the dialog never looks as if this were the only list.
    setLists((current) => current && [made.data, ...current.filter((list) => list.id !== made.data.id)]);
    const added = await saveDish(made.data.id, menuItemId);
    setBusy(false);
    if (!added.ok) return failed(added, "List made, but the dish couldn’t be added. ");
    setLists((lists) => lists?.map((each) => (each.id === made.data.id ? { ...each, itemCount: added.data.itemCount } : each)) ?? lists);
    setMessage({ kind: "ok", text: `Saved to ${made.data.name}.` });
  }

  return (
    <>
      <button type="button" className={`${outlineButton} mt-4 w-full`} onClick={() => void openDialog()}>
        <ListPlus className="h-4 w-4" aria-hidden="true" />
        Save to a list
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save to a list</DialogTitle>
            <DialogDescription>Keep this dish in a list. You can share a list by link.</DialogDescription>
          </DialogHeader>
          {lists === null && !message ? (
            <p role="status" className="text-[0.9375rem] text-[#6B6B6B]">
              Opening your lists…
            </p>
          ) : null}
          {lists?.length ? (
            <ul className="grid gap-2" aria-label="Your food lists">
              {lists.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveTo(list)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 text-left text-[0.9375rem] font-semibold text-[#1A1A1A] hover:bg-[#F9FAFB] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#1A1A1A]"
                  >
                    <span className="min-w-0 truncate">{list.name}</span>
                    <span className="shrink-0 text-sm font-normal text-[#6B6B6B]">{dishCount(list.itemCount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <form onSubmit={(event) => void saveToNew(event)} className="grid gap-2">
            <label htmlFor="new-list-name" className="text-sm font-bold text-[#1A1A1A]">
              {lists?.length ? "Or a new list" : "New list"}
            </label>
            <div className="flex gap-2">
              <input
                id="new-list-name"
                value={name}
                maxLength={LIST_NAME_MAX}
                onChange={(event) => {
                  setName(event.target.value);
                  attempt.current = "";
                }}
                placeholder="Sunday lunch"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#D1D5DB] px-3 text-base focus-visible:outline-2 focus-visible:outline-[#1A1A1A]"
              />
              <button type="submit" className={`${outlineButton} shrink-0`} disabled={busy || !name.trim()}>
                Save
              </button>
            </div>
          </form>
          {message ? (
            <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm font-semibold ${message.kind === "error" ? "text-[#C4200F]" : "text-[#1A1A1A]"}`}>
              {message.text}
            </p>
          ) : null}
          <Link to="/lists" className="text-sm font-semibold text-[#C92716] underline underline-offset-4">
            See your food lists
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
