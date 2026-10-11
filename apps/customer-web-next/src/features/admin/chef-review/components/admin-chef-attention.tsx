"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";

type Attention = { pending: number; open: number; oldestOpen: string | null; more: boolean };

/** Open = not yet resolved by the support team (OPEN or CONTACTED). */
export function summarizeHelp(items: { status: string; createdAt: string }[], more: boolean) {
  const open = items.filter(item => item.status !== "RESOLVED");
  const oldest = open.map(item => item.createdAt).sort()[0] ?? null;
  return { open: open.length, oldestOpen: oldest, more };
}

/** Tells administrators, on the overview, about chef applications and help requests waiting for them. */
export function AdminChefAttention() {
  const [data, setData] = useState<Attention | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const [reviews, help] = await Promise.all([
        adminFetch("/api/admin/chef-reviews?status=PENDING", { cache: "no-store", signal: controller.signal }),
        adminFetch("/api/admin/chef-onboarding/help", { cache: "no-store", signal: controller.signal }),
      ]);
      const applications: unknown = reviews.ok ? await reviews.json() : null;
      const page = help.ok ? await help.json() as { items?: { status: string; createdAt: string }[]; nextCursor?: string | null } : null;
      if (!Array.isArray(applications) || !Array.isArray(page?.items)) throw new Error("unavailable");
      // shortcut: counts open requests on the newest 100 only and adds "+" when older pages exist; add a backend count if volume grows.
      setData({ pending: applications.length, ...summarizeHelp(page.items, Boolean(page.nextCursor)) });
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);

  if (failed) return <section className="cr-panel" role="status" style={{ marginBottom: 24 }}><p className="cr-eyebrow">Chef onboarding</p><p className="cr-muted">Chef applications and help requests could not be counted. Open <Link href="/admin/chef-reviews">Chef applications</Link> or <Link href="/admin/chef-onboarding">Chef onboarding help</Link>.</p></section>;
  if (!data) return null;
  const rows = [
    { href: "/admin/chef-reviews", count: data.pending, label: data.pending === 1 ? "chef application waiting for review" : "chef applications waiting for review", note: "Approve documents, verify FSSAI and decide." },
    { href: "/admin/chef-onboarding", count: data.open, label: data.open === 1 ? "chef help request open" : "chef help requests open", note: data.oldestOpen ? `Oldest since ${formatAdminTimestamp(data.oldestOpen)}. Call the chef, then mark it contacted or resolved.` : "Chefs who ask for FSSAI help appear here." },
  ];
  return <section className="cr-panel" aria-labelledby="cr-chef-attention" style={{ marginBottom: 24 }}>
    <p className="cr-eyebrow">Chef onboarding</p>
    <h2 id="cr-chef-attention">{data.pending + data.open > 0 ? "Chefs are waiting for you" : "No chefs are waiting"}</h2>
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {rows.map(row => <Link key={row.href} href={row.href} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, textAlign: "left", padding: "14px 16px", borderRadius: 16, border: "1px solid #e7e1ea", borderLeft: row.count > 0 ? "4px solid #F62E18" : "1px solid #e7e1ea", color: "inherit", textDecoration: "none" }}>
        <span><strong>{row.count}{row.href.endsWith("onboarding") && data.more ? "+" : ""}</strong> {row.label}<span className="cr-muted" style={{ display: "block" }}>{row.note}</span></span>
        <ArrowRight size={20} aria-hidden="true" />
      </Link>)}
    </div>
  </section>;
}
