import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import { LinearGradient, Stop } from 'react-native-svg';
import { AuthRoleCards } from './AuthRoleCards';
import { AuthActionButton } from './AuthActionButton';
import { AuthSurfaceFinish } from './AuthSurfaceFinish';
import { AuthTextField } from './AuthTextField';
import { VideoAuthLayout } from './VideoAuthLayout';
import { authHeroFraction, loginFonts } from './loginVisuals';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));

describe('login reference visual structure', () => {
  let tree: renderer.ReactTestRenderer;
  const render = (element: React.ReactElement) => {
    act(() => {
      tree = renderer.create(element);
    });
  };
  afterEach(() => {
    act(() => tree?.unmount());
  });

  it('uses tall welcome tiles and the bundled bold face, not an OEM font weight', () => {
    render(<AuthRoleCards welcome value="CUSTOMER" onChange={jest.fn()} />);
    const card = tree.root.findAllByProps({ testID: 'login-role-customer' })[0];
    expect(
      StyleSheet.flatten(card.props.style({ pressed: false })).minHeight,
    ).toBe(140);
    const label = tree.root
      .findAllByType(Text)
      .find(node => node.props.children === 'Customer')!;
    expect(StyleSheet.flatten(label.props.style).fontFamily).toBe(
      loginFonts.bold,
    );
    expect(tree.root.findAllByType(AuthSurfaceFinish)).toHaveLength(4);
  });

  it('keeps email role choices compact without removing their description', () => {
    render(<AuthRoleCards compact value="CHEF" onChange={jest.fn()} />);
    const card = tree.root.findAllByProps({ testID: 'login-role-chef' })[0];
    expect(
      StyleSheet.flatten(card.props.style({ pressed: false })).minHeight,
    ).toBe(68);
    expect(JSON.stringify(tree.toJSON())).toContain('Share your passion');
  });

  it.each([true, false])(
    'passes real SVG stops directly to every glossy gradient (%s)',
    action => {
      render(<AuthSurfaceFinish action={action} selected />);
      const gradients = tree.root.findAllByType(LinearGradient);
      expect(gradients).toHaveLength(2);
      for (const gradient of gradients) {
        const stops = React.Children.toArray(gradient.props.children);
        expect(stops.length).toBeGreaterThan(1);
        expect(
          stops.every(
            child => React.isValidElement(child) && child.type === Stop,
          ),
        ).toBe(true);
      }
    },
  );

  it('keeps disabled glossy actions disabled and removes the opaque shine strip', () => {
    render(<AuthActionButton disabled label="Send OTP" onPress={jest.fn()} />);
    const button = tree.root.findAllByProps({
      accessibilityLabel: 'Send OTP',
    })[0];
    expect(button.props.disabled).toBe(true);
    expect(tree.root.findByType(AuthSurfaceFinish).props.action).toBe(true);
    expect(
      StyleSheet.flatten(button.props.style({ pressed: false })).borderRadius,
    ).toBe(16);
  });

  it('uses a red outline for the reference secondary action without a glass fill', () => {
    render(
      <AuthActionButton
        outline
        outlineTone="red"
        label="Use phone OTP instead"
        onPress={jest.fn()}
      />,
    );
    expect(tree.root.findAllByType(AuthSurfaceFinish)).toHaveLength(0);
    const label = tree.root.findByType(Text);
    expect(StyleSheet.flatten(label.props.style).fontFamily).toBe(
      loginFonts.semibold,
    );
  });

  it('places the Customer mobile label inside the field without a fake country picker', () => {
    render(
      <AuthTextField labelInside prefix="+91" label="Mobile number" value="" />,
    );
    expect(
      tree.root
        .findAllByType(Text)
        .filter(node => node.props.children === 'Mobile number'),
    ).toHaveLength(1);
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'button' }),
    ).toHaveLength(0);
  });

  it.each([
    ['phone', 'PhoneSignIn', 0.45],
    ['email', 'EmailSignIn', 0.425],
    ['otp', 'OtpVerification', 0.465],
  ] as const)(
    'aligns the %s video window with the shared player viewport',
    (variant, route, fraction) => {
      render(
        <VideoAuthLayout variant={variant}>
          <Text>Form</Text>
        </VideoAuthLayout>,
      );
      const hero = tree.root.findAllByProps({ testID: 'auth-video-window' })[0];
      expect(StyleSheet.flatten(hero.props.style).flex).toBe(fraction);
      expect(authHeroFraction(route)).toBe(fraction);
    },
  );
});
