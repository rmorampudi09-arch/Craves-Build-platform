import React from 'react';
import {StatusBar} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {CustomerKitchenProfileScreen} from './CustomerKitchenProfileScreen';

let mockStripVisible: boolean;

function mockStub() {
  return new Proxy({__esModule: true} as Record<string, unknown>, {
    get: (target, key) => (key in target ? target[key as string] : () => null),
  });
}
jest.mock('../../accountDeletion/state/useDeletionStripVisible', () => ({useDeletionStripVisible: () => mockStripVisible}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
  useRoute: () => ({params: {kitchenId: 'k1'}}),
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (state: unknown) => unknown) => select({cart: {snapshot: null, mutations: {}}}),
}));
jest.mock('../query/kitchenProfileQueries', () => ({
  useCustomerKitchenProfileQuery: () => ({
    data: {
      id: 'k1',
      kitchenName: 'Amma Kitchen',
      displayName: null,
      biography: null,
      location: {areaName: 'Indiranagar', city: 'Bengaluru', state: null},
      joinedAt: null,
      chefPhotoUrl: null,
      kitchenPhotoUrls: ['https://example.com/a.jpg'],
      menuItems: [],
    },
    error: null,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useCustomerKitchenAvailabilityQuery: () => ({available: false, data: null, refetch: jest.fn()}),
}));
jest.mock('../../favorites/query/customerFavoritesQueries', () => ({
  useCustomerFavoritesQuery: () => ({}),
  useToggleCustomerFavorite: () => ({}),
  isFavoriteMenuItem: () => false,
}));
jest.mock('../../favorites/query/homeFavoriteQueries', () => ({
  useFavoriteKitchensQuery: () => ({items: []}),
  useToggleFavoriteKitchen: () => ({}),
}));
jest.mock('../../reviews/api/publicKitchenReviewsApi', () => ({PUBLIC_KITCHEN_REVIEWS_AVAILABLE: false, publicKitchenReviewsApi: {}}));
jest.mock('expo-blur', () => ({BlurTargetView: require('react-native').View}));
jest.mock('react-native-svg', () => mockStub());
jest.mock('../../cart/components/KitchenSwitchDialog', () => ({askKitchenSwitch: jest.fn()}));
jest.mock('../../cart/components/FloatingCartButton', () => mockStub());
jest.mock('../../customerShell/components/CustomerChefFace', () => mockStub());
jest.mock('../../home/components/KitchenImageCarousel', () => mockStub());
jest.mock('../../favorites/components/CustomerFavoriteHeartButton', () => mockStub());
jest.mock('../components/CustomerKitchenMenuCard', () => mockStub());
jest.mock('../../../shared/components/LiquidGlassSurface', () => ({LiquidGlassSurface: require('react-native').View}));

let tree: renderer.ReactTestRenderer;
const barStyle = () => tree.root.findByType(StatusBar).props.barStyle;

function mount() {
  act(() => {
    tree = renderer.create(<CustomerKitchenProfileScreen />);
  });
}

describe('CustomerKitchenProfileScreen status bar', () => {
  afterEach(() => act(() => tree.unmount()));

  it('goes light over the kitchen photo', () => {
    mockStripVisible = false;
    mount();
    expect(barStyle()).toBe('light-content');
  });

  it('turns dark when the strip appears while the page is open', () => {
    mockStripVisible = false;
    mount();
    mockStripVisible = true;
    act(() => tree.update(<CustomerKitchenProfileScreen />));
    expect(barStyle()).toBe('dark-content');
  });

  it('stays dark while the delete-request strip covers the status bar', () => {
    mockStripVisible = true;
    mount();
    expect(barStyle()).toBe('dark-content');
  });
});
