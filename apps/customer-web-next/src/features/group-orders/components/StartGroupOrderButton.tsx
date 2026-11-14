"use client";

import { useRef, useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { loadSession } from "@/features/auth/api/cravesAuth";
import { signInPath } from "@/features/auth/lib/use-signed-in";
import { newAttemptKey } from "@/shared/lib/advanced-client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/overlays/dialog";
import { outlineButton } from "@/shared/ui/buttons/pill-buttons";
import { startGroup } from "../api/group-orders";
import { GROUP_NAME_MAX, GROUP_TITLE_MAX, groupErrorText } from "../lib/group-order-contract";

const WINDOWS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
] as const;

const field = "mt-1 min-h-11 w-full rounded-xl border border-[#D1D5DB] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1A1A1A]";

/** "Start a group order" on a kitchen page. The session is checked on tap, so the kitchen page renders without it. */
export function StartGroupOrderButton({ kitchenId, kitchenName }: { kitchenId: string; kitchenName: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per attempt: a retry with the same answers reuses it, so the service never starts two groups.
  const attempt = useRef("");
  const opening = useRef(false);
  const edited = () => {
    attempt.current = "";
  };

  async function openDialog() {
    if (opening.current) return;
    opening.current = true;
    try {
      const session = await loadSession().catch(() => null);
      if (!session) return navigate({ to: signInPath(window.location.pathname) });
      attempt.current = "";
      setTitle(`Order from ${kitchenName}`.slice(0, GROUP_TITLE_MAX));
      setMinutes(60);
      setName("");
      setError(null);
      setOpen(true);
    } finally {
      opening.current = false;
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    attempt.current ||= newAttemptKey();
    const result = await startGroup(kitchenId, title.trim(), minutes, name.trim(), attempt.current);
    if (result.ok) return navigate({ to: `/group-orders/${result.data.id}` });
    setBusy(false);
    if (result.status === 401) {
      setOpen(false);
      return navigate({ to: signInPath(window.location.pathname) });
    }
    setError(groupErrorText(result.code, result.status));
  }

  return (
    <>
      <button type="button" className={`${outlineButton} mt-4`} onClick={() => void openDialog()}>
        <Users className="h-4 w-4" aria-hidden="true" />
        Start a group order
      </button>
      <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a group order</DialogTitle>
            <DialogDescription>Friends join with a link and add their own dishes. You send everything to your cart and pay once.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void start(event)} className="grid gap-4">
            <div>
              <label htmlFor="group-title" className="text-sm font-bold text-[#1A1A1A]">
                Name of the group order
              </label>
              <input
                id="group-title"
                value={title}
                maxLength={GROUP_TITLE_MAX}
                required
                onChange={(event) => {
                  setTitle(event.target.value);
                  edited();
                }}
                className={field}
              />
            </div>
            <fieldset>
              <legend className="text-sm font-bold text-[#1A1A1A]">People can join for</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {WINDOWS.map((choice) => (
                  <label
                    key={choice.minutes}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[0.9375rem] font-semibold text-[#1A1A1A] shadow-[inset_0_0_0_1px_#D1D5DB] has-[:checked]:text-[#C92716] has-[:checked]:shadow-[inset_0_0_0_1.5px_#C92716] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#1A1A1A]"
                  >
                    <input
                      type="radio"
                      name="join-window"
                      value={choice.minutes}
                      checked={minutes === choice.minutes}
                      onChange={() => {
                        setMinutes(choice.minutes);
                        edited();
                      }}
                      className="sr-only"
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="group-host-name" className="text-sm font-bold text-[#1A1A1A]">
                Your name for the group <span className="font-normal text-[#6B6B6B]">(optional)</span>
              </label>
              <input
                id="group-host-name"
                value={name}
                maxLength={GROUP_NAME_MAX}
                placeholder="Host"
                onChange={(event) => {
                  setName(event.target.value);
                  edited();
                }}
                className={field}
              />
            </div>
            <button type="submit" className={outlineButton} disabled={busy || !title.trim()}>
              {busy ? "Starting…" : "Start the group order"}
            </button>
            {error ? (
              <p role="alert" className="text-sm font-semibold text-[#C4200F]">
                {error}
              </p>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
