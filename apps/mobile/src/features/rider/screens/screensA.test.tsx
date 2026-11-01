// Screens 1–8 of "Rider app P1: screens to the design": every state of sign-in, account status, terms,
// phone setup, home, go online and the offer.
import React from 'react';
import {AccessibilityInfo, Alert, AppState, BackHandler, DeviceEventEmitter, Keyboard, Linking, StyleSheet, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AxiosError} from 'axios';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {RiderOtpScreen} from '../../../app/rider/signIn/RiderOtpScreen';
import {RiderPhoneScreen} from '../../../app/rider/signIn/RiderPhoneScreen';
import * as ImagePicker from 'expo-image-picker';
import type {HomeSummary, Offer, RiderMe, RiderProfile, Terms, VehicleKind} from '../api/contract';
import {requiredDocuments} from '../domain/application';
import {riderApi} from '../api/riderApi';
import {riderDevice, type DeviceState} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
import {registerPhone} from '../components/RiderRuntime';
import {listenForSmsCode} from '../native/smsCode';
import {openAfterGate, RiderShellContext, takeAfterGate} from '../navigation';
import {ACCOUNT_EVENT, riderKeys} from '../state/riderQueries';
import {RiderStringsProvider} from '../strings/StringsProvider';
import {AccountStatusScreen} from './AccountStatusScreen';
import {GoOnlineScreen} from './GoOnlineScreen';
import {HomeScreen} from './HomeScreen';
import {OfferScreen} from './OfferScreen';
import {phoneBrand, PhoneSetupScreen} from './PhoneSetupScreen';
import {PrivacyNoticeScreen} from './PrivacyNoticeScreen';
import {TermsScreen} from './TermsScreen';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popTo: jest.fn(), isFocused: () => true};
const mockSession = {beginPhone: jest.fn(async (_phone: string) => undefined), confirmOtp: jest.fn(async (_code: string) => undefined)};

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('../../../app/rider/useRiderSession', () => ({useRiderSession: () => mockSession}));
// The real listener, watched: demo builds send no SMS, so they never wait for one.
jest.mock('../native/smsCode', () => {
  const actual = jest.requireActual('../native/smsCode');
  return {...actual, listenForSmsCode: jest.fn(actual.listenForSmsCode)};
});
jest.mock('expo-image-picker', () => ({
  CameraType: {front: 'front', back: 'back'},
  requestCameraPermissionsAsync: jest.fn(async () => ({granted: true})),
  launchCameraAsync: jest.fn(async () => ({canceled: false, assets: [{uri: 'file:///photo.jpg'}]})),
  launchImageLibraryAsync: jest.fn(async () => ({canceled: false, assets: [{uri: 'file:///gallery.png'}]})),
}));
jest.mock('../native/riderOnlineService', () => ({
  riderOnlineService: {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    testRing: jest.fn(async () => undefined),
    stopRinging: jest.fn(),
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
    openFullScreenSettings: jest.fn(async () => true),
    installationId: jest.fn(async () => 'android-id-1'),
    faces: jest.fn(async () => null),
  },
}));
// Live or demo per test; the rest of riderConfig as it is (a demo build).
let mockApiMode: 'mock' | 'live' = 'mock';
jest.mock('../riderConfig', () => ({
  ...jest.requireActual('../riderConfig'),
  get riderApiMode() {
    return mockApiMode;
  },
}));
jest.mock('../components/RiderRuntime', () => ({...jest.requireActual('../components/RiderRuntime'), registerPhone: jest.fn(async () => true)}));
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
  // A second render in one test must not leave the first mounted: its timers would fire after the suite ends.
  act(() => tree?.unmount());
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

  it('takes a number pasted or filled in with +91, 0 or spaces, and never lets Android cut it short', async () => {
    await render(<RiderPhoneScreen {...phoneProps} />);
    expect(input('rider-phone-input').props.maxLength).toBeUndefined();
    for (const typed of ['+91 98480 12345', '098480-12345', '0091 9848012345']) {
      await act(async () => input('rider-phone-input').props.onChangeText(typed));
      expect(input('rider-phone-input').props.value).toBe('9848012345');
    }
    // An extra digit typed by mistake is ignored; the number never shifts.
    await act(async () => input('rider-phone-input').props.onChangeText('91234567890'));
    expect(input('rider-phone-input').props.value).toBe('9123456789');
    await act(async () => press('rider-send-code').props.onPress());
    expect(mockSession.beginPhone).toHaveBeenCalledWith('+919123456789');
  });

  it("shows the server's message when the code can't be sent", async () => {
    mockSession.beginPhone.mockRejectedValueOnce(new AppApiError('RATE_LIMITED', 'Too many tries. Wait a minute.', 429));
    await render(<RiderPhoneScreen {...phoneProps} />);
    await act(async () => input('rider-phone-input').props.onChangeText('9848012345'));
    await act(async () => press('rider-send-code').props.onPress());
    expect(allText()).toContain('Too many tries. Wait a minute.');
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it('shows the number, checks the code as soon as 6 digits are in, and says when it is wrong', async () => {
    mockSession.confirmOtp.mockRejectedValue(new Error('WRONG_CODE'));
    await render(<RiderOtpScreen {...otpProps} />);
    expect(allText()).toContain('Sent by SMS to +91 98480 12345.');
    expect(press('rider-verify').props.disabled).toBe(true);
    expect(input('rider-code-input').props.maxLength).toBeUndefined();
    await act(async () => input('rider-code-input').props.onChangeText('48 26 15'));
    expect(mockSession.confirmOtp).toHaveBeenCalledTimes(1);
    expect(mockSession.confirmOtp).toHaveBeenCalledWith('482615');
    expect(allText()).toContain('That code is wrong. Check the SMS and try again.');
    // Verify tries the same code again; a corrected code is checked by itself.
    expect(press('rider-verify').props.disabled).toBe(false);
    await act(async () => press('rider-verify').props.onPress());
    expect(mockSession.confirmOtp).toHaveBeenCalledTimes(2);
    // A whole SMS pasted: its code, not the other numbers in it.
    await act(async () => input('rider-code-input').props.onChangeText('Order 12 is on its way. Your Craves code is 482616.'));
    expect(mockSession.confirmOtp).toHaveBeenLastCalledWith('482616');
    expect(mockSession.confirmOtp).toHaveBeenCalledTimes(3);
    // Demo build: no SMS to wait for, so no Allow sheet and no line about it.
    expect(listenForSmsCode).not.toHaveBeenCalled();
    expect(allText()).not.toContain('tap Allow');
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

describe('Account status and the application', () => {
  const pending = {...me, status: 'PENDING' as const};
  const notRider = {...me, status: 'NOT_RIDER' as const, name: ''};
  const doc = (type: string, status: RiderProfile['documents'][number]['status'], reason?: string) => ({
    type,
    label: type,
    status,
    ...(reason ? {reason} : {}),
  });
  // Still applying: two photos never sent, one sent back, one sent, and the bank proof still to send.
  const applying: RiderProfile = {
    vehicle: {label: 'Honda Activa 6G', kind: 'PETROL', regNumberMasked: 'TS08xx4821'},
    documents: [doc('DL', 'VERIFIED'), doc('PUC', 'REJECTED', 'The photo is blurry.'), doc('PAN', 'PENDING'), doc('BANK', 'MISSING')],
  };
  // Everything in, ops's turn (the bank proof was accepted early).
  const sent = (kind: VehicleKind = 'PETROL', extra: Partial<RiderProfile> = {}): RiderProfile => ({
    vehicle:
      kind === 'BICYCLE'
        ? {label: 'Bicycle', kind}
        : {label: kind === 'PETROL' ? 'Honda Activa 6G' : 'Electric two-wheeler', kind, regNumberMasked: 'TS08xx4821'},
    documents: requiredDocuments(kind).map(type => doc(type, type === 'BANK' ? 'VERIFIED' : 'PENDING')),
    payoutAccountSubmitted: 'ra****@okaxis',
    ...extra,
  });
  const none = (testID: string) => tree.root.findAll(node => node.props.testID === testID).length === 0;
  /** Opens the photo chooser: the press waits on the dialog, so it isn't awaited. */
  const addPhoto = (type: string) =>
    act(() => {
      press(`rider-upload-${type}`).props.onPress();
    });
  /** Presses a button of the last dialog by its words (the photo chooser, the camera prompt), then lets the upload settle. */
  async function answer(text: string) {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    const buttons = calls[calls.length - 1][2] as Array<{text: string; onPress?: () => void}>;
    await act(async () => buttons.find(button => button.text === text)?.onPress?.());
    await flush();
  }

  beforeEach(() => (riderApi.getProfile as jest.Mock).mockResolvedValue(applying));

  describe('a new rider applying', () => {
    it('checks the name, age and plate before anything is sent, then sends the whole sign-up from step 2', async () => {
      const client = await render(<AccountStatusScreen />, [[riderKeys.me, notRider]]);
      let text = allText();
      expect(text).toContain('Apply to ride | Not active yet');
      expect(text).toContain('Step 1 of 4 | About you');
      expect(text).toContain('Joining is free. Craves never asks for a fee, deposit or kit cost.');
      expect(input('rider-step-bar').props.accessibilityLabel).toBe('Step 1 of 4: About you');
      // Not a rider yet: GET /profile would answer 403.
      expect(riderApi.getProfile).not.toHaveBeenCalled();
      jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      await act(async () => press('rider-call-support').props.onPress());
      expect(Linking.openURL).toHaveBeenCalledWith('tel:+910000000000');

      await act(async () => press('rider-apply-next').props.onPress());
      expect(allText()).toContain('Enter your full name, as on your PAN card.');
      expect(allText()).toContain('Tick that you are 18 or older.');

      await act(async () => input('rider-join-name').props.onChangeText('  Ravi   Kumar '));
      await act(async () => press('rider-join-adult').props.onPress());
      await act(async () => press('rider-apply-next').props.onPress());
      text = allText();
      expect(text).toContain('Step 2 of 4 | Your vehicle');
      expect(text).toContain(
        'Next, you send photos of: Driving licence, Vehicle RC, Vehicle insurance, PUC certificate, PAN card, Bank proof, Selfie.',
      );

      await act(async () => input('rider-join-plate').props.onChangeText('TS 09'));
      await act(async () => press('rider-apply-next').props.onPress());
      expect(allText()).toContain('Enter the number plate as on your RC, like TS09EA1234.');
      expect(riderApi.signUp).not.toHaveBeenCalled();

      // Back keeps what was typed on step 1.
      await act(async () => press('rider-apply-back').props.onPress());
      expect(input('rider-join-name').props.value).toBe('Ravi Kumar');
      await act(async () => press('rider-apply-next').props.onPress());

      await act(async () => press('rider-join-ELECTRIC').props.onPress());
      expect(allText()).toContain('Next, you send photos of: Driving licence, Vehicle RC, Vehicle insurance, PAN card, Bank proof, Selfie.');
      (riderApi.signUp as jest.Mock).mockResolvedValueOnce(pending);
      (riderApi.getProfile as jest.Mock).mockResolvedValue({
        vehicle: {label: 'Ather 450X', kind: 'ELECTRIC', regNumberMasked: 'TS09xx1234'},
        documents: requiredDocuments('ELECTRIC').map(type => doc(type, 'MISSING')),
      });
      await act(async () => input('rider-join-plate').props.onChangeText('ts 09-ea 1234'));
      await act(async () => input('rider-join-model').props.onChangeText(' Ather  450X '));
      await act(async () => press('rider-apply-next').props.onPress());
      expect(riderApi.signUp).toHaveBeenCalledWith({
        name: 'Ravi Kumar',
        language: 'en',
        vehicleKind: 'ELECTRIC',
        vehicleRegNumber: 'TS09EA1234',
        vehicleModel: 'Ather 450X',
        adult: true,
      });
      expect(client.getQueryData(riderKeys.me)).toMatchObject({status: 'PENDING'});
      await flush();
      text = allText();
      expect(text).toContain('Step 3 of 4 | Document photos | 0 of 6 sent');
      expect(text).toContain('Driving licence | Not sent | Add photo');
      expect(text).toContain('Send all 6 photos to go on. | Next: payout account');
      expect(press('rider-apply-next').props.disabled).toBe(true);
    });

    it('needs no plate or model for a bicycle and shows a phone already in use', async () => {
      await render(<AccountStatusScreen />, [[riderKeys.me, notRider]]);
      await act(async () => input('rider-join-name').props.onChangeText('Sita Devi'));
      await act(async () => press('rider-join-adult').props.onPress());
      await act(async () => press('rider-apply-next').props.onPress());
      await act(async () => press('rider-join-BICYCLE').props.onPress());
      expect(none('rider-join-plate')).toBe(true);
      expect(none('rider-join-model')).toBe(true);
      expect(allText()).toContain('Next, you send photos of: PAN card, Bank proof, Selfie.');
      (riderApi.signUp as jest.Mock).mockRejectedValueOnce(
        new AppApiError('PHONE_IN_USE', 'This number is already a Craves rider on another account. Call rider support.', 409),
      );
      await act(async () => press('rider-apply-next').props.onPress());
      expect(riderApi.signUp).toHaveBeenCalledWith({name: 'Sita Devi', language: 'en', vehicleKind: 'BICYCLE', adult: true});
      expect(allText()).toContain('This number is already a Craves rider on another account.');
      expect(allText()).toContain('Step 2 of 4');
    });

    it('signs out from the first step', async () => {
      await render(<AccountStatusScreen />, [[riderKeys.me, notRider]]);
      expect(press('rider-apply-back')).toBeUndefined();
      await act(async () => press('rider-sign-out').props.onPress());
      expect(signOut).toHaveBeenCalled();
    });
  });

  describe('document photos', () => {
    it('lists each photo with its status, and adds one from the camera or the gallery', async () => {
      const client = await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, applying]]);
      const text = allText();
      expect(text).toContain('Step 3 of 4 | Document photos | 2 of 6 sent');
      expect(text).toContain('Driving licence | Accepted');
      expect(text).toContain('Vehicle RC | Not sent | Add photo');
      expect(text).toContain('PUC certificate | Not accepted | The photo is blurry. | Send a new photo');
      expect(text).toContain('PAN card | Sent | Change photo');
      expect(text).toContain("Bank proof | Not sent | A photo of your passbook's first page or a cancelled cheque.");
      expect(press('rider-upload-DL')).toBeUndefined();
      (riderApi.uploadDocument as jest.Mock).mockResolvedValue(undefined);
      const refetch = jest.spyOn(client, 'invalidateQueries');

      addPhoto('RC');
      expect(Alert.alert).toHaveBeenLastCalledWith('Vehicle RC', undefined, expect.any(Array), expect.objectContaining({cancelable: true}));
      await answer('Take a photo');
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({cameraType: 'back'}));
      expect(riderApi.uploadDocument).toHaveBeenCalledWith('RC', 'file:///photo.jpg');
      expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.profile});

      addPhoto('INSURANCE');
      await answer('Choose from gallery');
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({quality: 0.7}));
      expect(riderApi.uploadDocument).toHaveBeenLastCalledWith('INSURANCE', 'file:///gallery.png');

      // Cancel sends nothing.
      addPhoto('PUC');
      await answer('Cancel');
      expect(riderApi.uploadDocument).toHaveBeenCalledTimes(2);
    });

    it('takes the reference selfie live with the front camera, never from the gallery', async () => {
      const withSelfie = {...applying, documents: [...applying.documents, doc('SELFIE', 'MISSING')]};
      (riderApi.getProfile as jest.Mock).mockResolvedValue(withSelfie);
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, withSelfie]]);
      expect(allText()).toContain('2 of 7 sent');
      expect(allText()).toContain(
        'Selfie | Not sent | Face the camera with your helmet and dark glasses off. Ops compares it with the photo on your licence or PAN card, and later with your go-online selfies. Customers never see it. | Add photo',
      );
      (riderApi.uploadDocument as jest.Mock).mockResolvedValue(undefined);
      await act(async () => press('rider-upload-SELFIE').props.onPress());
      // No camera-or-gallery question: straight to the front camera.
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({cameraType: 'front', mediaTypes: ['images'], quality: 0.5});
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
      // The phone looked for the face before sending (here it can't check, so the photo goes as it is).
      expect(riderDevice.faces).toHaveBeenCalledWith('file:///photo.jpg');
      expect(riderApi.uploadDocument).toHaveBeenCalledWith('SELFIE', 'file:///photo.jpg');
    });

    it('asks for the camera when it is denied, and never uploads', async () => {
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({granted: false});
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, applying]]);
      addPhoto('PUC');
      await answer('Take a photo');
      expect(Alert.alert).toHaveBeenLastCalledWith('Allow the camera to take a photo of the document.', undefined, expect.any(Array));
      expect(riderApi.uploadDocument).not.toHaveBeenCalled();
    });

    it("shows the server's message under the photo when the upload fails", async () => {
      (riderApi.uploadDocument as jest.Mock).mockRejectedValueOnce(
        new AppApiError('DOCUMENT_FILE_INVALID', 'Send a clear JPG, PNG or PDF of the document, under 10 MB.', 422),
      );
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, applying]]);
      addPhoto('PUC');
      await answer('Take a photo');
      expect(allText()).toContain('The photo is blurry. | Send a clear JPG, PNG or PDF of the document, under 10 MB. | Send a new photo');
    });

    it('offers a retry when the application cannot load', async () => {
      (riderApi.getProfile as jest.Mock).mockRejectedValueOnce(new AppApiError('HTTP_500', 'down', 500));
      await render(<AccountStatusScreen />, [[riderKeys.me, pending]]);
      await flush();
      expect(allText()).toContain("Craves isn't answering | The problem is on our side. Try again in a minute. | Try again");
      await act(async () => press('rider-retry').props.onPress());
      expect(riderApi.getProfile).toHaveBeenCalledTimes(2);
      expect(press('rider-call-support')).toBeTruthy();
    });

    it("goes back to correct the vehicle, also with the phone's back button, keeping the plate on file", async () => {
      const backPress = jest.spyOn(BackHandler, 'addEventListener');
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, applying]]);
      const [, onBack] = backPress.mock.calls[backPress.mock.calls.length - 1];
      await act(async () => {
        expect((onBack as () => boolean)()).toBe(true);
      });
      expect(allText()).toContain('Step 2 of 4 | Your vehicle');
      expect(input('rider-join-PETROL').props.selected).toBe(true);
      expect(input('rider-join-plate').props.helperText).toBe('Leave empty to keep TS08xx4821.');
      expect(input('rider-join-model').props.value).toBe('Honda Activa 6G');
      (riderApi.signUp as jest.Mock).mockResolvedValueOnce(pending);
      await act(async () => press('rider-apply-next').props.onPress());
      expect(riderApi.signUp).toHaveBeenCalledWith({
        name: 'Ravi Kumar',
        language: 'en',
        vehicleKind: 'PETROL',
        vehicleRegNumber: '',
        vehicleModel: 'Honda Activa 6G',
        adult: true,
      });
      await flush();
      expect(allText()).toContain('Step 3 of 4 | Document photos');
      backPress.mockRestore();
    });
  });

  describe('the payout account', () => {
    it('comes once every photo is in, and sending it completes the application', async () => {
      const photosIn = sent('PETROL', {payoutAccountSubmitted: undefined});
      (riderApi.getProfile as jest.Mock).mockResolvedValue(photosIn);
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, photosIn]]);
      expect(allText()).toContain('Step 4 of 4 | Payout account');
      expect(allText()).toContain("Add a UPI ID or bank account in your own name, Ravi Kumar. We can't pay into anyone else's account.");
      expect(input('rider-payout-holder').props.value).toBe('Ravi Kumar');
      // Back to the photos, all in, and on again.
      await act(async () => press('rider-apply-back').props.onPress());
      expect(allText()).toContain('7 of 7 sent');
      expect(press('rider-apply-next').props.disabled).toBe(false);
      await act(async () => press('rider-apply-next').props.onPress());

      await act(async () => input('rider-payout-upi').props.onChangeText('not a upi'));
      await act(async () => press('rider-apply-next').props.onPress());
      expect(allText()).toContain('Enter a UPI ID like name@bank');
      expect(riderApi.submitPayoutAccount).not.toHaveBeenCalled();

      (riderApi.submitPayoutAccount as jest.Mock).mockResolvedValueOnce(undefined);
      (riderApi.getProfile as jest.Mock).mockResolvedValue(sent());
      await act(async () => input('rider-payout-upi').props.onChangeText('ravi@okaxis'));
      await act(async () => press('rider-apply-next').props.onPress());
      expect(riderApi.submitPayoutAccount).toHaveBeenCalledWith({method: 'UPI', holderName: 'Ravi Kumar', upiId: 'ravi@okaxis'});
      await flush();
      const text = allText();
      expect(text).toContain('Your application | Not active yet');
      expect(text).toContain('Application sent | Ops checks every application by hand, usually within a day.');
      expect(text).toContain('Sent ra****@okaxis. | Checking');
    });
  });

  describe('sent: ops checks it', () => {
    it('says whose turn it is, asks again when the rider comes back, and has nothing to upload', async () => {
      // The test preset's AppState is a jest mock; spying on it and restoring would drop its implementation.
      const appState = AppState.addEventListener as jest.Mock;
      (riderApi.getMe as jest.Mock).mockResolvedValue(pending);
      (riderApi.getProfile as jest.Mock).mockResolvedValue(sent());
      const client = await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, sent()]]);
      const text = allText();
      expect(text).toContain(
        // The current step shows its number in its circle.
        "Application sent | 2 | Ops checks your documents | Usually within a day | You're approved | Then you accept your pay terms, set up your phone and go online.",
      );
      expect(text).toContain('What you sent | Driving licence | Checking');
      expect(text).toContain('Bank proof | Name matches');
      expect(text).toContain('Your details | Name | Ravi Kumar');
      expect(tree.root.findAll(node => String(node.props.testID).startsWith('rider-upload-'))).toHaveLength(0);

      const refetch = jest.spyOn(client, 'invalidateQueries');
      expect(text).not.toContain('Checked at');
      await act(async () => press('rider-application-check').props.onPress());
      expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.me});
      expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.profile});
      // A check that finds nothing new still says it looked, and when.
      expect(allText()).toMatch(/Checked at \d{1,2}:\d\d [ap]m\. Ops is still checking your application\./);
      // One that couldn't look says why, never that nothing changed.
      (riderApi.getProfile as jest.Mock).mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'No internet'));
      await act(async () => press('rider-application-check').props.onPress());
      expect(allText()).toContain('No internet. Check your connection and try again.');
      expect(allText()).not.toContain('Checked at');
      refetch.mockClear();
      const [, onChange] = appState.mock.calls.find(([event]) => event === 'change')!;
      await act(async () => (onChange as (state: string) => void)('active'));
      expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.me});
      // Ops's decision arrives as a push: the app asks at once, not at its next check.
      refetch.mockClear();
      await act(async () => {
        DeviceEventEmitter.emit(ACCOUNT_EVENT);
      });
      expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.me});

      await act(async () => press('rider-sign-out').props.onPress());
      expect(signOut).toHaveBeenCalled();
    });

    it('asks again every 15 seconds while ops checks, and stops listening once the screen closes', async () => {
      jest.useFakeTimers();
      const client = await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, sent()]]);
      const refetch = jest.spyOn(client, 'invalidateQueries');
      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });
      expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.me});
      refetch.mockClear();
      act(() => tree.unmount());
      await act(async () => {
        DeviceEventEmitter.emit(ACCOUNT_EVENT);
        jest.advanceTimersByTime(15_000);
      });
      expect(refetch).not.toHaveBeenCalled();
    });

    it('registers the phone the rider applied on, so the decision reaches it (live builds only)', async () => {
      mockApiMode = 'live';
      try {
        await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, sent()]]);
        await flush();
        expect(registerPhone).toHaveBeenCalledTimes(1);
      } finally {
        mockApiMode = 'mock';
      }
      (registerPhone as jest.Mock).mockClear();
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, sent()]]);
      await flush();
      expect(registerPhone).not.toHaveBeenCalled();
    });

    it('asks for notifications while ops checks, so the decision reaches a closed app', async () => {
      (riderDevice.notificationsGranted as jest.Mock).mockResolvedValueOnce(false);
      (riderDevice.requestNotifications as jest.Mock).mockResolvedValueOnce(true);
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, sent()]]);
      await flush();
      expect(allText()).toContain("Turn on notifications and we'll tell you the moment ops decides, even with the app closed.");
      await act(async () => press('rider-application-notify-on').props.onPress());
      expect(riderDevice.requestNotifications).toHaveBeenCalled();
      expect(riderDevice.openAppSettings).not.toHaveBeenCalled();
      expect(allText()).not.toContain('Turn on notifications');
      // Refused for good: only the app's settings can turn them on.
      (riderDevice.notificationsGranted as jest.Mock).mockResolvedValueOnce(false);
      (riderDevice.requestNotifications as jest.Mock).mockResolvedValueOnce(false);
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, sent()]]);
      await flush();
      await act(async () => press('rider-application-notify-on').props.onPress());
      expect(riderDevice.openAppSettings).toHaveBeenCalled();
      // Already on: nothing to ask.
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, sent()]]);
      await flush();
      expect(allText()).not.toContain('Turn on notifications');
    });

    it('drops the pinned footer while the keyboard is up, so the forms keep the room', async () => {
      const listeners: Record<string, () => void> = {};
      const keyboard = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
        listeners[event] = listener as () => void;
        return {remove: jest.fn()} as never;
      });
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, sent()]]);
      expect(press('rider-call-support')).toBeTruthy();
      // async act: the footer's buttons, mounted again, read the reduce-motion setting inside it.
      await act(async () => listeners.keyboardDidShow());
      expect(press('rider-call-support')).toBeUndefined();
      await act(async () => listeners.keyboardDidHide());
      expect(press('rider-call-support')).toBeTruthy();
      keyboard.mockRestore();
    });

    describe('correcting the details', () => {
      const signedUp: RiderMe = {...pending, name: 'K Gopi'};

      it('changes them, warning that a new name means sending the payout account again', async () => {
        const bicycle = sent('BICYCLE', {payoutAccountSubmitted: '90****@axl'});
        const client = await render(<AccountStatusScreen />, [[riderKeys.me, signedUp], [riderKeys.profile, bicycle]]);
        expect(allText()).toContain('Your details | Name | K Gopi | App language | English | Vehicle | Bicycle');
        expect(allText()).not.toContain('Number plate |');

        await act(async () => press('rider-details-change').props.onPress());
        expect(input('rider-join-name').props.value).toBe('K Gopi');
        expect(none('rider-join-adult')).toBe(true);
        expect(none('rider-join-resend-payout')).toBe(true);
        await act(async () => input('rider-join-name').props.onChangeText('Kancharla Gopi Nishanth'));
        expect(allText()).toContain('Your payout account is in your old name. After you save, send it again in the new name.');

        // A bicycle had no plate, so a scooter needs one.
        await act(async () => press('rider-join-ELECTRIC').props.onPress());
        await act(async () => press('rider-join-submit').props.onPress());
        expect(allText()).toContain('Enter the number plate as on your RC, like TS09EA1234.');
        expect(riderApi.signUp).not.toHaveBeenCalled();

        (riderApi.signUp as jest.Mock).mockResolvedValueOnce({...signedUp, name: 'Kancharla Gopi Nishanth'});
        // The server set the old-name account aside, so it comes back to the rider.
        (riderApi.getProfile as jest.Mock).mockResolvedValue(sent('ELECTRIC', {payoutAccountSubmitted: undefined, payoutAccountReturned: true}));
        await act(async () => input('rider-join-plate').props.onChangeText('ts 08 ab 4821'));
        await act(async () => press('rider-join-submit').props.onPress());
        expect(riderApi.signUp).toHaveBeenCalledWith({
          name: 'Kancharla Gopi Nishanth',
          language: 'en',
          vehicleKind: 'ELECTRIC',
          vehicleRegNumber: 'TS08AB4821',
          adult: true,
        });
        expect(client.getQueryData(riderKeys.me)).toMatchObject({name: 'Kancharla Gopi Nishanth'});
        await flush();
        const text = allText();
        expect(text).toContain('Fix 1 thing to go on');
        expect(text).toContain('Send your payout account again. It must be in your name and match your bank proof.');
        expect(input('rider-payout-holder').props.value).toBe('Kancharla Gopi Nishanth');
      });

      it('keeps the plate on file when it is left empty, and Cancel sends nothing', async () => {
        await render(<AccountStatusScreen />, [[riderKeys.me, signedUp], [riderKeys.profile, sent()]]);
        expect(allText()).toContain('Vehicle | Honda Activa 6G | Number plate | TS08xx4821');
        await act(async () => press('rider-details-change').props.onPress());
        expect(input('rider-join-PETROL').props.selected).toBe(true);
        expect(input('rider-join-plate').props.helperText).toBe('Leave empty to keep TS08xx4821.');
        await act(async () => press('rider-join-cancel').props.onPress());
        expect(none('rider-join-name')).toBe(true);
        expect(riderApi.signUp).not.toHaveBeenCalled();

        (riderApi.signUp as jest.Mock).mockResolvedValueOnce(signedUp);
        await act(async () => press('rider-details-change').props.onPress());
        await act(async () => press('rider-join-submit').props.onPress());
        expect(riderApi.signUp).toHaveBeenCalledWith({
          name: 'K Gopi',
          language: 'en',
          vehicleKind: 'PETROL',
          vehicleRegNumber: '',
          vehicleModel: 'Honda Activa 6G',
          adult: true,
        });
      });

      it("shows the server's words when ops already checked a document or account in the old name", async () => {
        await render(<AccountStatusScreen />, [[riderKeys.me, signedUp], [riderKeys.profile, sent()]]);
        (riderApi.signUp as jest.Mock).mockRejectedValueOnce(
          new AppApiError('NAME_LOCKED', 'Ops has already checked your documents or payout account in this name. Call rider support to change it.', 422),
        );
        await act(async () => press('rider-details-change').props.onPress());
        await act(async () => input('rider-join-name').props.onChangeText('Ravi Kumar'));
        await act(async () => press('rider-join-submit').props.onPress());
        expect(allText()).toContain('Ops has already checked your documents or payout account in this name.');
        expect(input('rider-join-name').props.value).toBe('Ravi Kumar');
      });

      it("shows the server's words when ops already accepted the RC for this vehicle", async () => {
        await render(<AccountStatusScreen />, [[riderKeys.me, signedUp], [riderKeys.profile, sent()]]);
        (riderApi.signUp as jest.Mock).mockRejectedValueOnce(
          new AppApiError('VEHICLE_LOCKED', 'Ops has already accepted your RC for this vehicle. Call rider support to change it.', 422),
        );
        await act(async () => press('rider-details-change').props.onPress());
        await act(async () => press('rider-join-ELECTRIC').props.onPress());
        await act(async () => press('rider-join-submit').props.onPress());
        expect(riderApi.signUp).toHaveBeenCalledWith(expect.objectContaining({vehicleKind: 'ELECTRIC', vehicleRegNumber: ''}));
        expect(allText()).toContain('Ops has already accepted your RC for this vehicle. Call rider support to change it.');
        // The form stays open with the rider's choice, so they can put it back or call support.
        expect(input('rider-join-ELECTRIC').props.selected).toBe(true);
      });
    });
  });

  describe('fixes asked', () => {
    const fixes: RiderProfile = {
      ...sent(),
      documents: requiredDocuments('PETROL').map(type =>
        type === 'DL' ? doc(type, 'REJECTED', 'The photo is blurry. Take it again in good light.') : doc(type, 'VERIFIED'),
      ),
      payoutAccountSubmitted: undefined,
      payoutAccountReturned: true,
    };

    it('lists only what ops sent back, with the reason, and says when a fix went', async () => {
      (riderApi.getProfile as jest.Mock).mockResolvedValue(fixes);
      await render(<AccountStatusScreen />, [[riderKeys.me, pending], [riderKeys.profile, fixes]]);
      const text = allText();
      expect(text).toContain('Fix 2 things to go on | Ops checked your application and needs these again. Everything else is fine.');
      expect(text).toContain('Driving licence | Not accepted | The photo is blurry. Take it again in good light. | Send a new photo');
      expect(text).not.toContain('Vehicle RC');
      expect(text).toContain('Send your payout account again. It must be in your name and match your bank proof.');
      expect(input('rider-payout-holder').props.value).toBe('Ravi Kumar');

      (riderApi.uploadDocument as jest.Mock).mockResolvedValueOnce(undefined);
      addPhoto('DL');
      await answer('Take a photo');
      expect(riderApi.uploadDocument).toHaveBeenCalledWith('DL', 'file:///photo.jpg');
      expect(allText()).toContain('Sent. Ops checks it again.');
    });

    it('says the application went again once the last fix is in', async () => {
      (riderApi.getProfile as jest.Mock).mockResolvedValue({...fixes, documents: requiredDocuments('PETROL').map(type => doc(type, 'VERIFIED'))});
      await render(<AccountStatusScreen />, [
        [riderKeys.me, pending],
        [riderKeys.profile, {...fixes, documents: requiredDocuments('PETROL').map(type => doc(type, 'VERIFIED'))}],
      ]);
      expect(allText()).toContain('Fix 1 thing to go on');
      expect(allText()).not.toContain('Ops checked your application and needs these again.');
      (riderApi.submitPayoutAccount as jest.Mock).mockResolvedValueOnce(undefined);
      (riderApi.getProfile as jest.Mock).mockResolvedValue(sent());
      await act(async () => input('rider-payout-upi').props.onChangeText('ravi@okaxis'));
      await act(async () => press('rider-payout-submit').props.onPress());
      await flush();
      expect(allText()).toContain('Application sent');
      expect(allText()).toContain('Sent again. Ops checks it next, usually within a day.');

      // Ops asks for something again: a new round starts without the note that the last fix went.
      (riderApi.getMe as jest.Mock).mockResolvedValue(pending);
      (riderApi.getProfile as jest.Mock).mockResolvedValue(fixes);
      await act(async () => press('rider-application-check').props.onPress());
      await flush();
      expect(allText()).toContain('Fix 2 things to go on');
      expect(allText()).not.toContain('Sent. Ops checks it again.');
    });
  });

  describe('after the application', () => {
    it('tells an approved rider that pay rates come next, and asks again', async () => {
      (riderApi.getMe as jest.Mock).mockResolvedValue({...me, termsVersion: ''});
      await render(<AccountStatusScreen />, [[riderKeys.me, {...me, termsVersion: ''}]]);
      const text = allText();
      expect(text).toContain('Pay rates are on the way');
      expect(text).toContain("Application sent | You're approved | 3 | Pay rates for your area");
      expect(text).not.toContain('Checked at');
      await act(async () => press('rider-account-check-again').props.onPress());
      expect(riderApi.getMe).toHaveBeenCalled();
      expect(allText()).toMatch(/Checked at \d{1,2}:\d\d [ap]m\. No pay rates yet\./);
      (riderApi.getMe as jest.Mock).mockRejectedValueOnce(new AppApiError('HTTP_503', 'down', 503));
      await act(async () => press('rider-account-check-again').props.onPress());
      expect(allText()).toContain("Craves isn't answering right now. Try again in a minute.");
      expect(allText()).not.toContain('Checked at');
    });

    it('explains a paused account with the reason and how to appeal', async () => {
      await render(<AccountStatusScreen />, [
        [riderKeys.me, {...me, status: 'SUSPENDED', statusReason: 'A safety report is being reviewed.'}],
      ]);
      const text = allText();
      expect(text).toContain('Your account is paused');
      expect(text).toContain('A safety report is being reviewed.');
      expect(text).toContain('Disagree?');
      expect(text).not.toContain('Apply to ride');
    });

    it('asks for an update when the app is too old', async () => {
      await render(<AccountStatusScreen />, [[riderKeys.me, {...me, minAppVersion: '9.0.0'}]]);
      expect(allText()).toContain('Update the app to continue');
      expect(allText()).not.toContain('Disagree?');
    });
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
    // A first acceptance comes right after approval: say so, and that this is the last step.
    expect(text).toContain("You're approved | One last step before your first order: read how you are paid, then accept.");
    (riderApi.acceptTerms as jest.Mock).mockResolvedValueOnce(undefined);
    const refetch = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await act(async () => press('rider-terms-accept').props.onPress());
    expect(riderApi.acceptTerms).toHaveBeenCalledWith('2026-10-v1');
    expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.me});
    // The first terms let the rider in: phone setup opens next, once.
    expect(takeAfterGate()).toBe('PhoneSetup');
    expect(takeAfterGate()).toBeNull();
  });

  it('sends a rider who accepted changed terms straight back to work', async () => {
    (riderApi.acceptTerms as jest.Mock).mockResolvedValueOnce(undefined);
    await render(<TermsScreen {...props('accept')} />, [[riderKeys.terms, terms], [riderKeys.me, me]]);
    await act(async () => press('rider-terms-accept').props.onPress());
    expect(riderApi.acceptTerms).toHaveBeenCalled();
    expect(takeAfterGate()).toBeNull();
  });

  it('shows what changed to a rider who accepted an older version', async () => {
    await render(<TermsScreen {...props('accept')} />, [[riderKeys.terms, {...terms, draft: false}], [riderKeys.me, me]]);
    expect(allText()).toContain('What changed | Waiting pay now starts after 6 free minutes.');
    expect(allText()).not.toContain('Draft pricing, not final');
    expect(allText()).not.toContain("You're approved");
  });

  it('shows the upcoming terms in their own card, and nothing when there are none', async () => {
    const upcoming = {
      version: '2026-11-v1',
      effectiveFrom: '2026-11-05T12:00:00Z',
      summaryOfChanges: ['Each drop km after 2 km pays ₹10.'],
      rateCardLines: [{label: 'Each drop km after 2 km', value: '₹10'}],
    };
    await render(<TermsScreen {...props('view')} />, [[riderKeys.terms, {...terms, upcoming}], [riderKeys.me, me]]);
    expect(allText()).toContain('New terms from 5 Nov');
    expect(allText()).toContain('Each drop km after 2 km pays ₹10.');
    expect(allText()).toContain('Each drop km after 2 km | ₹10');
    await render(<TermsScreen {...props('view')} />, [[riderKeys.terms, terms], [riderKeys.me, me]]);
    expect(allText()).not.toContain('New terms from');
    expect(allText()).not.toContain('How you get orders');
  });

  it('says how orders are offered, and how they will be when that changes', async () => {
    const today = {offersAtOnce: 3, offerRounds: 1, offerSeconds: 40, radiusM: 5000, fairBandM: 0};
    const fair = {offersAtOnce: 1, offerRounds: 3, offerSeconds: 30, radiusM: 5000, fairBandM: 1500};
    const upcoming = {version: '2026-10-v1', effectiveFrom: '2026-11-05T12:00:00Z', summaryOfChanges: [], rateCardLines: [], offerRules: fair};
    await render(<TermsScreen {...props('view')} />, [[riderKeys.terms, {...terms, offerRules: today, upcoming}], [riderKeys.me, me]]);
    expect(allText()).toContain('How you get orders | Each order goes to 3 riders at once.');
    expect(allText()).toContain('Your acceptance rate and ratings never decide who gets an order.');
    expect(allText()).toContain('How you get orders then | Each order goes to one rider at a time. You get 30 seconds to decide.');
    // The same rules then: nothing new to read.
    await render(<TermsScreen {...props('view')} />, [[riderKeys.terms, {...terms, offerRules: today, upcoming: {...upcoming, offerRules: today}}], [riderKeys.me, me]]);
    expect(allText()).toContain('How you get orders |');
    expect(allText()).not.toContain('How you get orders then');
  });

  it("says why accepting failed and reloads the terms", async () => {
    (riderApi.acceptTerms as jest.Mock).mockRejectedValueOnce(new AppApiError('TERMS_CHANGED', 'The terms changed again.', 409));
    const client = await render(<TermsScreen {...props('accept')} />, [[riderKeys.terms, terms], [riderKeys.me, firstTime]]);
    const refetch = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await act(async () => press('rider-terms-accept').props.onPress());
    expect(Alert.alert).toHaveBeenCalledWith('The terms changed again.');
    expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.terms});
  });

  it('only reads in view mode, with the way back to Profile; accepting, it is the only screen', async () => {
    await render(<TermsScreen {...props('view')} />, [[riderKeys.terms, terms], [riderKeys.me, me]]);
    expect(press('rider-terms-accept')).toBeUndefined();
    expect(press('rider-terms-full')).toBeTruthy();
    await act(async () => press('rider-back').props.onPress());
    expect(mockNavigation.goBack).toHaveBeenCalled();
    await render(<TermsScreen {...props('accept')} />, [[riderKeys.terms, terms], [riderKeys.me, me]]);
    expect(press('rider-terms-accept')).toBeTruthy();
    expect(press('rider-back')).toBeUndefined();
  });

  it('switches the app language from the chips', async () => {
    await render(
      <RiderStringsProvider>
        <TermsScreen {...props('view')} />
      </RiderStringsProvider>,
      [[riderKeys.terms, terms], [riderKeys.me, me]],
    );
    // The Pressable inside the chip, which carries what TalkBack reads.
    const chip = (code: string) =>
      tree.root.findAll(node => node.props.testID === `rider-language-${code}` && node.props.accessibilityState)[0];
    expect(chip('en').props.accessibilityState).toEqual({checked: true});
    expect(allText()).toContain('తెలుగు | हिन्दी | ಕನ್ನಡ');
    await act(async () => chip('te').props.onPress());
    expect(chip('te').props.accessibilityState).toEqual({checked: true});
    expect(chip('en').props.accessibilityState).toEqual({checked: false});
    // Demo builds show every translation, for the native speaker's review (P2-08).
    expect(allText()).toContain('నిబంధనలు, రేట్ కార్డ్');
  });

  it('offers a retry when the terms cannot load', async () => {
    (riderApi.getTerms as jest.Mock).mockRejectedValueOnce(new AppApiError('HTTP_500', 'down', 500)).mockResolvedValueOnce(terms);
    await render(<TermsScreen {...props('accept')} />, [[riderKeys.me, firstTime]]);
    await flush();
    expect(allText()).toContain("Craves isn't answering | The problem is on our side. Try again in a minute. | Try again");
    expect(press('rider-terms-accept')).toBeUndefined();
    await act(async () => press('rider-retry').props.onPress());
    await flush();
    expect(press('rider-terms-accept')).toBeTruthy();
  });
});

