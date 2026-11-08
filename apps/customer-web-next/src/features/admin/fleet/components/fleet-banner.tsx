"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { bannerFromForm, zoneBannerSchema, type ZoneBanner } from "@/features/admin/fleet/lib/banner-contract";
import { ActionMessage, fieldClass, labelClass, useFleetAction } from "./fleet-action";

/** The zone banner every rider sees on Home (ops-assigned slots were removed from the console in 1.3.4). */
export function FleetBanner() {
  const [banner, setBanner] = useState<ZoneBanner | null>(null);
  const [message, setMessage] = useState("Loading the banner…");
  const [form, setForm] = useState({ tone: "info", text: "", until: "" });
  const save = useFleetAction();
  const clear = useFleetAction();

  const load = useCallback(async () => {
    try {
      const current = await fleetGet("banner", zoneBannerSchema.nullable());
      setBanner(current);
      setMessage(current ? "" : "No banner is showing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The banner is unavailable.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = bannerFromForm(form);
    if (typeof input === "string") return save.refuse(input);
    const shown = await save.run("PUT", "banner", zoneBannerSchema, input, "Banner is showing on riders' Home.");
    if (shown) { setBanner(shown); setMessage(""); setForm({ tone: "info", text: "", until: "" }); }
  }

  async function clearBanner() {
    if (!window.confirm("Stop showing the banner to riders?")) return;
    await clear.run("DELETE", "banner", z.null(), undefined, "Banner cleared.");
    await load();
  }

  return <section className="cr-panel space-y-3" aria-labelledby="fleet-banner-title">
    <h2 id="fleet-banner-title" className="text-lg font-bold">Zone banner</h2>
    {message && <p className="cr-empty" role="status">{message}</p>}
    {banner && <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="cr-status">{banner.tone === "warning" ? "Warning" : "Info"}</span>
      <span>{banner.text}</span><span className="cr-muted">until {formatAdminTimestamp(banner.until)}</span>
      <button type="button" className="cr-button" disabled={clear.busy} onClick={() => void clearBanner()}>Clear banner</button>
    </div>}
    <ActionMessage state={clear.state} />
    <form noValidate className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[10rem_1fr_14rem]" onSubmit={event => void submit(event)}>
      <label className={labelClass}>Tone<select className={fieldClass} value={form.tone} onChange={event => setForm({ ...form, tone: event.target.value })}>
        <option value="info">Info</option><option value="warning">Warning</option>
      </select></label>
      <div>
        <label className={labelClass}>Banner text<input className={fieldClass} value={form.text} maxLength={160} aria-describedby="fleet-banner-count" placeholder="Heavy rain in Madhapur. Ride slowly." onChange={event => setForm({ ...form, text: event.target.value })} /></label>
        <p id="fleet-banner-count" className="cr-muted mt-1 text-xs">{form.text.trim().length} of 160 characters</p>
      </div>
      <label className={labelClass}>Show until (IST)<input className={fieldClass} type="datetime-local" value={form.until} onChange={event => setForm({ ...form, until: event.target.value })} /></label>
      <span className="sm:col-span-3"><button type="submit" className="cr-button cr-primary" disabled={save.busy}>{banner ? "Replace banner" : "Show banner"}</button><ActionMessage state={save.state} /></span>
    </form>
  </section>;
}
