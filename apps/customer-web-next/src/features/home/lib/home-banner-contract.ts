import { z } from "zod";

/** A published Home banner. `src` is our own image route: the browser never calls the API origin. */
export type HomeBanner = { id: string; label: string; src: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const id = z.string().regex(UUID);
const label = z.string().trim().min(1).max(160);
const feed = z.object({
  banners: z
    .array(
      z.object({
        id,
        label,
        imagePath: z.string(),
        published: z.boolean(),
        sortOrder: z.number().int().min(0).max(999),
      }),
    )
    .max(20),
});
const list = z.object({ banners: z.array(z.object({ id, label, src: z.string() })).max(20) });

export const homeBannerImageSrc = (bannerId: string) => `/api/catalog/banners/${bannerId}/image`;

/** The catalog feed: published banners in sortOrder, or null when any entry is malformed, repeated or points at another image. */
export function parseHomeBannerFeed(body: unknown): HomeBanner[] | null {
  const parsed = feed.safeParse(body);
  if (!parsed.success) return null;
  const { banners } = parsed.data;
  if (new Set(banners.map((banner) => banner.id)).size !== banners.length) return null;
  if (banners.some((banner) => banner.imagePath !== `/api/v1/catalog/banners/${banner.id}/image`))
    return null;
  return banners
    .filter((banner) => banner.published)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((banner) => ({ id: banner.id, label: banner.label, src: homeBannerImageSrc(banner.id) }));
}

/** Our BFF's answer, checked again in the browser: every image must come from our own banner route. */
export function parseHomeBanners(body: unknown): HomeBanner[] | null {
  const parsed = list.safeParse(body);
  return parsed.success &&
    parsed.data.banners.every((banner) => banner.src === homeBannerImageSrc(banner.id))
    ? parsed.data.banners
    : null;
}
