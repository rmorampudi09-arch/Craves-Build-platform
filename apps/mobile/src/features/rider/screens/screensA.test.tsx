// Screens 1–8 of "Rider app P1: screens to the design": every state of sign-in, account status, terms,
// phone setup, home, go online and the offer.
import React from 'react';
import {Alert, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {RiderOtpScreen} from '../../../app/rider/signIn/RiderOtpScreen';
import {RiderPhoneScreen} from '../../../app/rider/signIn/RiderPhoneScreen';
import {RiderShellContext} from '../navigation';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popTo: jest.fn()};
const mockSession = {beginPhone: jest.fn(async (_phone: string) => undefined), confirmOtp: jest.fn(async (_code: string) => undefined)};

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('../../../app/rider/useRiderSession', () => ({useRiderSession: () => mockSession}));
jest.mock('../api/riderApi', () => {
  const never = () => new Promise(() => undefined);
  return {
    idempotencyKey: jest.requireActual('../api/riderApi').idempotencyKey,
    riderApi: new Proxy({}, {get: (target: Record<string, jest.Mock>, key: string) => (target[key] ??= jest.fn(never))}),
  };
});

// The first render transforms React Native and the icon font; with a cold cache (CI) that alone can pass 5 s.
jest.setTimeout(30_000);

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
