import {
  DEFAULT_MAP_TILES_BASE_URL,
  mapTilesBaseUrl,
  mapTilesReferer,
  mapTilesRequestMatch,
  olaMapStyleUrl,
} from './olaMapTiles';

describe('Ola map tiles through the CRAVES proxy', () => {
  it('defaults to the production proxy and accepts an https override', () => {
    expect(mapTilesBaseUrl(undefined)).toBe(DEFAULT_MAP_TILES_BASE_URL);
    expect(
      mapTilesBaseUrl(' https://staging.craves.in/api/location/map-tiles/ '),
    ).toBe('https://staging.craves.in/api/location/map-tiles');
  });

  it('never points the map at plain http, credentials or query strings', () => {
    for (const value of [
      'http://craves.in/api/location/map-tiles',
      'https://user:pass@craves.in/api/location/map-tiles',
      'https://craves.in/api/location/map-tiles?api_key=x',
      'craves.in/api/location/map-tiles',
      '',
    ]) {
      expect(mapTilesBaseUrl(value)).toBe(DEFAULT_MAP_TILES_BASE_URL);
    }
  });

  it('builds the style URL and the same-site Referer the proxy admits', () => {
    expect(olaMapStyleUrl(DEFAULT_MAP_TILES_BASE_URL)).toBe(
      'https://craves.in/api/location/map-tiles/styles/default-light-standard/style.json',
    );
    expect(mapTilesReferer(DEFAULT_MAP_TILES_BASE_URL)).toBe(
      'https://craves.in/',
    );
    expect(mapTilesReferer('https://craves.in')).toBe('https://craves.in/');
  });

  it('limits the Referer header to the proxy URLs only', () => {
    const match = new RegExp(mapTilesRequestMatch(DEFAULT_MAP_TILES_BASE_URL));
    expect(
      match.test(
        'https://craves.in/api/location/map-tiles/data/planet/1/1/1.pbf',
      ),
    ).toBe(true);
    expect(
      match.test(
        'https://evil.example/?https://craves.in/api/location/map-tiles/',
      ),
    ).toBe(false);
    expect(match.test('https://cravesxin/api/location/map-tiles/x')).toBe(
      false,
    );
  });
});
