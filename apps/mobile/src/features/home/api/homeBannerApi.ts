import {z} from 'zod';
import {getRuntimeConfig} from '../../../core/config/runtimeConfig';
import {httpClient} from '../../../core/http/httpClient';

const bannerSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(160),
  imagePath: z.string(),
  published: z.literal(true),
  sortOrder: z.number().int().min(0).max(999),
});
const feedSchema = z.object({banners: z.array(bannerSchema).max(20)});

export interface HomeBanner {
  id: string;
  label: string;
  imageUrl: string;
}

export function parseHomeBanners(data: unknown, apiOrigin: string): HomeBanner[] {
  const {banners} = feedSchema.parse(data);
  const seen = new Set<string>();
  return banners.map(banner => {
    const expectedPath = `/api/v1/catalog/banners/${banner.id}/image`;
    if (banner.imagePath !== expectedPath || seen.has(banner.id)) {
      throw new Error('Invalid home banner image reference.');
    }
    seen.add(banner.id);
    return {
      id: banner.id,
      label: banner.label,
      imageUrl: `${apiOrigin}${expectedPath}`,
    };
  });
}

export const homeBannerApi = {
  async list(signal?: AbortSignal): Promise<HomeBanner[]> {
    const data = await httpClient.get<unknown>('/api/v1/catalog/banners', {signal});
    return parseHomeBanners(data, getRuntimeConfig().apiBaseUrl);
  },
};
