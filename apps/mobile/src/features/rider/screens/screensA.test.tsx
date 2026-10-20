// Screens 1–8 of "Rider app P1: screens to the design": every state of sign-in, account status, terms,
// phone setup, home, go online and the offer.
import React from 'react';
import {AccessibilityInfo, Alert, StyleSheet, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {RiderOtpScreen} from '../../../app/rider/signIn/RiderOtpScreen';
import {RiderPhoneScreen} from '../../../app/rider/signIn/RiderPhoneScreen';
import * as ImagePicker from 'expo-image-picker';
import type {HomeSummary, Offer, RiderMe, RiderProfile, Terms} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {riderDevice, type DeviceState} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
import {RiderShellContext} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {RiderStringsProvider} from '../strings/StringsProvider';
import {AccountStatusScreen} from './AccountStatusScreen';
import {GoOnlineScreen} from './GoOnlineScreen';
import {HomeScreen} from './HomeScreen';
import {OfferScreen} from './OfferScreen';
import {phoneBrand, PhoneSetupScreen} from './PhoneSetupScreen';
import {TermsScreen} from './TermsScreen';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popTo: jest.fn()};
const mockSession = {beginPhone: jest.fn(async (_phone: string) => undefined), confirmOtp: jest.fn(async (_code: string) => undefined)};

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('../../../app/rider/useRiderSession', () => ({useRiderSession: () => mockSession}));
jest.mock('expo-image-picker', () => ({
  CameraType: {front: 'front', back: 'back'},
  requestCameraPermissionsAsync: jest.fn(async () => ({granted: true})),
  launchCameraAsync: jest.fn(async () => ({canceled: false, assets: [{uri: 'file:///photo.jpg'}]})),
}));
jest.mock('../native/riderOnlineService', () => ({
  riderOnlineService: {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    testRing: jest.fn(async () => undefined),
    lastFix: () => undefined,
  },
}));
jest.mock('../native/riderDevice', () => ({
  riderDevice: {
    state: jest.fn(async () => null),
    locationGranted: jest.fn(async () => true),
    notificationsGranted: jest.fn(async () => true),
    requestLocation: jest.fn(async () => true),
    requestNotifications: jest.fn(async () => true),
    openBatterySettings: jest.fn(async () => true),
    openAutostartSettings: jest.fn(async () => true),
    openAppSettings: jest.fn(async () => true),
    installationId: jest.fn(async () => 'android-id-1'),
  },
}));
jest.mock('../api/riderApi', () => {
  const never = () => new Promise(() => undefined);
  return {
    idempotencyKey: jest.requireActual('../api/riderApi').idempotencyKey,
    riderApi: new Proxy({}, {get: (target: Record<string, jest.Mock>, key: string) => (target[key] ??= jest.fn(never))}),
  };
});

// The first render transforms React Native and the icon font; with a cold cache (CI) that alone can pass 5 s.
jest.setTimeout(30_000);

const me: RiderMe = {
  riderId: 'r1',
  name: 'Ravi Kumar',
  phoneMasked: '+91 ••••• •4321',
  status: 'ACTIVE',
  termsVersion: 'v1',
  acceptedTermsVersion: 'v1',
  language: 'en',
  minAppVersion: '1.0.0',
  supportPhone: '+910000000000',
  features: {payoutsEnabled: true, withdrawEnabled: false},
};
const profile: RiderProfile = {
  vehicle: {label: 'Honda Activa 6G'},
  documents: [
    {type: 'DL', label: 'Driving licence', status: 'VERIFIED'},
    {type: 'PUC', label: 'Pollution certificate (PUC)', status: 'REJECTED', reason: 'The photo is blurry.'},
    {type: 'PAN', label: 'PAN card', status: 'PENDING'},
    {type: 'BANK', label: 'Bank account (UPI ••••@okhdfc)', status: 'VERIFIED'},
  ],
};
const terms: Terms = {
  version: '2026-10-v1',
  effectiveFrom: '2026-10-19T12:00:00Z',
  summaryOfChanges: ['Waiting pay now starts after 6 free minutes.'],
  rateCardLines: [
    {label: 'Base pay, first 2 km of the drop', value: '₹40'},
    {label: 'Declining or missing an offer', value: 'Free'},
  ],
  grievanceLines: [{label: 'Craves rider support, every slot', value: '[OPS PHONE]'}],
  fullTextUrl: 'https://craves.in/rider-terms',
  draft: true,
};

