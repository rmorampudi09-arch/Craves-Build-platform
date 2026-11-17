import { z } from "zod";

/**
 * Website and app banners are uploaded and shown apart (owner, 17 Nov 2026). Both are 2:1 today, each with its own
 * setting so either can change alone; the catalog service checks the same shapes (BannerImageValidator).
 */
export const BANNER_PLATFORMS = {
  WEB: { title: "Website banners", where: "on the website's home page", ratio: 2, suggested: "1500 × 750" },
  APP: { title: "App banners", where: "in the app's home screen carousel", ratio: 2, suggested: "1080 × 540" },
} as const;
export type BannerPlatform = keyof typeof BANNER_PLATFORMS;
const SHAPE_TOLERANCE = 0.1;

/** Why a picture can't be this platform's banner, or null when its shape fits (within a tenth, as the server allows). */
export function bannerShapeProblem(width: number, height: number, platform: BannerPlatform): string | null {
  const { ratio, suggested } = BANNER_PLATFORMS[platform];
  if (width > 0 && height > 0 && Math.abs(width / height - ratio) / ratio <= SHAPE_TOLERANCE) return null;
  return `Use a picture twice as wide as it is tall, for example ${suggested} pixels. This one is ${width} × ${height}.`;
}

export const bannerSchema = z.object({
  id: z.string().uuid(), label: z.string().trim().min(1).max(160),
  imagePath: z.string(), published: z.boolean(), sortOrder: z.number().int().min(0).max(999),
  // A banner service from before platforms sends none: everything it holds is a website banner.
  platform: z.enum(["WEB", "APP"]).default("WEB"),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
}).refine(banner => banner.imagePath === `/api/v1/catalog/banners/${banner.id}/image`);
export const bannerListSchema = z.array(bannerSchema).max(40);
export type HomeBanner = z.infer<typeof bannerSchema>;
export const bannerUpdateSchema = z.object({
  label: z.string().trim().min(1).max(160).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  sortOrder: z.number().int().min(0).max(999), published: z.boolean(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();

export function bannerTarget(method: string, path: string[]): string | null {
  if (path.length === 0 && (method === "GET" || method === "POST")) return "/catalog/admin/banners";
  if (!z.string().uuid().safeParse(path[0]).success) return null;
  if (path.length === 1 && (method === "PUT" || method === "DELETE")) return `/catalog/admin/banners/${path[0]}`;
  if (path.length === 2 && path[1] === "image" && method === "GET") return `/catalog/admin/banners/${path[0]}/image`;
  return null;
}
