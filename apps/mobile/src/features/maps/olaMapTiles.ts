import Config from 'react-native-config';

/** Ola vector tiles come through the CRAVES web proxy, so no Ola key ships inside the app. */
export const DEFAULT_MAP_TILES_BASE_URL =
  'https://craves.in/api/location/map-tiles';
export const OLA_MAP_STYLE = 'default-light-standard';

const HTTPS_BASE =
  /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~-]+)*$/;

/** The proxy base from CRAVES_MAP_TILES_BASE_URL; anything but a plain https URL falls back to production. */
export function mapTilesBaseUrl(
  configured: string | undefined = Config.CRAVES_MAP_TILES_BASE_URL,
): string {
  const value = (configured ?? '').trim().replace(/\/+$/, '');
  return HTTPS_BASE.test(value) ? value : DEFAULT_MAP_TILES_BASE_URL;
}

export function olaMapStyleUrl(base: string = mapTilesBaseUrl()): string {
  return `${base}/styles/${OLA_MAP_STYLE}/style.json`;
}

/** The proxy serves only its own site, so native map requests present that site as Referer. */
export function mapTilesReferer(base: string = mapTilesBaseUrl()): string {
  const pathStart = base.indexOf('/', 'https://'.length);
  return `${pathStart < 0 ? base : base.slice(0, pathStart)}/`;
}

/** Regex (passed to the native request transform) limiting that header to the proxy's own URLs. */
export function mapTilesRequestMatch(base: string = mapTilesBaseUrl()): string {
  return `^${base.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/`;
}
