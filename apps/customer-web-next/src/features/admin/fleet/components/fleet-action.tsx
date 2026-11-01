"use client";

import { useRef, useState } from "react";
import type { z } from "zod";
import { reasonText } from "@/features/admin/fleet/lib/fleet-common";
import { fleetSend } from "@/features/admin/fleet/lib/fleet-client";

export const fieldClass = "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";
export const labelClass = "block text-xs font-bold text-slate-600";

export type ActionState = { phase: "idle" | "submitting" | "success" | "error"; message: string };
export type FleetAction = ReturnType<typeof useFleetAction>;

/** One admin action: idle, submitting, success or error with the server's message. */
export function useFleetAction() {
  const [state, setState] = useState<ActionState>({ phase: "idle", message: "" });
  const last = useRef<{ request: string; key: string } | null>(null);

  async function run<T>(method: "POST" | "PUT" | "DELETE", path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown, success: string): Promise<T | null> {
    const request = JSON.stringify([method, path, body ?? null]);
    // Retrying the same request keeps its Idempotency-Key, so a lost answer can't repeat the action.
    if (last.current?.request !== request) last.current = { request, key: crypto.randomUUID() };
    setState({ phase: "submitting", message: "" });
    try {
      const result = await fleetSend(method, path, last.current.key, schema, body);
      last.current = null;
      setState({ phase: "success", message: success });
      return result;
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "The fleet service is unavailable. Try again shortly." });
      return null;
    }
  }

  return { state, run, busy: state.phase === "submitting", refuse: (message: string) => setState({ phase: "error", message }) };
}

export function ActionMessage({ state }: { state: ActionState }) {
  if (state.phase === "submitting") return <p className="cr-feedback" role="status">Saving…</p>;
  if (state.phase === "success") return state.message ? <p className="cr-feedback" role="status">{state.message}</p> : null;
  if (state.phase === "error") return <p className="cr-error-text" role="alert">{state.message}</p>;
  return null;
}

/** A button that asks for a reason before it runs: every reject, cancel and fail. */
export function ReasonAction({ label, action, onSubmit }: { label: string; action: FleetAction; onSubmit: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <button type="button" className="cr-button" disabled={action.busy} onClick={() => setOpen(true)}>{label}</button>;
  return <form className="mt-2 space-y-2" onSubmit={event => {
    event.preventDefault();
    const parsed = reasonText.safeParse(reason);
    if (parsed.success) onSubmit(parsed.data); else action.refuse(parsed.error.issues[0]?.message ?? "Write a reason.");
  }}>
    <label className={labelClass}>Reason for “{label}”<textarea className={fieldClass} value={reason} maxLength={1000} rows={2} onChange={event => setReason(event.target.value)} /></label>
    <span className="cr-actions">
      <button type="submit" className="cr-button cr-primary" disabled={action.busy}>{label}</button>
      <button type="button" className="cr-button" disabled={action.busy} onClick={() => setOpen(false)}>Back</button>
    </span>
  </form>;
}
