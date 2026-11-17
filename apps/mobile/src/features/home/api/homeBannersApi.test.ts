import {httpClient} from '../../../core/http/httpClient';
import {fetchAppBanners} from './homeBannersApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {get: jest.fn()},
}));
jest.mock('../../../core/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({apiBaseUrl: 'https://api.example.test'}),
}));

const getMock = httpClient.get as jest.Mock;
const id = '6212c931-b8ac-4cc7-8cf6-3a9672046b11';
const other = '7212c931-b8ac-4cc7-8cf6-3a9672046b12';

describe('fetchAppBanners', () => {
  beforeEach(() => getMock.mockReset());

  it("asks for the app's banners only and builds each picture's address on the API", async () => {
    getMock.mockResolvedValue({
      banners: [{id, label: 'Weekend thali', imagePath: `/api/v1/catalog/banners/${id}/image`, platform: 'APP', published: true}],
    });
    await expect(fetchAppBanners()).resolves.toEqual([
      {id, label: 'Weekend thali', imageUrl: `https://api.example.test/api/v1/catalog/banners/${id}/image`},
    ]);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe('/api/v1/catalog/banners');
    expect(options.params).toEqual({platform: 'APP'});
  });

  it('drops an entry that points at another picture', async () => {
    getMock.mockResolvedValue({
      banners: [
        {id, label: 'Elsewhere', imagePath: 'https://untrusted.example/banner.jpg'},
        {id: other, label: 'Ours', imagePath: `/api/v1/catalog/banners/${other}/image`},
      ],
    });
    await expect(fetchAppBanners()).resolves.toEqual([
      {id: other, label: 'Ours', imageUrl: `https://api.example.test/api/v1/catalog/banners/${other}/image`},
    ]);
  });

  it('refuses a feed it cannot read, so the bundled pictures stay', async () => {
    getMock.mockResolvedValue({banners: 'none'});
    await expect(fetchAppBanners()).rejects.toThrow();
  });
});
