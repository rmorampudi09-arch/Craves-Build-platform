import React from 'react';
import {StyleSheet} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {touchTarget} from '../../../design/tokens';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {EMPTY_ONBOARDING} from '../../chefOnboarding/api/chefOnboardingApi';
import {ChefCard, ChefToastProvider} from '../../chefShell/components/ui';
import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {switchChefToCustomerRole} from '../state/chefProfileRoleSwitch';
import {deferred, screenQueries} from '../testing/screenTestKit';
import {ChefProfileScreen} from './ChefProfileScreen';

jest.setTimeout(20_000);

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
const mockSummary = jest.fn();
const mockBank = jest.fn();
const mockOnboardingLoad = jest.fn();
let mockState: {auth: {identity: Record<string, unknown> | null; accountResolution: Record<string, unknown> | null}};
const mockKitchenState: {kitchen: ChefKitchenProfile | null; status: string; hoursToday: string | null; refresh: jest.Mock} = {
  kitchen: null,
  status: 'open',
  hoursToday: '11:00 AM – 10:00 PM',
  refresh: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mockState),
  useAppDispatch: () => mockDispatch,
}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({counters: {unreadNotifications: 2}}),
}));
jest.mock('../state/useKitchenOpenState', () => ({useKitchenOpenState: () => mockKitchenState}));
jest.mock('../../auth/state/logoutCoordinator', () => ({completeLogout: jest.fn()}));
jest.mock('../state/chefProfileRoleSwitch', () => ({switchChefToCustomerRole: jest.fn()}));
jest.mock('../../chefBankOnboarding/api/chefBankOnboardingApi', () => ({
  chefBankOnboardingApi: {getStatus: (...args: unknown[]) => mockBank(...args)},
}));
jest.mock('../../chefOnboarding/api/chefOnboardingApi', () => ({
  ...jest.requireActual('../../chefOnboarding/api/chefOnboardingApi'),
  chefOnboardingApi: {load: (...args: unknown[]) => mockOnboardingLoad(...args)},
}));
jest.mock('../../reviews/api/chefReviewsApi', () => ({chefReviewsApi: {summary: (...args: unknown[]) => mockSummary(...args)}}));

const KITCHEN: ChefKitchenProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
  kitchenName: 'Relangi mavayya kitchen',
  displayName: 'Relangi',
  description: null,
  phoneNumber: null,
  email: null,
  addressLine1: '5-67, Lane 16, KPHB',
  addressLine2: null,
  landmark: null,
  areaName: 'KPHB',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500085',
  latitude: null,
  longitude: null,
  status: 'ACTIVE',
  createdAt: '2026-08-01T07:00:00Z',
  updatedAt: '2026-08-09T08:00:00Z',
};

let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefProfileScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

