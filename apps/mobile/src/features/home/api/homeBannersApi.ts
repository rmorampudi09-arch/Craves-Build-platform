import {z} from 'zod';
import {getRuntimeConfig} from '../../../core/config/runtimeConfig';
import {httpClient} from '../../../core/http/httpClient';

const CATALOG_BANNERS_PATH = '/api/v1/catalog/banners';

const feedSchema = z.object({
  banners: z
    .array(z.object({id: z.string().uuid(), label: z.string().trim().min(1).max(160), imagePath: z.string()}))
    .max(20),
});

export interface AppBanner {
  id: string;
  label: string;
  imageUrl: string;
}

/**
 * The app's own home banners, uploaded under "App banners" in admin: the website's never show here, and an
 * entry pointing at any other picture is dropped. Published only and in the admin's order, as the server sends them.
 */
export async function fetchAppBanners(signal?: AbortSignal): Promise<AppBanner[]> {
  const response = await httpClient.get<unknown>(CATALOG_BANNERS_PATH, {
    params: {platform: 'APP'},
    signal,
    dedupeKey: 'home:app-banners',
  });
  const {banners} = feedSchema.parse(response);
  const base = getRuntimeConfig().apiBaseUrl;
  return banners
    .filter(banner => banner.imagePath === `${CATALOG_BANNERS_PATH}/${banner.id}/image`)
    .map(banner => ({id: banner.id, label: banner.label, imageUrl: `${base}${banner.imagePath}`}));
}
