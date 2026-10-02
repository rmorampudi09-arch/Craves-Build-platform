import { z } from "zod";

export const bannerSchema = z.object({
  id: z.string().uuid(), label: z.string().trim().min(1).max(160),
  imagePath: z.string(), published: z.boolean(), sortOrder: z.number().int().min(0).max(999),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
}).refine(banner => banner.imagePath === `/api/v1/catalog/banners/${banner.id}/image`);
export const bannerListSchema = z.array(bannerSchema).max(20);
export type HomeBanner = z.infer<typeof bannerSchema>;
export const bannerUpdateSchema = z.object({
  label: z.string().trim().min(1).max(160).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  sortOrder: z.number().int().min(0).max(999), published: z.boolean(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();

export function bannerTarget(method: string, path: string[]): string | null {
  if (path.length === 0 && (method === "GET" || method === "POST")) return "/catalog/admin/banners";
  if (!z.string().uuid().safeParse(path[0]).success) return null;
  if (path.length === 1 && method === "PUT") return `/catalog/admin/banners/${path[0]}`;
  if (path.length === 2 && path[1] === "image" && method === "GET") return `/catalog/admin/banners/${path[0]}/image`;
  return null;
}
