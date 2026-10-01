import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, TextInput } from 'react-native';
import { RoleSelectionScreen } from './RoleSelectionScreen';
import { PhoneSignInScreen } from './PhoneSignInScreen';
import { EmailSignInScreen } from './EmailSignInScreen';
import { OtpVerificationScreen } from './OtpVerificationScreen';
import { AuthRoleCards } from '../components/AuthRoleCards';
import { AuthActionButton } from '../components/AuthActionButton';
import { AuthTextField } from '../components/AuthTextField';
import { AuthOtpInput } from '../components/AuthOtpInput';
import { authService } from '../state/authService';
import { authTransitionMemory } from '../state/authTransitionMemory';
import type { AuthRole } from '../domain/types';

const mockDispatch = jest.fn();
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { selectedRole: 'CUSTOMER' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('../state/authService', () => ({
  authService: {
    beginPhone: jest.fn(async () => undefined),
    confirmOtp: jest.fn(async () => ({ identity: { uid: 'verified-user' } })),
    emailLogin: jest.fn(async () => ({ identity: { uid: 'verified-user' } })),
  },
}));

describe('reference login styling preserves auth contracts', () => {
  let tree: renderer.ReactTestRenderer;
  const navigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
  };
  const props = (role: AuthRole = 'CUSTOMER') => ({
    navigation: navigation as never,
    route: { params: { role } } as never,
  });
  const render = (element: React.ReactElement) => {
    act(() => {
      tree = renderer.create(element);
    });
  };
  const button = (label: string) =>
    tree.root
      .findAllByType(AuthActionButton)
      .find(node => node.props.label === label)!;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    authTransitionMemory.clear();
  });
  afterEach(() => {
    act(() => tree?.unmount());
    jest.useRealTimers();
  });
  it('matches the reference split and chosen role without adding a login footer', () => {
    render(<RoleSelectionScreen {...props()} />);
    expect(
      StyleSheet.flatten(
        tree.root.findAllByProps({ testID: 'auth-video-window' })[0].props
          .style,
      ).flex,
    ).toBe(0.465);
    expect(
      StyleSheet.flatten(
        tree.root.findAllByProps({ testID: 'auth-white-panel' })[0].props.style,
      ).flex,
    ).toBeCloseTo(0.535);
    expect(JSON.stringify(tree.toJSON())).not.toContain(
      'Already have an account',
    );
    act(() => tree.root.findByType(AuthRoleCards).props.onChange('CHEF'));
    act(() => button('Continue as Chef').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('PhoneSignIn', {
      role: 'CHEF',
    });
  });
  it.each(['CUSTOMER', 'CHEF'] as const)(
    'requests the same India-only phone OTP for %s',
    async role => {
      render(<PhoneSignInScreen {...props(role)} />);
      expect(button('Send OTP').props.disabled).toBe(true);
      act(() =>
        tree.root.findByType(AuthTextField).props.onChangeText('9876541234'),
      );
      await act(async () => {
        await button('Send OTP').props.onPress();
      });
      expect(authService.beginPhone).toHaveBeenCalledWith(
        role,
        '+919876541234',
      );
      expect(authTransitionMemory.getPendingPhone()).toBe('+919876541234');
      expect(navigation.navigate).toHaveBeenCalledWith('OtpVerification', {
        role,
      });
    },
  );
  it('keeps the Chef sign-up link on the verified phone OTP path', () => {
    render(<PhoneSignInScreen {...props('CHEF')} />);
    const link = tree.root.findAllByProps({
      accessibilityLabel: 'New chef sign up',
    })[0];
    act(() => link.props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('Create your Chef account');
    expect(authService.beginPhone).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(tree.root.findByType(AuthRoleCards).props.value).toBe('CHEF');
  });
  it('opens the existing email-only route and does not promise phone/password login', () => {
    render(<PhoneSignInScreen {...props('CHEF')} />);
    act(() => button('Use email & password').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('EmailSignIn', {
      role: 'CHEF',
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain('phone & password');
  });
  it('keeps normalized email login, password visibility, and recovery prefill', async () => {
    render(<EmailSignInScreen {...props()} />);
    const fields = () => tree.root.findAllByType(AuthTextField);
    act(() => fields()[0].props.onChangeText(' USER@example.com '));
    act(() => fields()[1].props.onChangeText('password123'));
    expect(fields()[1].props.secureTextEntry).toBe(true);
    act(() => fields()[1].props.onRightIconPress());
    expect(fields()[1].props.secureTextEntry).toBe(false);
    const recovery = tree.root.findAllByProps({ accessibilityRole: 'link' })[0];
    act(() => recovery.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword', {
      role: 'CUSTOMER',
    });
    await act(async () => {
      await button('Log in as Customer').props.onPress();
    });
    expect(authService.emailLogin).toHaveBeenCalledWith(
      'user@example.com',
      'password123',
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth/authenticated' }),
    );
  });
  it('renders six digits through one native autofill input without changing the pending role', async () => {
    authTransitionMemory.setPendingPhone('+919876541234');
    render(<OtpVerificationScreen {...props('CHEF')} />);
    expect(tree.root.findByType(AuthRoleCards).props.onChange).toBeUndefined();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    const native = tree.root.findByType(TextInput);
    expect(native.props.textContentType).toBe('oneTimeCode');
    expect(native.props.autoComplete).toBe('sms-otp');
    expect(JSON.stringify(tree.toJSON())).toContain('******1234');
    expect(JSON.stringify(tree.toJSON())).toContain('00:30');
    act(() => tree.root.findByType(AuthOtpInput).props.onChangeText('12a3456'));
    expect(tree.root.findByType(AuthOtpInput).props.value).toBe('123456');
    await act(async () => {
      await button('Verify & continue').props.onPress();
    });
    expect(authService.confirmOtp).toHaveBeenCalledWith('123456');
    expect(authTransitionMemory.getPendingPhone()).toBeNull();
  });
  it('retains resend cooldown and the pending Chef phone contract', async () => {
    authTransitionMemory.setPendingPhone('+919876541234');
    render(<OtpVerificationScreen {...props('CHEF')} />);
    const resend = () =>
      tree.root.findAllByProps({
        accessibilityHint:
          'Requests a new verification code for this phone number',
      })[0];
    expect(resend().props.disabled).toBe(true);
    act(() => jest.advanceTimersByTime(30_000));
    expect(resend().props.disabled).toBe(false);
    await act(async () => {
      await resend().props.onPress();
    });
    expect(authService.beginPhone).toHaveBeenCalledWith(
      'CHEF',
      '+919876541234',
    );
    expect(resend().props.disabled).toBe(true);
  });
  it('keeps expired OTP sessions disabled and provides a route back to phone entry', () => {
    render(<OtpVerificationScreen {...props()} />);
    expect(tree.root.findByType(AuthOtpInput).props.disabled).toBe(true);
    expect(button('Verify & continue').props.disabled).toBe(true);
    const back = tree.root.findAllByProps({ accessibilityLabel: 'Go back' })[0];
    act(() => back.props.onPress());
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