const signOut = jest.fn(async () => undefined);
let tree: renderer.ReactTestRenderer;

async function render(node: React.ReactElement, seed: Array<[readonly unknown[], unknown]> = []) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  seed.forEach(([key, data]) => client.setQueryData(key, data));
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <RiderShellContext.Provider value={{riderId: 'r1', signOut}}>{node}</RiderShellContext.Provider>
      </QueryClientProvider>,
    );
  });
  return client;
}

const allText = () =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''))
    .join(' | ');
/** The Pressable with this testID, whose onPress runs the component's own guards. */
const press = (testID: string) =>
  tree.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const input = (testID: string) => tree.root.findByProps({testID});
/** Lets a rejected query settle: React Query reports results on a timer. */
const flush = () =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  });

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps unused mock*Once values; never let one leak into the next test.
  mockSession.beginPhone.mockReset().mockResolvedValue(undefined);
  mockSession.confirmOtp.mockReset().mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => tree?.unmount());
  jest.useRealTimers();
});

describe('Sign in', () => {
  const phoneProps = {route: {key: 'Phone', name: 'Phone' as const, params: undefined}, navigation: mockNavigation as never};
  const otpProps = {route: {key: 'Otp', name: 'Otp' as const, params: {phone: '+919848012345'}}, navigation: mockNavigation as never};

  it('asks for a valid number, then sends the code', async () => {
    await render(<RiderPhoneScreen {...phoneProps} />);
    expect(allText()).toContain("Craves never charges a fee, deposit or kit cost to join. Don't pay anyone who asks.");
    await act(async () => input('rider-phone-input').props.onChangeText('12345'));
    await act(async () => press('rider-send-code').props.onPress());
    expect(allText()).toContain('Enter a 10-digit mobile number.');
    expect(mockSession.beginPhone).not.toHaveBeenCalled();

    await act(async () => input('rider-phone-input').props.onChangeText('98480 12345'));
    await act(async () => press('rider-send-code').props.onPress());
    expect(mockSession.beginPhone).toHaveBeenCalledWith('+919848012345');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Otp', {phone: '+919848012345'});
  });

  it("shows the server's message when the code can't be sent", async () => {
    mockSession.beginPhone.mockRejectedValueOnce(new AppApiError('RATE_LIMITED', 'Too many tries. Wait a minute.', 429));
    await render(<RiderPhoneScreen {...phoneProps} />);
    await act(async () => input('rider-phone-input').props.onChangeText('9848012345'));
    await act(async () => press('rider-send-code').props.onPress());
    expect(allText()).toContain('Too many tries. Wait a minute.');
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it('shows the number, takes 6 digits and says when the code is wrong', async () => {
    mockSession.confirmOtp.mockRejectedValueOnce(new Error('WRONG_CODE'));
    await render(<RiderOtpScreen {...otpProps} />);
    expect(allText()).toContain('Sent by SMS to +91 98480 12345.');
    expect(press('rider-verify').props.disabled).toBe(true);
    await act(async () => input('rider-code-input').props.onChangeText('48 26 15'));
    expect(press('rider-verify').props.disabled).toBe(false);
    await act(async () => press('rider-verify').props.onPress());
    expect(mockSession.confirmOtp).toHaveBeenCalledWith('482615');
    expect(allText()).toContain('That code is wrong. Check the SMS and try again.');
    await act(async () => press('rider-change-number').props.onPress());
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('counts down before the code can be sent again', async () => {
    jest.useFakeTimers();
    await render(<RiderOtpScreen {...otpProps} />);
    expect(allText()).toContain('Resend code in 30s');
    expect(press('rider-resend').props.disabled).toBe(true);
    for (let i = 0; i < 31; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(allText()).toContain('Resend code');
    expect(press('rider-resend').props.disabled).toBe(false);
    await act(async () => press('rider-resend').props.onPress());
    expect(mockSession.beginPhone).toHaveBeenCalledWith('+919848012345');
    expect(allText()).toContain('Resend code in 30s');
  });
});

describe('Account status', () => {
  const pending = {...me, status: 'PENDING' as const};
  // Each action refreshes the list and waits for it.
  beforeEach(() => (riderApi.getProfile as jest.Mock).mockResolvedValue(profile));

  it('lists each document with its badge, and the checks still to come', async () => {
    await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, profile]]);
    const text = allText();
    expect(text).toContain('Your sign-up is being checked');
    expect(text).toContain('Not active yet');
    expect(text).toContain('Driving licence | Accepted');
    expect(text).toContain('Pollution certificate (PUC) | Not accepted | The photo is blurry.');
    expect(text).toContain('PAN card | Checking');
    expect(text).toContain('Name matches');
    expect(text).toContain('Background check in progress');
    expect(text).toContain('Then: training and a ride-along');
    expect(press('rider-upload-DL')).toBeUndefined();
    await act(async () => press('rider-sign-out').props.onPress());
    expect(signOut).toHaveBeenCalled();
  });

  it('takes a new photo with the back camera and sends it', async () => {
    const client = await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, profile]]);
    (riderApi.uploadDocument as jest.Mock).mockResolvedValueOnce(undefined);
    const refetch = jest.spyOn(client, 'invalidateQueries');
    await act(async () => press('rider-upload-PUC').props.onPress());
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({cameraType: 'back'}));
    expect(riderApi.uploadDocument).toHaveBeenCalledWith('PUC', 'file:///photo.jpg');
    expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.profile});
  });

  it('asks for the camera when it is denied, and never uploads', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({granted: false});
    await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, profile]]);
    await act(async () => press('rider-upload-PUC').props.onPress());
    expect(Alert.alert).toHaveBeenCalledWith('Allow the camera to take a photo of the document.', undefined, expect.any(Array));
    expect(riderApi.uploadDocument).not.toHaveBeenCalled();
  });

  it('shows the server message when the upload fails', async () => {
    (riderApi.uploadDocument as jest.Mock).mockRejectedValueOnce(new AppApiError('TOO_LARGE', 'That photo is too large.', 413));
    await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, profile]]);
    await act(async () => press('rider-upload-PUC').props.onPress());
    expect(Alert.alert).toHaveBeenCalledWith('That photo is too large.');
  });

  it('offers a retry when the documents cannot load', async () => {
    (riderApi.getProfile as jest.Mock).mockRejectedValueOnce(new AppApiError('HTTP_500', 'down', 500));
    await render(<AccountStatusScreen />, [[riderKeys.me, pending]]);
    await flush();
    expect(allText()).toContain("Couldn't load your documents.");
    expect(press('rider-call-support')).toBeTruthy();
  });

  it('explains a paused account with the reason and how to appeal', async () => {
    await render(<AccountStatusScreen />, [
      [riderKeys.me, {...me, status: 'SUSPENDED', statusReason: 'A safety report is being reviewed.'}],
    ]);
    const text = allText();
    expect(text).toContain('Your account is paused');
    expect(text).toContain('A safety report is being reviewed.');
    expect(text).toContain('Disagree?');
    expect(text).not.toContain('Background check');
  });

  it('asks for an update when the app is too old', async () => {
    await render(<AccountStatusScreen />, [[riderKeys.me, {...me, minAppVersion: '9.0.0'}]]);
    expect(allText()).toContain('Update the app to continue');
    expect(allText()).not.toContain('Disagree?');
  });
});

