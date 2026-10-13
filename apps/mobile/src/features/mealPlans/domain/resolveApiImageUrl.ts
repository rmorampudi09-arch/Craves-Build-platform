import {getRuntimeConfig} from '../../../core/config/runtimeConfig';

/** https URLs pass through; `/api/...` paths hang off the configured API origin; anything else is not an image. */
export function resolveApiImageUrl(path: string | null | undefined): string | null {
  const value = path?.trim();
  if (!value) {
    return null;
  }
  if (/^https:\/\/\S+$/i.test(value)) {
    return value;
  }
  if (!value.startsWith('/api/')) {
    return null;
  }
  try {
    return `${getRuntimeConfig().apiBaseUrl}${value}`;
  } catch {
    return null;
  }
}
