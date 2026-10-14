import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {chefOnboardingApi, EMPTY_ONBOARDING} from '../../chefOnboarding/api/chefOnboardingApi';
import {chefProfileApi, parseChefKitchenProfile} from './chefProfileApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn()},
}));
jest.mock('../../chefOnboarding/api/chefOnboardingApi', () => ({
  ...jest.requireActual('../../chefOnboarding/api/chefOnboardingApi'),
  chefOnboardingApi: {load: jest.fn()},
}));

const KITCHEN_ID = '11111111-1111-4111-8111-111111111111';
const IDENTITY_ID = '22222222-2222-4222-8222-222222222222';

function kitchen(overrides: Record<string, unknown> = {}) {
  return {
    id: KITCHEN_ID,
    identityId: IDENTITY_ID,
    kitchenName: 'Anita Home Kitchen',
    displayName: 'Chef Anita',
    description: 'Fresh home-style meals',
    phoneNumber: '+919876543210',
    email: 'chef@example.test',
    addressLine1: '12 Market Road',
    addressLine2: null,
    landmark: 'Near Metro',
    areaName: 'Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    latitude: 12.9716,
    longitude: 77.5946,
    status: 'ACTIVE',
    createdAt: '2026-08-01T07:00:00Z',
    updatedAt: '2026-08-09T08:00:00Z',
    ...overrides,
  };
}

describe('chefProfileApi parsing', () => {
  it('accepts the exact kitchen profile response shape', () => {
    expect(parseChefKitchenProfile(kitchen())).toEqual(
      expect.objectContaining({
        id: KITCHEN_ID,
        identityId: IDENTITY_ID,
        kitchenName: 'Anita Home Kitchen',
        status: 'ACTIVE',
        latitude: 12.9716,
        longitude: 77.5946,
      }),
    );
  });

  it('accepts numeric-string coordinates emitted by compatible JSON serializers', () => {
    expect(
      parseChefKitchenProfile(
        kitchen({latitude: '12.9716', longitude: '77.5946'}),
      ),
    ).toEqual(expect.objectContaining({latitude: 12.9716, longitude: 77.5946}));
  });

  it('leaves the photo, cuisine, area and link fields undefined while the server does not send them', () => {
    const parsed = parseChefKitchenProfile(kitchen());
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('cuisines');
    expect(parsed).not.toHaveProperty('socialLinks');
    expect(parsed).not.toHaveProperty('chefPhotoUrl');
    expect(parsed).not.toHaveProperty('kitchenPhotoUrls');
  });

  it('reads the kitchen photo slots in order and keeps only https photos', () => {
    expect(
      parseChefKitchenProfile(
        kitchen({kitchenPhotoUrls: ['https://cdn.example.test/1.jpg', 'http://insecure.test/x.jpg', 'https://cdn.example.test/2.jpg']}),
      )?.kitchenPhotoUrls,
    ).toEqual(['https://cdn.example.test/1.jpg', 'https://cdn.example.test/2.jpg']);
    expect(parseChefKitchenProfile(kitchen({kitchenPhotoUrls: []}))?.kitchenPhotoUrls).toEqual([]);
  });

  it('reads the photo, cuisine, area and link fields once the server sends them', () => {
    const socialLinks = {instagram: 'https://instagram.com/anita', facebook: null, youtube: null, website: null};
    expect(
      parseChefKitchenProfile(
        kitchen({
          chefPhotoUrl: 'https://cdn.example.test/chef.jpg',
          kitchenPhotoUrl: null,
          cuisines: ['Andhra', 'Biryani'],
          serviceAreas: ['KPHB'],
          socialLinks,
        }),
      ),
    ).toMatchObject({
      chefPhotoUrl: 'https://cdn.example.test/chef.jpg',
      kitchenPhotoUrl: null,
      cuisines: ['Andhra', 'Biryani'],
      serviceAreas: ['KPHB'],
      socialLinks,
    });
  });

  it('ignores an unreadable new field instead of rejecting the whole kitchen', () => {
    const parsed = parseChefKitchenProfile(kitchen({cuisines: 'Andhra', chefPhotoUrl: 'http://insecure.example/chef.jpg'}));
    expect(parsed).not.toBeNull();
    expect(parsed?.cuisines).toBeUndefined();
    expect(parsed?.chefPhotoUrl).toBeNull();
  });

  it('fails closed on an unsupported kitchen status', () => {
    expect(parseChefKitchenProfile(kitchen({status: 'VERIFIED'}))).toBeNull();
  });

  it('fails closed when a required contract field is missing', () => {
    expect(parseChefKitchenProfile(kitchen({city: null}))).toBeNull();
  });
});

