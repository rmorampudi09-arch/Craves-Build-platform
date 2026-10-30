"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { riderPageSchema, selfieReviewSchema } from "@/features/admin/fleet/lib/rider-contract";
import { issuesSchema, sosEventsSchema } from "@/features/admin/fleet/lib/support-contract";

type Row = { href: string; count: number; label: string; note: string };

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Tells administrators, on the overview, what riders are waiting for, as AdminChefAttention does for chefs. Hidden when
 * the rider queue can't be read (the fleet is off, or this admin has no rider role); a list that fails alone is left out.
 */
export function AdminRiderAttention() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [riders, selfies, issues, sos] = await Promise.allSettled([
        fleetGet("riders?stage=REVIEW", riderPageSchema),
        fleetGet("selfie-reviews?state=PENDING", z.object({ items: z.array(selfieReviewSchema).max(200) })),
        fleetGet("support-issues?state=OPEN", issuesSchema),
        fleetGet("sos-events", sosEventsSchema),
      ]);
      if (!live || riders.status === "rejected") return;
      const review = riders.value.counts?.REVIEW ?? riders.value.riders.length;
      const next: Row[] = [{
        href: "/admin/riders", count: review, label: plural(review, "rider application waiting for review", "rider applications waiting for review"),
        note: "Check the photos and the payout account, then approve or send the fixes in one step.",
      }];
      if (selfies.status === "fulfilled") {
        const count = selfies.value.items.length;
        next.push({ href: "/admin/riders/selfies", count, label: plural(count, "go-online selfie to check", "go-online selfies to check"),
          note: "The rider keeps working; check the face matches the rider on file." });
      }
      if (issues.status === "fulfilled") {
        const count = issues.value.issues.length;
        const presses = sos.status === "fulfilled" ? sos.value.events.length : 0;
        next.push({ href: "/admin/fleet-support", count, label: plural(count, "rider problem open", "rider problems open"),
          note: presses ? `${presses} SOS ${plural(presses, "press", "presses")} in the last 7 days. Acknowledge problems within 24 hours.`
            : "Acknowledge within 24 hours, fix within 72." });
      }
      setRows(next);
    })();
    return () => { live = false; };
  }, []);

  if (!rows) return null;
  const waiting = rows.reduce((sum, row) => sum + row.count, 0);
  return <section className="cr-panel" aria-labelledby="cr-rider-attention" style={{ marginBottom: 24 }}>
    <p className="cr-eyebrow">Riders</p>
    <h2 id="cr-rider-attention">{waiting > 0 ? "Riders are waiting for you" : "No riders are waiting"}</h2>
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {rows.map(row => <Link key={row.href} href={row.href} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, textAlign: "left", padding: "14px 16px", borderRadius: 16, border: "1px solid #e7e1ea", borderLeft: row.count > 0 ? "4px solid #F62E18" : "1px solid #e7e1ea", color: "inherit", textDecoration: "none" }}>
        <span><strong>{row.count}</strong> {row.label}<span className="cr-muted" style={{ display: "block" }}>{row.note}</span></span>
        <ArrowRight size={20} aria-hidden="true" />
      </Link>)}
    </div>
  </section>;
}
