"use client";

import Image from "next/image";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { bannerListSchema, type HomeBanner } from "@/features/admin/banners/lib/home-banner-contract";

const buttonStyle = "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";

async function ensureSuccess(response: Response) {
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "Banner operation failed. Refresh before retrying.");
  return body;
}

function BannerRow({ banner, busy, save, remove }: { banner: HomeBanner; busy: boolean; save: (banner: HomeBanner, label: string, position: number, published: boolean) => void; remove: (banner: HomeBanner) => void }) {
  const [label, setLabel] = useState(banner.label);
  const [position, setPosition] = useState(banner.sortOrder);
  return <li className="grid gap-4 border-b border-zinc-200 py-5 md:grid-cols-[240px_1fr]">
    <div className="relative aspect-[2/1] overflow-hidden rounded-md bg-zinc-100">
      <Image src={`/api/admin/banners/${banner.id}/image`} alt={banner.label} fill unoptimized className="object-contain" sizes="240px" />
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">Banner label
        <input className="w-full rounded-md border border-zinc-300 px-3 py-2" value={label} maxLength={160} disabled={busy} onChange={event => setLabel(event.target.value)} />
      </label>
      <label className="flex w-24 flex-col gap-1 text-sm font-medium">Position
        <input className="rounded-md border border-zinc-300 px-3 py-2" type="number" min={0} max={999} value={position} disabled={busy} onChange={event => setPosition(Number(event.target.value))} />
      </label>
      <label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium">
        <input aria-label={`Published: ${banner.label}`} type="checkbox" checked={banner.published} disabled={busy}
          onChange={event => save(banner, label, position, event.target.checked)} />
        {banner.published ? "Published" : "Draft"}
      </label>
      <button type="button" className={buttonStyle} disabled={busy || !label.trim() || !Number.isInteger(position) || position < 0 || position > 999}
        onClick={() => save(banner, label, position, banner.published)}>Save</button>
      <button type="button" className={`${buttonStyle} border-red-300 text-red-700`} disabled={busy}
        onClick={() => remove(banner)}><Trash2 size={16} />Delete</button>
    </div>
  </li>;
}

export function AdminHomeBanners() {
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mutation = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const body = await ensureSuccess(await adminFetch("/api/admin/banners", { cache: "no-store" }));
    const parsed = bannerListSchema.parse(body);
    if (id === requestId.current) { setBanners(parsed); setLoaded(true); }
  }, []);
  useEffect(() => {
    const requests = requestId;
    void load().catch(error => setMessage(error instanceof Error ? error.message : "Banners unavailable."));
    return () => { requests.current++; };
  }, [load]);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || mutation.current) return;
    mutation.current = true; setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file); form.set("label", label.trim()); form.set("sortOrder", "0");
      await ensureSuccess(await adminFetch("/api/admin/banners", { method: "POST", body: form }));
      setFile(null); setLabel(""); if (fileInput.current) fileInput.current.value = "";
      await load(); setMessage("Image uploaded as a draft. Tick Published to show it in the app.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed. Refresh before retrying."); }
    finally { mutation.current = false; setBusy(false); }
  };

  const save = async (banner: HomeBanner, nextLabel: string, position: number, published: boolean) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setMessage("");
    try {
      await ensureSuccess(await adminFetch(`/api/admin/banners/${banner.id}`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel, sortOrder: position, published, expectedUpdatedAt: banner.updatedAt }) }));
      await load(); setMessage(published ? "Banner published." : "Banner saved as a draft.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { mutation.current = false; setBusy(false); }
  };

  const remove = async (banner: HomeBanner) => {
    if (mutation.current || !window.confirm(`Delete "${banner.label}"? It disappears from the app and can't be restored.`)) return;
    mutation.current = true; setBusy(true); setMessage("");
    try {
      await ensureSuccess(await adminFetch(`/api/admin/banners/${banner.id}`, { method: "DELETE" }));
      await load(); setMessage("Banner deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Delete failed. Refresh before retrying."); }
    finally { mutation.current = false; setBusy(false); }
  };

  return <section className="space-y-5">
    <form onSubmit={upload} className="flex flex-wrap items-end gap-4 border-b border-zinc-200 pb-6">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">Banner label
        <input className="rounded-md border border-zinc-300 px-3 py-2" required maxLength={160} value={label} disabled={busy}
          onChange={event => setLabel(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">Banner image
        <input ref={fileInput} type="file" accept="image/jpeg,image/png" required disabled={busy}
          onChange={event => { const next = event.target.files?.[0] ?? null; setFile(next); setMessage(next && next.size > 2 * 1024 * 1024 ? "Choose an image up to 2 MB." : ""); }} />
      </label>
      <button className={`${buttonStyle} border-red-600 bg-red-600 text-white`} disabled={busy || !loaded || !file || file.size > 2 * 1024 * 1024 || !label.trim()} type="submit">
        <Upload size={16} />{busy ? "Saving..." : "Upload draft"}
      </button>
      <button type="button" aria-label="Refresh banners" title="Refresh banners" className={buttonStyle} disabled={busy}
        onClick={() => { setMessage(""); void load().catch(error => setMessage(error instanceof Error ? error.message : "Banners unavailable.")); }}><RefreshCw size={18} /></button>
    </form>
    {message ? <p role="status" className="text-sm font-medium">{message}</p> : null}
    {!loaded ? <p role="status">Loading banners...</p> : banners.length === 0 ? <p className="text-sm text-zinc-600">No banners.</p> :
      <ul>{banners.map(banner => <BannerRow key={`${banner.id}:${banner.updatedAt}`} banner={banner} busy={busy} save={(...args) => { void save(...args); }} remove={target => { void remove(target); }} />)}</ul>}
  </section>;
}