describe('Terms', () => {
  const props = (mode: 'accept' | 'view') => ({
    route: {key: 'Terms', name: 'Terms' as const, params: {mode}},
    navigation: mockNavigation as never,
  });
  const firstTime = {...me, termsVersion: '2026-10-v1', acceptedTermsVersion: undefined};

  it('shows the version, the draft badge, the rate card and how pay works, then accepts that version', async () => {
    const client = await render(<TermsScreen {...props('accept')} />, [[riderKeys.terms, terms], [riderKeys.me, firstTime]]);
    const text = allText();
    expect(text).toContain('Version 2026-10-v1, in force from 19 Oct');
    expect(text).toContain('Draft pricing, not final');
    expect(text).toContain('Base pay, first 2 km of the drop | ₹40');
    expect(text).toContain('at least 14 days before it starts');
    expect(text).toContain("How you're paid");
    expect(text).toContain('Complaints and appeals');
    expect(text).not.toContain('What changed');
    (riderApi.acceptTerms as jest.Mock).mockResolvedValueOnce(undefined);
    const refetch = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await act(async () => press('rider-terms-accept').props.onPress());
    expect(riderApi.acceptTerms).toHaveBeenCalledWith('2026-10-v1');
    expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.me});
  });

  it('shows what changed to a rider who accepted an older version', async () => {
    await render(<TermsScreen {...props('accept')} />, [[riderKeys.terms, {...terms, draft: false}], [riderKeys.me, me]]);
    expect(allText()).toContain('What changed | Waiting pay now starts after 6 free minutes.');
    expect(allText()).not.toContain('Draft pricing, not final');
  });

  it("says why accepting failed and reloads the terms", async () => {
    (riderApi.acceptTerms as jest.Mock).mockRejectedValueOnce(new AppApiError('TERMS_CHANGED', 'The terms changed again.', 409));
    const client = await render(<TermsScreen {...props('accept')} />, [[riderKeys.terms, terms], [riderKeys.me, firstTime]]);
    const refetch = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await act(async () => press('rider-terms-accept').props.onPress());
    expect(Alert.alert).toHaveBeenCalledWith('The terms changed again.');
    expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.terms});
  });

  it('only reads in view mode', async () => {
    await render(<TermsScreen {...props('view')} />, [[riderKeys.terms, terms], [riderKeys.me, me]]);
    expect(press('rider-terms-accept')).toBeUndefined();
    expect(press('rider-terms-full')).toBeTruthy();
  });

  it('switches the app language from the chips', async () => {
    await render(
      <RiderStringsProvider>
        <TermsScreen {...props('view')} />
      </RiderStringsProvider>,
      [[riderKeys.terms, terms], [riderKeys.me, me]],
    );
    const chip = (code: string) => press(`rider-language-${code}`);
    expect(chip('en').props.accessibilityState).toEqual({checked: true});
    expect(allText()).toContain('తెలుగు');
    await act(async () => chip('te').props.onPress());
    expect(chip('te').props.accessibilityState).toEqual({checked: true});
    expect(chip('en').props.accessibilityState).toEqual({checked: false});
  });

  it('offers a retry when the terms cannot load', async () => {
    (riderApi.getTerms as jest.Mock).mockRejectedValueOnce(new AppApiError('HTTP_500', 'down', 500));
    await render(<TermsScreen {...props('accept')} />, [[riderKeys.me, firstTime]]);
    await flush();
    expect(allText()).toContain('Something went wrong. Try again.');
    expect(allText()).toContain('Try again');
  });
});

