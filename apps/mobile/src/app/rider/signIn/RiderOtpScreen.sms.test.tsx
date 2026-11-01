// A live build fills in the sign-in code from its SMS (SMS User Consent API, RiderSmsCodeModule) and checks it at once.
import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import {RiderOtpScreen} from './RiderOtpScreen';

const mockSession = {beginPhone: jest.fn(async (_phone: string) => undefined), confirmOtp: jest.fn(async (_code: string) => undefined)};
const mockSms = {onCode: (_code: string) => undefined as void, started: true, starts: 0, stops: 0};

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../useRiderSession', () => ({useRiderSession: () => mockSession}));
jest.mock('../../../features/rider/riderConfig', () => ({
  ...jest.requireActual('../../../features/rider/riderConfig'),
  riderApiMode: 'live',
  isDemo: false,
}));
jest.mock('../../../features/rider/native/smsCode', () => ({
  listenForSmsCode: (onCode: (code: string) => void) => {
    mockSms.onCode = onCode;
    mockSms.starts += 1;
    return {started: Promise.resolve(mockSms.started), stop: () => (mockSms.stops += 1)};
  },
}));

jest.setTimeout(30_000);

const navigation = {goBack: jest.fn()};
const props = {route: {key: 'Otp', name: 'Otp' as const, params: {phone: '+919848012345'}}, navigation: navigation as never};
let tree: renderer.ReactTestRenderer | undefined;

const allText = () =>
  tree!.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''))
    .join(' | ');
const press = (testID: string) => tree!.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const codeInput = () => tree!.root.findByProps({testID: 'rider-code-input'});

async function render() {
  await act(async () => {
    tree = renderer.create(<RiderOtpScreen {...props} />);
  });
}

function close() {
  act(() => tree?.unmount());
  tree = undefined;
}

beforeEach(() => {
  mockSession.confirmOtp.mockReset().mockResolvedValue(undefined);
  mockSession.beginPhone.mockReset().mockResolvedValue(undefined);
  Object.assign(mockSms, {started: true, starts: 0, stops: 0});
});

afterEach(close);

it('says to tap Allow, fills in the code from the SMS and checks it without a tap', async () => {
  await render();
  expect(allText()).toContain('When the SMS comes, tap Allow and the code fills in by itself.');
  await act(async () => mockSms.onCode('482615'));
  expect(codeInput().props.value).toBe('482615');
  expect(mockSession.confirmOtp).toHaveBeenCalledTimes(1);
  expect(mockSession.confirmOtp).toHaveBeenCalledWith('482615');
});

it('waits for the new SMS after a resend, and stops waiting when the screen closes', async () => {
  jest.useFakeTimers();
  try {
    await render();
    expect(mockSms.starts).toBe(1);
    for (let i = 0; i < 31; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    await act(async () => press('rider-resend').props.onPress());
    expect(mockSession.beginPhone).toHaveBeenCalledWith('+919848012345');
    expect(mockSms.starts).toBe(2);
    expect(mockSms.stops).toBe(1);
    close();
    expect(mockSms.stops).toBe(2);
  } finally {
    jest.useRealTimers();
  }
});

it('checks one code at a time: a code changed meanwhile is checked once the first answer is in', async () => {
  let answer!: (error: unknown) => void;
  mockSession.confirmOtp.mockImplementationOnce(() => new Promise((_, wrong) => (answer = wrong)));
  await render();
  await act(async () => codeInput().props.onChangeText('482615'));
  // The SMS arrives while the typed code is being checked.
  await act(async () => mockSms.onCode('482616'));
  expect(mockSession.confirmOtp.mock.calls).toEqual([['482615']]);
  expect(press('rider-verify').props.disabled).toBe(true);
  await act(async () => answer(new AppApiError('OTP_INVALID', 'wrong', 422)));
  expect(mockSession.confirmOtp.mock.calls).toEqual([['482615'], ['482616']]);
});

it('never checks the same code twice by itself; Verify asks again', async () => {
  mockSession.confirmOtp.mockRejectedValue(new AppApiError('OTP_INVALID', 'wrong', 422));
  await render();
  await act(async () => codeInput().props.onChangeText('482615'));
  expect(allText()).toContain('That code is wrong. Check the SMS and try again.');
  await act(async () => mockSms.onCode('482615'));
  expect(mockSession.confirmOtp).toHaveBeenCalledTimes(1);
  await act(async () => press('rider-verify').props.onPress());
  expect(mockSession.confirmOtp).toHaveBeenCalledTimes(2);
});

it('says nothing about the SMS where the phone cannot read it, and the rider types the code', async () => {
  mockSms.started = false;
  await render();
  expect(allText()).not.toContain('tap Allow');
  await act(async () => codeInput().props.onChangeText('482615'));
  expect(mockSession.confirmOtp).toHaveBeenCalledWith('482615');
});

describe('listenForSmsCode on a phone', () => {
  it('passes on only a 6-digit code from the rider app, and stops listening', () => {
    jest.isolateModules(() => {
      const rn = require('react-native');
      const start = jest.fn(async () => true);
      const stop = jest.fn();
      const os = rn.Platform.OS;
      rn.Platform.OS = 'android';
      rn.NativeModules.CravesRiderSmsCode = {start, stop};
      try {
        // The real module (this file mocks it for the screen tests above).
        const {listenForSmsCode, SMS_CODE_EVENT} = jest.requireActual('../../../features/rider/native/smsCode');
        const codes: string[] = [];
        const sms = listenForSmsCode((code: string) => codes.push(code));
        rn.DeviceEventEmitter.emit(SMS_CODE_EVENT, '482615');
        rn.DeviceEventEmitter.emit(SMS_CODE_EVENT, 'not a code');
        rn.DeviceEventEmitter.emit(SMS_CODE_EVENT, '4826150');
        expect(codes).toEqual(['482615']);
        expect(start).toHaveBeenCalled();
        sms.stop();
        rn.DeviceEventEmitter.emit(SMS_CODE_EVENT, '111111');
        expect(codes).toEqual(['482615']);
        expect(stop).toHaveBeenCalled();
      } finally {
        delete rn.NativeModules.CravesRiderSmsCode;
        rn.Platform.OS = os;
      }
    });
  });
});
