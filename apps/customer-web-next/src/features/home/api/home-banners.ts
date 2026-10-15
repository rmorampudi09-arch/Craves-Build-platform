import { parseHomeBanners, type HomeBanner } from "@/features/home/lib/home-banner-contract";

/** Home's promo banners; any failure reads as none, so the section simply stays hidden. */
export async function fetchHomeBanners(): Promise<HomeBanner[]> {
  try {
    const response = await fetch("/api/catalog/banners", {
      cache: "no-store",
      credentials: "same-origin",
    });
    return (response.ok && parseHomeBanners(await response.json())) || [];
  } catch {
    return [];
  }
}