describe('Phone setup', () => {
  const props = {route: {key: 'PhoneSetup', name: 'PhoneSetup' as const, params: undefined}, navigation: mockNavigation as never};
  const device = (manufacturer: string): DeviceState => ({
    manufacturer,
    ignoringBatteryOptimizations: true,
    powerSaveMode: false,
    locationEnabled: true,
    notificationsEnabled: true,
  });

  it('knows each phone family', () => {
    expect(['Xiaomi', 'redmi', 'POCO'].map(phoneBrand)).toEqual(['xiaomi', 'xiaomi', 'xiaomi']);
    expect(['oppo', 'realme', 'OnePlus'].map(phoneBrand)).toEqual(['coloros', 'coloros', 'coloros']);
    expect(['vivo', 'iQOO'].map(phoneBrand)).toEqual(['vivo', 'vivo']);
    expect(['samsung', 'motorola', undefined].map(phoneBrand)).toEqual(['samsung', 'other', 'other']);
  });

  it('counts what is done and shows the steps for this phone', async () => {
    (riderDevice.state as jest.Mock).mockResolvedValueOnce(device('xiaomi'));
    await render(<PhoneSetupScreen {...props} />);
    const text = allText();
    expect(text).toContain('3 of 6 done');
    expect(text).toContain('On your Xiaomi: open Security, then Permissions, then Autostart, and turn on Craves Rider.');
    expect(text).toContain('Open recent apps, press and hold the Craves Rider card, then tap the lock.');
    expect(text).not.toContain('Allow location');
    await act(async () => tree.root.findByProps({label: "I've locked it"}).props.onPress());
    expect(allText()).toContain('4 of 6 done');
  });

  it('uses the Samsung steps on a Samsung', async () => {
    (riderDevice.state as jest.Mock).mockResolvedValueOnce(device('samsung'));
    await render(<PhoneSetupScreen {...props} />);
    expect(allText()).toContain('On your Samsung: open Settings, then Battery, then Background usage limits');
    expect(allText()).toContain('tap the Craves Rider icon above its card, then tap Keep open.');
  });

  it('opens the app settings when location was refused for good', async () => {
    (riderDevice.locationGranted as jest.Mock).mockResolvedValueOnce(false);
    (riderDevice.requestLocation as jest.Mock).mockResolvedValueOnce(false);
    await render(<PhoneSetupScreen {...props} />);
    expect(allText()).toContain('Tap the button and allow location while using the app.');
    await act(async () => tree.root.findByProps({label: 'Allow location'}).props.onPress());
    expect(riderDevice.openAppSettings).toHaveBeenCalled();
  });

  it('rings the phone, then marks the test done when the rider says it rang', async () => {
    await render(<PhoneSetupScreen {...props} />);
    await act(async () => tree.root.findByProps({label: 'Ring my phone'}).props.onPress());
    expect(riderOnlineService.testRing).toHaveBeenCalled();
    const [question, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(question).toBe('Did your phone ring and vibrate?');
    await act(async () => buttons[1].onPress());
    expect(allText()).toContain('Your phone rang and vibrated');
    await act(async () => press('rider-ring-again').props.onPress());
    expect(riderOnlineService.testRing).toHaveBeenCalledTimes(2);
  });

  it('goes back to the Home tab', async () => {
    await render(<PhoneSetupScreen {...props} />);
    await act(async () => press('rider-setup-home').props.onPress());
    expect(mockNavigation.popTo).toHaveBeenCalledWith('Tabs', {screen: 'Home'});
  });
});

describe('Home', () => {
  // Built in local time so the 12-hour clock reads the same in every time zone.
  const at = (hours: number) => new Date(2026, 9, 20, hours, 0).toISOString();
  const offlineHome: HomeSummary = {
    online: false,
    todayEarningsPaise: 34700,
    todayTrips: 5,
    nextSlot: {startsAt: at(19), endsAt: at(22), zoneName: 'Madhapur and Kondapur'},
    guaranteedPerHourPaise: 8000,
    restPoint: {name: "Lakshmi's Kitchen", area: 'Madhapur'},
    banner: {tone: 'warning', text: 'Heavy rain expected after 8 pm.'},
  };
  const onlineHome: HomeSummary = {
    ...offlineHome,
    online: true,
    shiftStartedAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    slotEndsAt: at(22),
    zoneName: 'Madhapur and Kondapur',
  };
  const seed = (home: HomeSummary, rider: RiderMe = me): Array<[readonly unknown[], unknown]> => [
    [riderKeys.home, home],
    [riderKeys.me, rider],
    [riderKeys.activeTrip, null],
  ];

  it('offline: the server banner, today, and the next slot with its guaranteed pay from the server', async () => {
    await render(<HomeScreen />, seed(offlineHome));
    const text = allText();
    expect(text).toContain('Hi, Ravi');
    expect(text).toContain('Heavy rain expected after 8 pm.');
    expect(text).toContain('Today | ₹347 | 5 trips');
    expect(text).toContain('Your next slot | 7:00 pm to 10:00 pm | Madhapur and Kondapur');
    expect(text).toContain("At least ₹80 an hour while you're online in this slot, even when orders are slow.");
    await act(async () => press('rider-go-online').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('GoOnline');
  });

  it('never makes up a guaranteed rate the server did not send', async () => {
    await render(<HomeScreen />, seed({...offlineHome, guaranteedPerHourPaise: undefined}));
    expect(allText()).toContain('Your next slot');
    expect(allText()).not.toContain('an hour');
  });

  it('online: the shift with paid waiting, today, the rest point, and Go offline', async () => {
    await render(<HomeScreen />, seed(onlineHome));
    const text = allText();
    expect(text).toContain('Online · waiting for orders');
    expect(text).toContain('On shift | Slot ends 10:00 pm');
    expect(tree.root.findByProps({testID: 'rider-shift-timer'}).props.children).toMatch(/^0:4[23]:\d\d$/);
    expect(text).toContain('Waiting is paid: at least ₹80 an hour in this slot.');
    expect(text).toContain("Rest point: Lakshmi's Kitchen, Madhapur");
    expect(text).toContain('Offers ring even with the screen off.');
    (riderApi.endShift as jest.Mock).mockResolvedValueOnce(undefined);
    await act(async () => press('rider-go-offline').props.onPress());
    expect(riderOnlineService.stop).toHaveBeenCalled();
    expect(riderApi.endShift).toHaveBeenCalled();
  });

  it('opens the notice on its own screen', async () => {
    const notice = {title: 'Review of a delivery', reason: 'A customer says it did not arrive.', appealPhone: '+910000000000'};
    await render(<HomeScreen />, seed(offlineHome, {...me, notice}));
    expect(allText()).toContain('You have a notice | Review of a delivery');
    await act(async () => press('rider-open-notice').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Notice');
  });

  it('says when it is offline and offers a retry', async () => {
    (riderApi.getHome as jest.Mock).mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'No internet', undefined, undefined, true));
    await render(<HomeScreen />, [[riderKeys.me, me], [riderKeys.activeTrip, null]]);
    await flush();
    expect(allText()).toContain("You're offline. Changes sync when you're back online.");
    expect(press('rider-home-retry')).toBeTruthy();
    expect(press('rider-go-online').props.disabled).toBe(true);
  });
});

describe('Go online', () => {
  const props = {route: {key: 'GoOnline', name: 'GoOnline' as const, params: undefined}, navigation: mockNavigation as never};
  const shift = {shiftCredential: 'opaque', expiresAt: '2026-10-20T22:00:00Z'};

  it('explains the selfie, then starts the shift with the front-camera photo', async () => {
    (riderApi.startShift as jest.Mock).mockResolvedValueOnce(shift);
    await render(<GoOnlineScreen {...props} />);
    expect(allText()).toContain('Take off your helmet and look at the camera');
    expect(allText()).toContain("Ops checks it's you. Customers never see this photo.");
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({cameraType: 'front'}));
    expect(riderApi.startShift).toHaveBeenCalledWith('file:///photo.jpg', 'android-id-1');
    expect(riderOnlineService.start).toHaveBeenCalledWith(shift);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('asks for the camera when it is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({granted: false});
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(allText()).toContain('Allow the camera to take the selfie.');
    expect(allText()).toContain('Open settings');
    expect(riderApi.startShift).not.toHaveBeenCalled();
  });

  it('stays put when the rider backs out of the camera', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({canceled: true, assets: null});
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(riderApi.startShift).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it("shows the server's reason when it refuses the shift", async () => {
    (riderApi.startShift as jest.Mock).mockRejectedValueOnce(
      new AppApiError('DOCUMENTS_EXPIRED', 'Your vehicle insurance has expired. Upload the new policy first.', 403),
    );
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(allText()).toContain('Your vehicle insurance has expired. Upload the new policy first.');
    expect(riderOnlineService.start).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(press('rider-selfie-shutter')).toBeTruthy();
  });

  it("shows the server's message when this phone isn't the rider's bound phone", async () => {
    (riderApi.startShift as jest.Mock).mockRejectedValueOnce(
      new AppApiError('DEVICE_NOT_BOUND', "This phone isn't approved yet. Call rider support to approve it.", 409),
    );
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(allText()).toContain("This phone isn't approved yet. Call rider support to approve it.");
    expect(riderOnlineService.start).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('closes without going online', async () => {
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-go-online-close').props.onPress());
    expect(mockNavigation.goBack).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });
});

describe('Offer', () => {
  const offer: Offer = {
    offerId: 'o1',
    tripId: 't1',
    expiresAt: '2026-10-20T10:00:40Z',
    expiresInSec: 40,
    payPaise: 6700,
    pickupDistanceM: 2000,
    dropDistanceM: 4000,
    kitchenArea: 'Madhapur',
    customerLocality: 'Kondapur',
    estMinutes: 28,
    payLines: [
      {label: 'base', amountPaise: 4000},
      {label: 'drop distance', amountPaise: 1800},
      {label: 'ride to the kitchen', amountPaise: 900},
    ],
  };
  const props = (received = Date.now()) => ({
    route: {key: 'Offer', name: 'Offer' as const, params: {offer, receivedAtMs: received}},
    navigation: mockNavigation as never,
  });

  it('puts the locked pay first, in one sentence with its parts, then distances and the route', async () => {
    // Fake timers hold the clock, so a slow render cannot take seconds off the 40 s countdown.
    jest.useFakeTimers();
    await render(<OfferScreen {...props()} />);
    const text = allText();
    expect(text).toContain('New order | 40s left | You get at least | ₹67');
    expect(text).toContain('₹40 base + ₹18 drop distance + ₹9 ride to the kitchen. Locked once you accept.');
    expect(text).toContain('To the kitchen | 2.0 km | Kitchen to customer | 4.0 km');
    expect(text).toContain('About 28 min in total');
    expect(text).toContain('Declining is free and never affects your future offers.');
    const pay = tree.root.findByProps({testID: 'rider-offer-pay'});
    expect(StyleSheet.flatten(pay.props.style)).toMatchObject({fontSize: 72, fontWeight: '900'});
    expect(pay.props.adjustsFontSizeToFit).toBe(true);
    expect(tree.root.findByProps({accessibilityLabel: 'Madhapur to Kondapur'})).toBeTruthy();
  });

  it('declines for free and closes', async () => {
    (riderApi.declineOffer as jest.Mock).mockResolvedValueOnce(undefined);
    await render(<OfferScreen {...props()} />);
    await act(async () => press('rider-offer-decline').props.onPress());
    expect(riderApi.declineOffer).toHaveBeenCalledWith('o1', 'rider-decline-o1-r1');
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('tells TalkBack the time at 30, 20, 10 and 5 seconds only', async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(<OfferScreen {...props()} />);
    for (let i = 0; i < 36; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(announce.mock.calls.map(([message]) => message)).toEqual(['30s left', '20s left', '10s left', '5s left']);
    announce.mockRestore();
  });

  it('says the offer expired when the server says so, and hides the buttons', async () => {
    (riderApi.acceptOffer as jest.Mock).mockRejectedValueOnce(new AppApiError('OFFER_EXPIRED', 'expired', 410));
    await render(<OfferScreen {...props()} />);
    await act(async () => press('rider-offer-accept').props.onPress());
    expect(allText()).toContain('Offer expired');
    expect(press('rider-offer-accept')).toBeUndefined();
  });

  it('shows just the lock when the server sends no breakdown', async () => {
    await render(<OfferScreen {...props()} route={{key: 'Offer', name: 'Offer', params: {offer: {...offer, payLines: []}, receivedAtMs: Date.now()}}} />);
    expect(allText()).toContain('₹67 | Locked once you accept.');
  });
});
