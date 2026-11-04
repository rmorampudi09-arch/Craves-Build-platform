import React from 'react';
import {StatusBar} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {CustomerHomeScreen} from './CustomerHomeScreen';

let mockStripVisible: boolean;

// Only the Home screen's own status bar choice matters here, so everything around it is stubbed.
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
  useNavigation: () => ({navigate: jest.fn()}),
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
}));
jest.mock('@tanstack/react-query', () => ({useQueryClient: () => ({})}));
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({
      auth: {identity: {id: 'u1'}},
      customerShell: {selectedLocation: null},
      cart: {snapshot: null, mutations: {}},
      discoveryFilters: require('../../discoveryFilters/state/discoveryFilterSlice').discoveryFilterReducer(undefined, {type: 'init'}),
    }),
}));
jest.mock('../../../app/navigation/CustomerBottomNavController', () => ({useCustomerBottomNavScroll: () => ({onScroll: jest.fn()})}));
jest.mock('../../customerShell/hooks/useCustomerHeaderState', () => ({
  browsingLocationLabel: () => '',
  useCustomerHeaderState: () => ({}),
}));
jest.mock('../../favorites/query/customerFavoritesQueries', () => ({
  useCustomerFavoritesQuery: () => ({}),
  useToggleCustomerFavorite: () => ({}),
  isFavoriteMenuItem: () => false,
}));
jest.mock('../../dishLabels/state/nearbyDishLabels', () => ({useNearbyDishLabels: () => ({pending: false})}));
jest.mock('../../discoverySearch/hooks/useDiscoverySearchSession', () => ({
  useDiscoverySearchSession: () => ({query: '', draft: '', scrollOffset: 0}),
}));
jest.mock('../query/homeFeedQueries', () => ({
  useHomeNearbyDishesQuery: () => ({data: undefined, error: null, isPending: false, locationRequired: true, refetch: jest.fn(), fetchNextPage: jest.fn()}),
}));
jest.mock('../../chefDiscovery/query/nearbyChefDiscoveryQueries', () => ({
  useNearbyChefDiscoveryQuery: () => ({isSuccess: false, refetch: jest.fn()}),
}));
jest.mock('../api/launchAlertApi', () => ({launchAlertErrorText: () => '', useLaunchAlert: () => ({})}));
jest.mock('../components/HomeCategoryRail', () => ({CATEGORY_RAIL_PINNED_LIFT: 0, HomeCategoryRail: () => null}));
jest.mock('../components/HomePromoAndKitchens', () => ({TOP_KITCHENS_PAGE_SIZE: 10, HomePromoAndKitchens: () => null}));
jest.mock('../components/CloudFill', () => ({CLOUD_FILL_MS: 400, CloudFill: () => null}));
jest.mock('../components/HomeFoodTypeMenu', () => mockStub());
jest.mock('../components/HomeComingSoonPage', () => mockStub());
jest.mock('../query/homeBannerQueries', () => ({homeBannerQueryKey: []}));
jest.mock('expo-blur', () => ({BlurTargetView: require('react-native').View}));
jest.mock('react-native-svg', () => mockStub());
jest.mock('../../cart/cartFlight', () => mockStub());
jest.mock('../../cart/components/KitchenSwitchDialog', () => mockStub());
jest.mock('../../chefShell/components/ui/VegMark', () => mockStub());
jest.mock('../../customerEmptyStates/components/CustomerEmptyState', () => mockStub());
jest.mock('../../customerEmptyStates/customerEmptyStateAdapters', () => ({customerEmptyStateAdapters: {}}));
jest.mock('../../customerShell/components/CustomerHeader', () => mockStub());
jest.mock('../../customerShell/components/CustomerLocationSelector', () => mockStub());
jest.mock('../../favorites/components/CustomerFavoriteHeartButton', () => mockStub());
jest.mock('../../../shared/components/LiquidGlassSurface', () => ({LiquidGlassSurface: require('react-native').View}));

let tree: renderer.ReactTestRenderer;
let pushed: jest.SpyInstance;

function mount() {
  act(() => {
    tree = renderer.create(<CustomerHomeScreen />);
  });
}
const lastBarStyle = () => pushed.mock.calls[pushed.mock.calls.length - 1][0].barStyle;

describe('CustomerHomeScreen status bar', () => {
  beforeEach(() => {
    pushed = jest.spyOn(StatusBar, 'pushStackEntry');
  });
  afterEach(() => {
    act(() => tree.unmount());
    pushed.mockRestore();
  });

  it('goes light over the red header', () => {
    mockStripVisible = false;
    mount();
    expect(lastBarStyle()).toBe('light-content');
  });

  it('turns dark when the strip appears while Home is open, and light again when it goes', () => {
    mockStripVisible = false;
    mount();
    mockStripVisible = true;
    act(() => tree.update(<CustomerHomeScreen />));
    expect(lastBarStyle()).toBe('dark-content');
    mockStripVisible = false;
    act(() => tree.update(<CustomerHomeScreen />));
    expect(lastBarStyle()).toBe('light-content');
  });

  it('stays dark while the delete-request strip covers the status bar', () => {
    mockStripVisible = true;
    mount();
    expect(lastBarStyle()).toBe('dark-content');
  });
});
