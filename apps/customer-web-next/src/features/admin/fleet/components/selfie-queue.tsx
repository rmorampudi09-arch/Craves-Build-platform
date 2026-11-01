"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { selfieReviewSchema, type SelfieReview } from "@/features/admin/fleet/lib/rider-contract";
import { ActionMessage, ReasonAction, useFleetAction } from "./fleet-action";

const STATES = ["PENDING", "APPROVED", "REJECTED"] as const;
const queueSchema = z.object({ items: z.array(selfieReviewSchema).max(200) });

export function SelfieQueue() {
  const [state, setState] = useState<(typeof STATES)[number]>("PENDING");
  const [items, setItems] = useState<SelfieReview[]>([]);
  const [message, setMessage] = useState("Loading selfies…");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const page = await fleetGet(`selfie-reviews?state=${state}`, queueSchema);
      setItems(page.items);
      setMessage(page.items.length ? "" : state === "PENDING" ? "No selfies are waiting for review." : "None yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Selfies are unavailable.");
    }
  }, [state]);

  useEffect(() => { void load(); }, [load]);

  return <section className="cr-panel space-y-4">
    <div className="flex flex-wrap gap-2">{STATES.map(value => <button key={value} type="button" aria-pressed={state === value}
      className={`cr-button ${state === value ? "cr-primary" : ""}`} onClick={() => setState(value)}>{readableFleetValue(value)}</button>)}</div>
    <p className="cr-muted">Check the selfie shows the rider on file. Rejecting records it only: it never ends the shift or blocks anyone. If needed, record a status change on the rider.</p>
    {notice && <p className="cr-feedback" role="status">{notice}</p>}
    {message && <p className="cr-empty" role="status">{message}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item => <SelfieCard key={item.shiftId} item={item} onDone={async text => { setNotice(text); await load(); }} />)}</div>
  </section>;
}

function SelfieCard({ item, onDone }: { item: SelfieReview; onDone: (notice: string) => Promise<void> }) {
  const action = useFleetAction();
  async function decide(verb: "approve" | "reject", reason?: string) {
    const done = await action.run("POST", `shifts/${item.shiftId}/selfie/${verb}`, selfieReviewSchema, reason === undefined ? undefined : { reason }, "");
    if (done) await onDone(`${item.riderName}'s selfie ${verb === "approve" ? "approved" : "rejected"}.`);
  }
  return <article className="rounded-xl border border-slate-200 p-3 text-sm">
    <img src={`/api/admin/fleet/shifts/${item.shiftId}/selfie`} alt={`Go-online selfie of ${item.riderName}`} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
    <p className="mt-2"><Link className="font-bold underline" href={`/admin/riders/${item.riderId}`}>{item.riderName}</Link> · {formatAdminTimestamp(item.startedAt)}</p>
    {item.reviewedBy && <p className="cr-muted">{readableFleetValue(item.state)} by {item.reviewedBy}{item.reason ? `: ${item.reason}` : ""}</p>}
    {item.state === "PENDING" && <div className="mt-2 flex flex-wrap items-start gap-2">
      <button type="button" className="cr-button cr-primary" disabled={action.busy} onClick={() => void decide("approve")}>Approve selfie</button>
      <ReasonAction label="Reject selfie" action={action} onSubmit={reason => void decide("reject", reason)} />
    </div>}
    <ActionMessage state={action.state} />
  </article>;
}
