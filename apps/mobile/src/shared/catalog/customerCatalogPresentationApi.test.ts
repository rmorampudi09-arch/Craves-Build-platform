import {httpClient} from '../../core/http/httpClient';
import {customerCatalogPresentationApi} from './customerCatalogPresentationApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const kitchenId = '11111111-1111-4111-8111-111111111111';
const FACE = 'https://craves.in/media/public/chef-avatars/chef-avatar-04.jpg';
const kitchen = {
  id: kitchenId,
  kitchenName: 'Meena Home Kitchen',
  displayName: 'Meena',
  description: null,
};

describe('customerCatalogPresentationApi.getKitchen chef picture', () => {
  afterEach(() => getMock.mockReset());

  it('keeps the hosted chef face', async () => {
    getMock.mockResolvedValue({...kitchen, chefPhotoUrl: FACE});

    await expect(customerCatalogPresentationApi.getKitchen(kitchenId)).resolves.toMatchObject({
      chefPhotoUrl: FACE,
    });
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['not https', 'http://craves.in/media/public/chef-avatars/chef-avatar-04.jpg'],
    ['not a url', 'chef-avatar-04'],
  ])('gives no chef face when it is %s', async (_label, chefPhotoUrl) => {
    getMock.mockResolvedValue({...kitchen, chefPhotoUrl});

    await expect(customerCatalogPresentationApi.getKitchen(kitchenId)).resolves.toMatchObject({
      chefPhotoUrl: null,
    });
  });
});