describe('ChefProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = {
      auth: {
        identity: {id: 'user-1', displayName: 'Relangi', roles: ['CHEF', 'CUSTOMER'], status: 'ACTIVE'},
        accountResolution: {flow: 'CHEF', onboardingStatus: 'APPROVED'},
      },
    };
    mockKitchenState.kitchen = KITCHEN;
    mockKitchenState.status = 'open';
    mockKitchenState.hoursToday = '11:00 AM – 10:00 PM';
    mockSummary.mockResolvedValue({kitchenId: KITCHEN.id, reviewCount: 32, overallAverage: 4.6});
    mockBank.mockResolvedValue({state: 'VERIFIED', lastFour: '4521', bankName: 'SBI'});
    mockOnboardingLoad.mockResolvedValue({
      details: {...EMPTY_ONBOARDING, proofKind: 'AADHAAR', fssaiNumber: '12345678901234'},
      documents: [{id: 'd1', documentType: 'SELECTED_PROOF_FRONT', status: 'APPROVED'}],
    });
    jest.mocked(switchChefToCustomerRole).mockResolvedValue(undefined);
    jest.mocked(completeLogout).mockResolvedValue(undefined);
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows the kitchen, who runs it, where, and whether Craves approved it', async () => {
    await mount();
    expect(ui.has('Profile')).toBe(true);
    expect(ui.has('Relangi mavayya kitchen')).toBe(true);
    expect(ui.has('Chef Relangi · KPHB, Hyderabad')).toBe(true);
    expect(ui.has('Approved')).toBe(true);
    expect(ui.has('★ 4.6 · 32 reviews')).toBe(true);
    expect(ui.has('Craves for Chefs · version 1.35.0')).toBe(true);
  });

  it('groups the rows as Kitchen, Money and More, each with its short line', async () => {
    await mount();
    for (const heading of ['Kitchen', 'Money', 'More']) {
      expect(ui.has(heading)).toBe(true);
    }
    expect(ui.byPrefix('Kitchen details')?.props.accessibilityLabel).toBe('Kitchen details, Name, about, address, photos');
    expect(ui.byPrefix('Opening hours')?.props.accessibilityLabel).toBe('Opening hours, Open now · 11:00 AM – 10:00 PM');
    expect(ui.byPrefix('Documents & verification')?.props.accessibilityLabel).toBe('Documents & verification, Verified · FSSAI, Aadhaar');
    expect(ui.byPrefix('Bank account')?.props.accessibilityLabel).toBe('Bank account, SBI ••4521');
    expect(ui.byPrefix('Reviews')?.props.accessibilityLabel).toBe('Reviews, 4.6 average · 32 reviews');
    expect(ui.byPrefix('Refer a chef')?.props.accessibilityLabel).toBe('Refer a chef, Earn when chefs you invite start cooking');
    expect(ui.byPrefix('Preferences')?.props.accessibilityLabel).toBe('Preferences, Notifications, orders, language');
    // The old Live summary, Business status, Scheduled orders and Subscription plan rows are gone from here.
    expect(ui.anyText(/Live summary|Business status|Scheduled orders|Subscription plan/)).toBe(false);
  });

  it.each([
    ['Kitchen details', 'ChefEditProfile'],
    ['Opening hours', 'ChefKitchenSchedule'],
    ['Documents & verification', 'ChefBusinessInformation'],
    ['Reviews', 'ChefReviews'],
    ['Bank account', 'ChefBankAccount'],
    ['Payout history', 'ChefPayoutHistory'],
    ['Refer a chef', 'ChefReferral'],
    ['Preferences', 'ChefAppPreferences'],
    ['Help & support', 'ChefSupport'],
    ['Login & security', 'ChefSecurity'],
  ])('opens %s', async (label, route) => {
    await mount();
    await ui.press(label);
    expect(mockNavigate).toHaveBeenCalledWith(route);
  });

  it('opens Documents from the Approved chip, Reviews from the rating chip, and Kitchen details from the camera', async () => {
    await mount();
    await ui.press('Approved. Open documents');
    expect(mockNavigate).toHaveBeenLastCalledWith('ChefBusinessInformation');
    await ui.press('4.6 stars, 32 reviews. Open reviews');
    expect(mockNavigate).toHaveBeenLastCalledWith('ChefReviews');
    await ui.press('Change your photo');
    expect(mockNavigate).toHaveBeenLastCalledWith('ChefEditProfile');
  });

  it('has no Documents page for an approved chef with no application documents, and shows the bank by its last digits when it has no name', async () => {
    mockOnboardingLoad.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    mockBank.mockResolvedValue({state: 'VERIFIED', lastFour: '4521', bankName: null});
    await mount();
    expect(ui.byPrefix('Documents & verification')).toBeUndefined();
    expect(ui.has('Approved')).toBe(true);
    expect(ui.byLabel('Approved. Open documents')).toBeUndefined();
    expect(ui.byPrefix('Bank account')?.props.accessibilityLabel).toBe('Bank account, ••4521');
  });

  it('leaves the Bank account line empty when no account is on file or it cannot be read', async () => {
    mockBank.mockResolvedValue({state: 'NOT_SUBMITTED', lastFour: null, bankName: null});
    await mount();
    expect(ui.byPrefix('Bank account')?.props.accessibilityLabel).toBe('Bank account');
    act(() => tree.unmount());
    mockBank.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(ui.byPrefix('Bank account')?.props.accessibilityLabel).toBe('Bank account');
  });

  it('makes the camera and the two chips themselves at least 48 dp, inside parents that are not smaller (hit slop is clipped to the parent)', async () => {
    await mount();
    const own = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style) ?? {};
    const size = (node: ReactTestInstance, axis: 'width' | 'height') => {
      const style = own(node);
      const value = axis === 'width' ? [style.width, style.minWidth] : [style.height, style.minHeight];
      return Math.max(...value.filter((entry): entry is number => typeof entry === 'number'), 0);
    };
    for (const label of ['Change your photo', 'Approved. Open documents', '4.6 stars, 32 reviews. Open reviews']) {
      const tap = ui.byLabel(label)!;
      expect(tap.props.hitSlop).toBeUndefined();
      expect(size(tap, 'width')).toBeGreaterThanOrEqual(touchTarget.minimum);
      expect(size(tap, 'height')).toBeGreaterThanOrEqual(touchTarget.minimum);

      // Every ancestor up to the identity card with a fixed size must hold the whole tap square.
      const style = own(tap);
      let parent = tap.parent;
      let direct = true;
      while (parent && parent.type !== ChefCard) {
        const fixed = own(parent);
        if (typeof fixed.height === 'number') {
          expect(fixed.height).toBeGreaterThanOrEqual(direct ? (Number(style.top) || 0) + size(tap, 'height') : size(tap, 'height'));
        }
        if (typeof fixed.width === 'number') {
          expect(fixed.width).toBeGreaterThanOrEqual(direct ? (Number(style.left) || 0) + size(tap, 'width') : size(tap, 'width'));
        }
        if (direct && style.position === 'absolute') {
          expect(Number(style.left)).toBeGreaterThanOrEqual(0);
          expect(Number(style.top)).toBeGreaterThanOrEqual(0);
        }
        direct = false;
        parent = parent.parent;
      }
      expect(parent?.type).toBe(ChefCard);
    }
  });

  it('describes the opening hours for each kitchen state without showing a raw status', async () => {
    mockKitchenState.status = 'closed';
    await mount();
    expect(ui.byPrefix('Opening hours')?.props.accessibilityLabel).toBe('Opening hours, Closed · 11:00 AM – 10:00 PM');
    act(() => tree.unmount());
    mockKitchenState.status = 'paused';
    mockKitchenState.hoursToday = null;
    await mount();
    expect(ui.byPrefix('Opening hours')?.props.accessibilityLabel).toBe('Opening hours, Paused');
    act(() => tree.unmount());
    mockKitchenState.status = 'suspended';
    await mount();
    expect(ui.byPrefix('Opening hours')?.props.accessibilityLabel).toBe('Opening hours, Paused by Craves');
    expect(ui.has('Paused by Craves')).toBe(true);
    expect(ui.has('Approved')).toBe(false);
  });

  it('leaves out the Approved chip until Craves approves the kitchen, and the rating while reviews are not published', async () => {
    mockState.auth.accountResolution = {flow: 'CHEF', onboardingStatus: 'PENDING'};
    mockSummary.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(ui.has('Approved')).toBe(false);
    expect(ui.anyText(/★/)).toBe(false);
    expect(ui.byPrefix('Reviews')?.props.accessibilityLabel).toBe('Reviews, What customers say');
    expect(ui.byPrefix('Documents & verification')?.props.accessibilityLabel).toBe('Documents & verification, See your documents');
  });

  it('shows the account name until the kitchen has loaded', async () => {
    mockKitchenState.kitchen = null;
    mockKitchenState.status = 'unknown';
    await mount();
    expect(ui.has('Relangi')).toBe(true);
  });

  it('asks before switching to customer mode, and only switches when confirmed', async () => {
    await mount();
    await ui.press('Switch to customer mode');
    expect(ui.has('Switch to customer mode?')).toBe(true);
    // The chef has to know that in customer mode nobody tells them about a new order.
    expect(ui.has("Your kitchen stays open, but you won't see new orders while you are in customer mode.")).toBe(true);
    expect(switchChefToCustomerRole).not.toHaveBeenCalled();

    await ui.press('Cancel');
    expect(switchChefToCustomerRole).not.toHaveBeenCalled();

    await ui.press('Switch to customer mode');
    await ui.press('Switch');
    await ui.settle();
    expect(switchChefToCustomerRole).toHaveBeenCalledWith(mockDispatch);
  });

  it('says so, instead of switching, when the account has no customer side', async () => {
    mockState.auth.identity = {id: 'user-1', displayName: 'Relangi', roles: ['CHEF'], status: 'ACTIVE'};
    await mount();
    await ui.press('Switch to customer mode');
    expect(ui.has('Switch to customer mode?')).toBe(false);
    expect(ui.has("Customer mode isn't set up for this account.")).toBe(true);
  });

  it('keeps the chef where they are and says so when switching fails', async () => {
    jest.mocked(switchChefToCustomerRole).mockRejectedValue(new Error('isolation failed'));
    await mount();
    await ui.press('Switch to customer mode');
    await ui.press('Switch');
    await ui.settle();
    expect(ui.has("We couldn't switch just now. Please try again.")).toBe(true);
    expect(ui.anyText(/isolation/)).toBe(false);
  });

  it('asks before logging out, and logs out once even when the button is pressed twice', async () => {
    const pending = deferred<void>();
    jest.mocked(completeLogout).mockReturnValue(pending.promise);
    await mount();
    await ui.press('Log out');
    expect(ui.has('Log out of Craves?')).toBe(true);
    expect(completeLogout).not.toHaveBeenCalled();

    await ui.press('Cancel');
    expect(completeLogout).not.toHaveBeenCalled();

    await ui.press('Log out');
    await ui.pressLast('Log out');
    await ui.pressLast('Log out');
    expect(completeLogout).toHaveBeenCalledTimes(1);
    expect(completeLogout).toHaveBeenCalledWith(mockDispatch);
    await act(async () => pending.resolve());
  });

  it('says so, plainly, when logging out fails', async () => {
    jest.mocked(completeLogout).mockRejectedValue(new Error('storage'));
    await mount();
    await ui.press('Log out');
    await ui.pressLast('Log out');
    await ui.settle();
    expect(ui.has("We couldn't log you out. Please try again.")).toBe(true);
  });
});