describe('chefProfileApi.getKitchen for a newly approved chef', () => {
  const notFound = new AppApiError('KITCHEN_PROFILE_NOT_FOUND', 'Kitchen profile was not found', 404);
  const details = {
    ...EMPTY_ONBOARDING,
    email: 'asha@example.com',
    firstName: 'Asha',
    lastName: 'Rao',
    kitchenName: 'Asha’s Kitchen',
    kitchenDescription: 'Andhra meals',
    addressLine1: '12 Market Road',
    addressLine2: 'Lane 3, Begumpet',
    city: 'Hyderabad',
    state: 'Telangana',
    postalCode: '500016',
    latitude: 17.44,
    longitude: 78.46,
  };
  beforeEach(() => jest.resetAllMocks());

  it('creates the kitchen from the approved application, as the website does', async () => {
    (httpClient.get as jest.Mock).mockRejectedValue(notFound);
    (chefOnboardingApi.load as jest.Mock).mockResolvedValue({phoneNumber: '+919876543210', details, application: {id: 'app-1', status: 'APPROVED'}});
    (httpClient.put as jest.Mock).mockResolvedValue(kitchen({kitchenName: 'Asha’s Kitchen', status: 'DRAFT'}));

    await expect(chefProfileApi.getKitchen()).resolves.toMatchObject({kitchenName: 'Asha’s Kitchen', status: 'DRAFT'});
    expect(httpClient.put).toHaveBeenCalledWith(
      '/api/v1/kitchens/me',
      {
        kitchenName: 'Asha’s Kitchen',
        displayName: 'Asha Rao',
        description: 'Andhra meals',
        phoneNumber: '+919876543210',
        email: 'asha@example.com',
        addressLine1: '12 Market Road',
        addressLine2: 'Lane 3, Begumpet',
        landmark: null,
        areaName: 'Begumpet',
        city: 'Hyderabad',
        state: 'Telangana',
        postalCode: '500016',
        latitude: 17.44,
        longitude: 78.46,
        status: 'DRAFT',
      },
      expect.anything(),
    );
  });

  it('keeps the not-found error when the application has no kitchen to copy', async () => {
    (httpClient.get as jest.Mock).mockRejectedValue(notFound);
    (chefOnboardingApi.load as jest.Mock).mockResolvedValue({phoneNumber: '', details: {...details, kitchenName: ''}, application: {id: 'app-1', status: 'APPROVED'}});

    await expect(chefProfileApi.getKitchen()).rejects.toBe(notFound);
    expect(httpClient.put).not.toHaveBeenCalled();
  });
});

describe('chefProfileApi photos', () => {
  const file = {uri: 'file:///chef.jpg', name: 'chef.jpg', type: 'image/jpeg'};
  beforeEach(() => jest.resetAllMocks());

  it('uploads a chef or kitchen photo as multipart and returns the kitchen', async () => {
    (httpClient.post as jest.Mock).mockResolvedValue(kitchen({chefPhotoUrl: 'https://cdn.example.test/chef.jpg'}));

    const updated = await chefProfileApi.uploadPhoto('CHEF', file);

    expect(updated.chefPhotoUrl).toBe('https://cdn.example.test/chef.jpg');
    const [url, body, options] = (httpClient.post as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/v1/kitchens/me/photos?kind=CHEF');
    expect(body).toBeInstanceOf(FormData);
    expect(options).toEqual({signal: undefined});
  });

  it('removes a photo by kind', async () => {
    (httpClient.delete as jest.Mock).mockResolvedValue(kitchen({kitchenPhotoUrl: null}));

    await expect(chefProfileApi.deletePhoto('KITCHEN')).resolves.toMatchObject({kitchenPhotoUrl: null});
    expect(httpClient.delete).toHaveBeenCalledWith('/api/v1/kitchens/me/photos/KITCHEN', {signal: undefined});
  });

  it('saves a face with PUT /api/v1/kitchens/me/chef-avatar', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue(
      kitchen({chefPhotoUrl: 'https://media.example.test/public/chef-avatars/chef-avatar-04.jpg'}),
    );

    await expect(chefProfileApi.setAvatar('chef-avatar-04')).resolves.toMatchObject({
      chefPhotoUrl: 'https://media.example.test/public/chef-avatars/chef-avatar-04.jpg',
    });
    expect(httpClient.put).toHaveBeenCalledWith(
      '/api/v1/kitchens/me/chef-avatar',
      {avatarId: 'chef-avatar-04'},
      {signal: undefined},
    );
  });
});
