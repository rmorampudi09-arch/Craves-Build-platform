"use client";

import Image from "next/image";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import {
  BANNER_PLATFORMS,
  bannerListSchema,
  bannerSchema,
  bannerShapeProblem,
  type BannerPlatform,
  type HomeBanner,
} from "@/features/admin/banners/lib/home-banner-contract";

const buttonStyle = "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";

async function ensureSuccess(response: Response) {
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "Banner operation failed. Refresh before retrying.");
  return body;
}

/** The picture's size in pixels, read in the browser before it is sent. */
async function pictureSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function BannerRow({ banner, busy, save, remove }: { banner: HomeBanner; busy: boolean; save: (banner: HomeBanner, label: string, position: number, published: boolean) => void; remove: (banner: HomeBanner) => void }) {
  const [label, setLabel] = useState(banner.label);
  const [position, setPosition] = useState(banner.sortOrder);
  return <li className="grid gap-4 border-b border-zinc-200 py-5 md:grid-cols-[240px_1fr]">
    <div className="relative overflow-hidden rounded-md bg-zinc-100" style={{ aspectRatio: BANNER_PLATFORMS[banner.platform].ratio }}>
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

/** One platform's banners: its own upload, shape check, previews, order and Published switches. */
function BannerSection({ platform, banners, busy, loaded, upload, save, remove }: {
  platform: BannerPlatform;
  banners: HomeBanner[];
  busy: boolean;
  loaded: boolean;
  upload: (platform: BannerPlatform, label: string, file: File) => Promise<boolean>;
  save: (banner: HomeBanner, label: string, position: number, published: boolean) => void;
  remove: (banner: HomeBanner) => void;
}) {
  const { title, where, suggested } = BANNER_PLATFORMS[platform];
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const id = `banners-${platform.toLowerCase()}`;

  const choose = async (next: File | null) => {
    setFile(next);
    setProblem("");
    if (!next) return;
    if (next.size > 2 * 1024 * 1024) return setProblem("Choose an image up to 2 MB.");
    const size = await pictureSize(next).catch(() => null);
    if (!size) return setProblem("This file isn't a picture we can read. Choose a JPEG or PNG.");
    setProblem(bannerShapeProblem(size.width, size.height, platform) ?? "");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || problem) return;
    if (await upload(platform, label, file)) {
      setFile(null); setLabel(""); if (fileInput.current) fileInput.current.value = "";
    }
  };

  return <section aria-labelledby={id} className="space-y-4 rounded-lg border border-zinc-200 p-5">
    <div>
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-zinc-600">Shown {where}. Twice as wide as tall, for example {suggested} pixels; JPEG or PNG up to 2 MB.</p>
    </div>
    <form onSubmit={submit} className="flex flex-wrap items-end gap-4 border-b border-zinc-200 pb-5">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">Banner label
        <input className="rounded-md border border-zinc-300 px-3 py-2" required maxLength={160} value={label} disabled={busy}
          onChange={event => setLabel(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">Banner image
        <input ref={fileInput} type="file" accept="image/jpeg,image/png" required disabled={busy}
          onChange={event => { void choose(event.target.files?.[0] ?? null); }} />
      </label>
      <button className={`${buttonStyle} border-red-600 bg-red-600 text-white`} disabled={busy || !loaded || !file || Boolean(problem) || !label.trim()} type="submit">
        <Upload size={16} />{busy ? "Saving..." : "Upload draft"}
      </button>
    </form>
    {problem ? <p role="alert" className="text-sm font-medium text-red-700">{problem}</p> : null}
    {!loaded ? <p role="status">Loading banners...</p> : banners.length === 0 ? <p className="text-sm text-zinc-600">No {platform === "WEB" ? "website" : "app"} banners.</p> :
      <ul>{banners.map(banner => <BannerRow key={`${banner.id}:${banner.updatedAt}`} banner={banner} busy={busy} save={save} remove={remove} />)}</ul>}
  </section>;
}

export function AdminHomeBanners() {
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
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

  const upload = async (platform: BannerPlatform, label: string, file: File): Promise<boolean> => {
    if (mutation.current) return false;
    mutation.current = true; setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file); form.set("label", label.trim()); form.set("sortOrder", "0"); form.set("platform", platform);
      const saved = bannerSchema.safeParse(await ensureSuccess(await adminFetch("/api/admin/banners", { method: "POST", body: form })));
      await load();
      // A banner service still on its old version files every upload under the website.
      setMessage(saved.success && saved.data.platform !== platform
        ? "Saved as a website banner: the banner service is still updating. Delete it and upload again in a few minutes."
        : `Image uploaded as a draft. Tick Published to show it ${BANNER_PLATFORMS[platform].where}.`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed. Refresh before retrying.");
      return false;
    } finally { mutation.current = false; setBusy(false); }
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
    const from = banner.platform === "WEB" ? "the website" : "the app";
    if (mutation.current || !window.confirm(`Delete "${banner.label}"? It disappears from ${from} and can't be restored.`)) return;
    mutation.current = true; setBusy(true); setMessage("");
    try {
      await ensureSuccess(await adminFetch(`/api/admin/banners/${banner.id}`, { method: "DELETE" }));
      await load(); setMessage("Banner deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Delete failed. Refresh before retrying."); }
    finally { mutation.current = false; setBusy(false); }
  };

  return <div className="space-y-5">
    <div className="flex items-center justify-end">
      <button type="button" aria-label="Refresh banners" className={buttonStyle} disabled={busy}
        onClick={() => { setMessage(""); void load().catch(error => setMessage(error instanceof Error ? error.message : "Banners unavailable.")); }}><RefreshCw size={18} /></button>
    </div>
    {message ? <p role="status" className="text-sm font-medium">{message}</p> : null}
    {(Object.keys(BANNER_PLATFORMS) as BannerPlatform[]).map(platform => (
      <BannerSection key={platform} platform={platform} banners={banners.filter(banner => banner.platform === platform)} busy={busy} loaded={loaded}
        upload={upload} save={(...args) => { void save(...args); }} remove={target => { void remove(target); }} />
    ))}
  </div>;
}