describe('Privacy notice (P2-09)', () => {
  const privacyNotice = {version: '2027-05-v1', url: 'https://craves.in/riders/privacy/{language}', accepted: false};
  beforeEach(() => jest.spyOn(Linking, 'openURL').mockResolvedValue(true));

  it('opens the text in the language on screen, then accepts that version', async () => {
    const client = await render(<PrivacyNoticeScreen />, [[riderKeys.me, {...me, status: 'PENDING', privacyNotice}]]);
    expect(allText()).toContain('Your privacy');
    expect(allText()).toContain('Selfies: you take one when you sign up and each time you go online, so ops can check');
    expect(allText()).toContain('Version 2027-05-v1');
    await act(async () => press('rider-privacy-read').props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith('https://craves.in/riders/privacy/en');
    (riderApi.acceptPrivacyNotice as jest.Mock).mockResolvedValueOnce(undefined);
    const refetch = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await act(async () => press('rider-privacy-accept').props.onPress());
    expect(riderApi.acceptPrivacyNotice).toHaveBeenCalledWith('2027-05-v1', 'en');
    expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.me});
  });

  it('says so when the notice changed while the rider read it, and reads it again', async () => {
    (riderApi.acceptPrivacyNotice as jest.Mock).mockRejectedValueOnce(new AppApiError('NOTICE_CHANGED', 'changed', 409));
    const client = await render(<PrivacyNoticeScreen />, [[riderKeys.me, {...me, privacyNotice}]]);
    const refetch = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await act(async () => press('rider-privacy-accept').props.onPress());
    expect(Alert.alert).toHaveBeenCalledWith('The notice changed. Read the new one.');
    expect(refetch).toHaveBeenCalledWith({queryKey: riderKeys.me});
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
    fullScreenAllowed: true,
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
    expect(text).toContain('4 of 7 done');
    expect(text).toContain('On your Xiaomi: open Security, then Permissions, then Autostart, and turn on Craves Rider.');
    expect(text).toContain('Open recent apps, press and hold the Craves Rider card, then tap the lock.');
    expect(text).not.toContain('Allow location');
    await act(async () => tree.root.findByProps({label: "I've locked it"}).props.onPress());
    expect(allText()).toContain('5 of 7 done');
  });

  it('advises showing offers over the lock screen, never needs it to go online, and opens its settings', async () => {
    (riderDevice.state as jest.Mock).mockResolvedValueOnce({...device('xiaomi'), fullScreenAllowed: false});
    await render(<PhoneSetupScreen {...props} />);
    expect(allText()).toContain(
      'Show offers over the lock screen | Recommended | Tap the button and allow full screen notifications for Craves Rider.',
    );
    expect(allText()).toContain('3 of 7 done');
    expect(press('rider-setup-done')).toBeTruthy();
    await act(async () => tree.root.findByProps({label: 'Allow over the lock screen'}).props.onPress());
    expect(riderDevice.openFullScreenSettings).toHaveBeenCalled();
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
    expect(allText()).toContain('Tap the button and allow location while using the app, with Precise on.');
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

  it('goes back to where the rider came from, with Done once the phone can get offers', async () => {
    (riderDevice.locationGranted as jest.Mock).mockResolvedValue(false);
    await render(<PhoneSetupScreen {...props} />);
    await flush();
    expect(press('rider-setup-done')).toBeUndefined();
    await act(async () => press('rider-back').props.onPress());
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);

    (riderDevice.locationGranted as jest.Mock).mockResolvedValue(true);
    await render(<PhoneSetupScreen {...props} />);
    await flush();
    await act(async () => press('rider-setup-done').props.onPress());
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(2);
    expect(mockNavigation.popTo).not.toHaveBeenCalled();
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

  it("shows today's pay per online hour once there is one, and the riders' middle only when the server sends it", async () => {
    await render(<HomeScreen />, seed(onlineHome));
    expect(allText()).not.toContain('an hour online today');
    await render(<HomeScreen />, seed({...onlineHome, todayOnlineMinutes: 225, todayPerHourPaise: 9253}));
    expect(allText()).toContain('Today | ₹347 | 5 trips | Online today: 3 h 45 min | ₹92.53 an hour online today');
    expect(allText()).not.toContain("today's riders");
    await render(<HomeScreen />, seed({...offlineHome, todayOnlineMinutes: 225, todayPerHourPaise: 9253, fleetPerHourPaise: 8500}));
    expect(allText()).toContain("₹92.53 an hour online today | Half of today's riders made ₹85 an hour or more.");
  });

  it('never makes up a guaranteed rate the server did not send', async () => {
    await render(<HomeScreen />, seed({...offlineHome, guaranteedPerHourPaise: undefined}));
    expect(allText()).toContain('Your next slot');
    expect(allText()).not.toContain('an hour');
  });

  it('opens phone setup by itself right after the first pay terms, once', async () => {
    openAfterGate('PhoneSetup');
    await render(<HomeScreen />, seed(offlineHome));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PhoneSetup');
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
    await render(<HomeScreen />, seed(offlineHome));
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
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
    // Going offline asks once, so a pocket tap never ends the shift; Stay online keeps it.
    (riderApi.endShift as jest.Mock).mockResolvedValueOnce(undefined);
    await act(async () => press('rider-go-offline').props.onPress());
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect([title, body]).toEqual(['Go offline?', "You won't get offers until you go online again."]);
    expect(buttons.map((b: {text: string}) => b.text)).toEqual(['Stay online', 'Go offline']);
    expect(riderApi.endShift).not.toHaveBeenCalled();
    await act(async () => buttons[1].onPress());
    expect(riderOnlineService.stop).toHaveBeenCalled();
    expect(riderApi.endShift).toHaveBeenCalled();
  });

  it('starts no break or heading home during a trip, and the trip is one tap away', async () => {
    const choosing = {...me, features: {...me.features, riderChoices: true}};
    const trip = {tripId: 't1', step: 'AT_KITCHEN'};
    await render(<HomeScreen />, [[riderKeys.home, {...onlineHome, homeSaved: true}], [riderKeys.me, choosing], [riderKeys.activeTrip, trip]]);
    expect(press('rider-break-start')).toBeUndefined();
    expect(press('rider-head-home')).toBeUndefined();
    // Going offline on a trip says the trip stays theirs; the safe answer is named, like the one with no trip.
    await act(async () => press('rider-go-offline').props.onPress());
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect([title, body]).toEqual(['Go offline during a trip?', 'The trip stays yours. Ops will call you to sort it out.']);
    expect(buttons.map((b: {text: string}) => b.text)).toEqual(['Stay online', 'Go offline']);
    await act(async () => press('rider-resume-trip').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Trip');
    // Between trips both start again.
    await render(<HomeScreen />, [[riderKeys.home, {...onlineHome, homeSaved: true}], [riderKeys.me, choosing], [riderKeys.activeTrip, null]]);
    expect(press('rider-break-start')).toBeDefined();
    expect(press('rider-head-home')).toBeDefined();
  });

  // The server sends slotEndsAt and zoneName only while a slot runs; nextSlot is then the running one.
  it('never promises paid waiting before the slot starts, and calls a running slot "now"', async () => {
    const count = (testID: string) => tree.root.findAll(node => node.props.testID === testID).length;
    await render(<HomeScreen />, seed({...onlineHome, slotEndsAt: undefined, zoneName: undefined}));
    expect(count('rider-waiting-paid')).toBe(0);
    expect(allText()).toContain('Your slot starts at 7:00 pm. From then, waiting is paid: at least ₹80 an hour.');
    await render(<HomeScreen />, seed({...offlineHome, slotEndsAt: at(22), zoneName: 'Madhapur and Kondapur'}));
    expect(allText()).toContain('Your slot now | 7:00 pm to 10:00 pm');
    expect(allText()).not.toContain('Your next slot');
  });

  it('takes a break of the chosen minutes, only when rider choices are on', async () => {
    await render(<HomeScreen />, seed(onlineHome));
    expect(press('rider-break-start')).toBeUndefined();
    const choosing = {...me, features: {...me.features, riderChoices: true}};
    (riderApi.pauseShift as jest.Mock).mockResolvedValueOnce({offersPausedUntil: at(23)});
    await render(<HomeScreen />, seed(onlineHome, choosing));
    await act(async () => press('rider-break-start').props.onPress());
    expect(allText()).toContain('How long? You stay online, and no offers come. | 10 min | 20 min | 30 min');
    expect(allText()).toContain("Break time doesn't count toward a slot's guaranteed minimum.");
    await act(async () => press('rider-break-20').props.onPress());
    expect(riderApi.pauseShift).toHaveBeenCalledWith(20);
    expect(press('rider-break-20')).toBeUndefined();
  });

  it('shows a running break and comes back from it, even with rider choices off', async () => {
    const until = new Date(Date.now() + 15 * 60_000);
    (riderApi.resumeShift as jest.Mock).mockResolvedValueOnce(undefined);
    await render(<HomeScreen />, seed({...onlineHome, offersPausedUntil: until.toISOString()}));
    expect(tree.root.findByProps({testID: 'rider-on-break'}).props.children).toMatch(/^On a break until \d{1,2}:\d\d [ap]m$/);
    expect(allText()).toContain('No offers until then. Come back any time.');
    await act(async () => press('rider-break-end').props.onPress());
    expect(riderApi.resumeShift).toHaveBeenCalled();
    // A break that has ended shows nothing, until Home reloads.
    await render(<HomeScreen />, seed({...onlineHome, offersPausedUntil: new Date(Date.now() - 1000).toISOString()}));
    expect(allText()).not.toContain('On a break');
  });

  it('heads home for an hour only with rider choices on and a home spot saved', async () => {
    const choosing = {...me, features: {...me.features, riderChoices: true}};
    await render(<HomeScreen />, seed({...onlineHome, homeSaved: false}, choosing));
    expect(press('rider-head-home')).toBeUndefined();
    await render(<HomeScreen />, seed({...onlineHome, homeSaved: true}));
    expect(press('rider-head-home')).toBeUndefined();
    (riderApi.headHome as jest.Mock).mockResolvedValueOnce({until: at(23)});
    await render(<HomeScreen />, seed({...onlineHome, homeSaved: true}, choosing));
    expect(allText()).toContain('For an hour you hear only of orders that take you nearer home.');
    await act(async () => press('rider-head-home').props.onPress());
    expect(riderApi.headHome).toHaveBeenCalled();
  });

  it('shows heading home while it is on and stops it, even with rider choices off', async () => {
    const until = new Date(Date.now() + 40 * 60_000);
    (riderApi.stopHeadingHome as jest.Mock).mockResolvedValueOnce(undefined);
    await render(<HomeScreen />, seed({...onlineHome, headingHomeUntil: until.toISOString()}));
    expect(tree.root.findByProps({testID: 'rider-heading-home'}).props.children).toMatch(/^Heading home until \d{1,2}:\d\d [ap]m$/);
    expect(allText()).toContain('You hear only of orders whose drop is on your way home. It ends when you get near home.');
    await act(async () => press('rider-heading-home-stop').props.onPress());
    expect(riderApi.stopHeadingHome).toHaveBeenCalled();
    await render(<HomeScreen />, seed({...onlineHome, headingHomeUntil: new Date(Date.now() - 1000).toISOString()}));
    expect(allText()).not.toContain('Heading home until');
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
    expect(allText()).toContain("No internet | Check mobile data or Wi-Fi. This loads when you're back online. | Try again");
    expect(press('rider-retry')).toBeTruthy();
    expect(press('rider-go-online').props.disabled).toBe(true);
  });
});

describe('Go online', () => {
  const props = {route: {key: 'GoOnline', name: 'GoOnline' as const, params: undefined}, navigation: mockNavigation as never};
  const shift = {shiftCredential: 'opaque', expiresAt: '2026-10-20T22:00:00Z'};

  it('explains the selfie, then starts the shift with the front-camera photo', async () => {
    (riderApi.startShift as jest.Mock).mockResolvedValueOnce(shift);
    const client = await render(<GoOnlineScreen {...props} />, [[riderKeys.home, {online: false, todayEarningsPaise: 0, todayTrips: 0}]]);
    expect(allText()).toContain('Take off your helmet and look at the camera');
    expect(allText()).toContain("Ops checks it's you. Customers never see this photo.");
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({cameraType: 'front'}));
    expect(riderApi.startShift).toHaveBeenCalledWith('file:///photo.jpg', 'android-id-1');
    expect(riderOnlineService.start).toHaveBeenCalledWith(shift);
    expect(mockNavigation.goBack).toHaveBeenCalled();
    // Home reads online as soon as the rider lands there, not after its refetch.
    expect(client.getQueryData<HomeSummary>(riderKeys.home)?.online).toBe(true);
  });

  it('asks for the camera when it is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({granted: false});
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(allText()).toContain('Allow the camera to take the selfie.');
    expect(allText()).toContain('Open settings');
    expect(riderApi.startShift).not.toHaveBeenCalled();
  });

  // The server takes a selfie of 5 MB at most (FleetShiftService): say so before a long upload is refused.
  it('asks for the selfie again when the photo is too large to send', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{uri: 'file:///selfie.jpg', fileSize: 6_000_000}],
    });
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(allText()).toContain('That photo is too large to send. Take it again.');
    expect(riderApi.startShift).not.toHaveBeenCalled();
  });

  it('stays put when the rider backs out of the camera', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({canceled: true, assets: null});
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(riderApi.startShift).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('asks for the selfie again, saying why, until the phone sees a face', async () => {
    (riderApi.startShift as jest.Mock).mockResolvedValueOnce(shift);
    (ImagePicker.launchCameraAsync as jest.Mock)
      .mockResolvedValueOnce({canceled: false, assets: [{uri: 'file:///helmet.jpg'}]})
      .mockResolvedValueOnce({canceled: false, assets: [{uri: 'file:///face.jpg'}]});
    (riderDevice.faces as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{widthRatio: 0.35, yaw: 3, roll: -2, leftEye: 0.9, rightEye: 0.95}]);
    (Alert.alert as jest.Mock).mockImplementationOnce((_title, _message, buttons) => buttons[1].onPress());
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect([title, message]).toEqual([
      'Take the selfie again',
      "We couldn't see your face. Take off your helmet, mask and dark glasses, face the light and look at the camera.",
    ]);
    expect(buttons.map((button: {text: string}) => button.text)).toEqual(['Cancel', 'Take again']);
    expect(riderApi.startShift).toHaveBeenCalledTimes(1);
    expect(riderApi.startShift).toHaveBeenCalledWith('file:///face.jpg', 'android-id-1');
  });

  it('takes one selfie at a time, even on a double tap', async () => {
    (riderApi.startShift as jest.Mock).mockResolvedValueOnce(shift);
    await render(<GoOnlineScreen {...props} />);
    const shutter = press('rider-selfie-shutter').props;
    await act(async () => {
      await Promise.all([shutter.onPress(), shutter.onPress()]);
    });
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(riderApi.startShift).toHaveBeenCalledTimes(1);
  });

  it('stays put when the rider cancels a selfie the phone refused', async () => {
    (riderDevice.faces as jest.Mock).mockResolvedValueOnce([{widthRatio: 0.3, yaw: 2, roll: 0, leftEye: 0.05, rightEye: 0.1}]);
    (Alert.alert as jest.Mock).mockImplementationOnce((_title, _message, buttons) => buttons[0].onPress());
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe('Keep your eyes open, and take off dark glasses.');
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(riderApi.startShift).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  /** What the API client makes of the server's refusal: a 403 keeps its code but not its message. */
  const refusal = (status: number, code: string, message: string) =>
    toAppApiError(new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {status, data: {code, message}, headers: {}} as never));

  it.each([
    ['DOCUMENTS_EXPIRED', 'A document has expired. Upload the new one in Profile, then go online.'],
    ['APP_UPDATE_REQUIRED', 'Update the Craves Rider app to go online.'],
    ['RIDER_NOT_ACTIVE', "Your account can't do this right now. Open your account page to see why."],
  ])('says why the server refused the shift (403 %s)', async (code, text) => {
    (riderApi.startShift as jest.Mock).mockRejectedValueOnce(refusal(403, code, 'Renew these before going online: Insurance'));
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(allText()).toContain(text);
    expect(riderOnlineService.start).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(press('rider-selfie-shutter')).toBeTruthy();
  });

  it("shows the server's words for a refused selfie", async () => {
    (riderApi.startShift as jest.Mock).mockRejectedValueOnce(refusal(422, 'SELFIE_INVALID', 'Take a clear photo of your face and try again.'));
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(allText()).toContain('Take a clear photo of your face and try again.');
  });

  it("ends the server's shift when the online service can't start on this phone", async () => {
    (riderApi.startShift as jest.Mock).mockResolvedValueOnce(shift);
    // As the native module rejects: its code, and words already in the rider's language (RiderText.kt).
    const noLocation = Object.assign(new Error('Allow location to go online.'), {code: 'LOCATION_PERMISSION'});
    (riderOnlineService.start as jest.Mock).mockRejectedValueOnce(noLocation);
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(riderApi.endShift).toHaveBeenCalled();
    expect(allText()).toContain('Allow location to go online.');
    await act(async () => press('rider-go-online-setup').props.onPress());
    expect(mockNavigation.replace).toHaveBeenCalledWith('PhoneSetup');
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('never shows a crash text: a native failure without a known code gets the plain words', async () => {
    (riderApi.startShift as jest.Mock).mockResolvedValueOnce(shift);
    const crash = Object.assign(new Error('startForegroundService() not allowed due to mAllowStartForeground false'), {code: 'START_FAILED'});
    (riderOnlineService.start as jest.Mock).mockRejectedValueOnce(crash);
    await render(<GoOnlineScreen {...props} />);
    await act(async () => press('rider-selfie-shutter').props.onPress());
    expect(allText()).toContain('Something went wrong. Try again.');
    expect(allText()).not.toContain('mAllowStartForeground');
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
    itemsCount: 2,
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
    // A slow first render under load can take a second or two off the 40 s countdown.
    expect(text).toMatch(/New order \| (40|39|38)s left \| You get at least \| ₹67/);
    expect(text).toContain('₹40 base + ₹18 drop distance + ₹9 ride to the kitchen. Locked once you accept.');
    expect(text).toContain('To the kitchen | 2.0 km | Kitchen to customer | 4.0 km');
    expect(text).toContain('Madhapur | Kondapur | About 28 min in total, 2 items');
    expect(text).toContain('Declining is free and never affects your future offers.');
    const pay = tree.root.findByProps({testID: 'rider-offer-pay'});
    expect(StyleSheet.flatten(pay.props.style)).toMatchObject({fontSize: 72, fontWeight: '900'});
    expect(pay.props.adjustsFontSizeToFit).toBe(true);
    expect(tree.root.findByProps({accessibilityLabel: 'Madhapur to Kondapur'})).toBeTruthy();
  });

  it('says why the offer came to this rider, when the server says', async () => {
    const withReason = {...props(), route: {...props().route, params: {offer: {...offer, reason: {rule: 'FAIR' as const, place: 1, riders: 3, atOnce: 1, round: 1, bandM: 1500, bandRiders: 2, earnedPerHourPaise: 0, freeMinutes: 40}}, receivedAtMs: Date.now()}}};
    await render(<OfferScreen {...withReason} />);
    expect(allText()).toContain(
      "Madhapur | Kondapur | About 28 min in total, 2 items | Fair turns: free riders near the kitchen who have earned less per online hour today hear first. It's your turn. | Declining is free",
    );
    await render(<OfferScreen {...props()} />);
    expect(allText()).not.toContain('Fair turns');
    expect(allText()).toContain('About 28 min in total, 2 items | Declining is free');
  });

  it('tells a rider heading home how much nearer home the drop leaves them', async () => {
    const homeward = {rule: 'NEAREST' as const, place: 1, riders: 2, atOnce: 1, round: 1, homeNearerM: 3240};
    await render(<OfferScreen {...{...props(), route: {...props().route, params: {offer: {...offer, reason: homeward}, receivedAtMs: Date.now()}}}} />);
    expect(allText()).toContain("You're the nearest free rider. | On your way home: the drop leaves you 3.2 km nearer home. | Declining is free");
  });

  it('leaves the item count off when the server sends none, and says "1 item"', async () => {
    const withItems = (itemsCount?: number) => ({...props(), route: {...props().route, params: {offer: {...offer, itemsCount}, receivedAtMs: Date.now()}}});
    await render(<OfferScreen {...withItems(undefined)} />);
    expect(allText()).toContain('About 28 min in total |');
    expect(allText()).not.toContain('items');
    await render(<OfferScreen {...withItems(1)} />);
    expect(allText()).toContain('About 28 min in total, 1 item |');
  });

  it('declines for free and closes', async () => {
    (riderApi.declineOffer as jest.Mock).mockResolvedValueOnce(undefined);
    await render(<OfferScreen {...props()} />);
    await act(async () => press('rider-offer-decline').props.onPress());
    expect(riderApi.declineOffer).toHaveBeenCalledWith('o1', 'rider-decline-o1-r1');
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("holds the phone's Back while the offer is live, like an incoming call, and lets go once it ends", async () => {
    jest.useFakeTimers();
    const remove = jest.fn();
    const backPress = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({remove}));
    try {
      await render(<OfferScreen {...props()} />);
      expect(backPress).toHaveBeenCalledTimes(1);
      const [event, onBack] = backPress.mock.calls[0];
      expect(event).toBe('hardwareBackPress');
      // Handled, so the screen stays: the offer couldn't be opened again.
      expect((onBack as () => boolean)()).toBe(true);
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
      expect(riderApi.declineOffer).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(41_000);
      });
      expect(allText()).toContain('Offer expired');
      expect(remove).toHaveBeenCalledTimes(1);
      expect(backPress).toHaveBeenCalledTimes(1);
    } finally {
      backPress.mockRestore();
    }
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

  it("shows the server's words for a 409 that isn't a lost race", async () => {
    (riderApi.acceptOffer as jest.Mock).mockRejectedValueOnce(
      new AppApiError('TRIP_IN_PROGRESS', 'Finish your current trip before you take another order.', 409),
    );
    await render(<OfferScreen {...props()} />);
    await act(async () => press('rider-offer-accept').props.onPress());
    expect(allText()).toContain('Finish your current trip before you take another order.');
    expect(allText()).not.toContain('Taken by another rider');
  });

  it('shows just the lock when the server sends no breakdown', async () => {
    await render(<OfferScreen {...props()} route={{key: 'Offer', name: 'Offer', params: {offer: {...offer, payLines: []}, receivedAtMs: Date.now()}}} />);
    expect(allText()).toContain('₹67 | Locked once you accept.');
  });

  it('stops the ring and holds Decline while Accept is on its way; with no answer, the offer stays and both come back', async () => {
    let fail: (error: unknown) => void = () => undefined;
    (riderApi.acceptOffer as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
    await render(<OfferScreen {...props()} />);
    await act(async () => {
      press('rider-offer-accept').props.onPress();
    });
    expect(riderOnlineService.stopRinging).toHaveBeenCalledWith('o1');
    expect(press('rider-offer-decline').props.disabled).toBe(true);
    await act(async () => fail(new AppApiError('NETWORK', 'Offline', undefined, undefined, true)));
    expect(allText()).toContain('No internet. Check your connection and try again. | Accept | Decline');
    expect(press('rider-offer-accept').props.disabled).toBe(false);
    expect(press('rider-offer-decline').props.disabled).toBe(false);
    // A second accept may go (the server gives the same trip to a repeat).
    (riderApi.acceptOffer as jest.Mock).mockResolvedValueOnce({tripId: 't1'});
    await act(async () => press('rider-offer-accept').props.onPress());
    expect(mockNavigation.replace).toHaveBeenCalledWith('Trip');
  });

  it('holds Accept once Decline is tapped', async () => {
    await render(<OfferScreen {...props()} />);
    await act(async () => press('rider-offer-decline').props.onPress());
    expect(press('rider-offer-accept').props.disabled).toBe(true);
  });

  it('counts down to the native deadline, so a push that came 8 s late shows 32 s, not 40', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    await render(<OfferScreen {...props(now)} route={{...props(now).route, params: {offer, receivedAtMs: now, deadlineMs: now + 32_000}}} />);
    expect(allText()).toMatch(/New order \| (32|31|30)s left/);
  });
});
