import {parseHomeBanners} from './homeBannerApi';

jest.mock('../../../core/http/httpClient', () => ({httpClient: {get: jest.fn()}}));
jest.mock('../../../core/config/runtimeConfig', () => ({getRuntimeConfig: () => ({apiBaseUrl: 'https://api.craves.in'})}));

const id = '6212c931-b8ac-4cc7-8cf6-3a9672046b11';
const banner = {id, label: 'Craves homemade food', imagePath: `/api/v1/catalog/banners/${id}/image`, published: true, sortOrder: 0};

describe('admin-published home banners', () => {
  it('uses only the configured gateway and authoritative published images', () => {
    expect(parseHomeBanners({banners: [banner]}, 'https://api.craves.in')).toEqual([
      {id, label: banner.label, imageUrl: `https://api.craves.in${banner.imagePath}`},
    ]);
  });
  it('does not insert any bundled promotional fallback', () => {
    expect(parseHomeBanners({banners: []}, 'https://api.craves.in')).toEqual([]);
  });
  it.each([
    {banners: [{...banner, published: false}]},
    {banners: [{...banner, imagePath: 'https://example.com/random.jpg'}]},
    {banners: [{...banner, imagePath: '/api/v1/auth/me'}]},
    {banners: [banner, banner]},
    {banners: [{...banner, label: ''}]},
    {},
  ])('rejects invalid or unpublished content %p', data => {
    expect(() => parseHomeBanners(data, 'https://api.craves.in')).toThrow();
  });
});
