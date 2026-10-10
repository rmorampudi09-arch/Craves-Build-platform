import React from 'react';
import renderer, { act } from 'react-test-renderer';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  type KeyboardEvent,
} from 'react-native';
import { LinearGradient, Stop } from 'react-native-svg';
import { AuthRoleCards } from './AuthRoleCards';
import { AuthActionButton } from './AuthActionButton';
import { AuthSurfaceFinish } from './AuthSurfaceFinish';
import { AuthTextField } from './AuthTextField';
import { VideoAuthLayout } from './VideoAuthLayout';
import { SplashDoneContext } from './CravesWordmark';
import { loginFonts, loginPanelFractions } from './loginVisuals';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
let mockReduceMotion = true;
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => mockReduceMotion,
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
    mockReduceMotion = true;
    jest.useRealTimers();
  });
  // Share of the screen the sheet shows: its height minus what slides below the edge.
  const panelFlex = () => {
    const style = StyleSheet.flatten(
      tree.root.findAll(
        node =>
          node.props.testID === 'auth-white-panel' &&
          typeof node.type === 'string',
      )[0].props.style,
    );
    const slid = style.transform?.[0]?.translateY ?? 0;
    return (style.height - slid) / Dimensions.get('window').height;
  };

  it.each(['android', 'ios'] as const)(
    'avoids the keyboard on %s without changing the normal layout',
    platform => {
      const replacement = jest.replaceProperty(Platform, 'OS', platform);
      try {
        render(
          <VideoAuthLayout>
            <Text>Form</Text>
          </VideoAuthLayout>,
        );
        expect(tree.root.findByType(KeyboardAvoidingView).props.behavior).toBe(
          platform === 'ios' ? 'padding' : undefined,
        );
        expect(tree.root.findByType(KeyboardAvoidingView).props.enabled).toBe(
          platform === 'ios',
        );
      } finally {
        replacement.restore();
      }
    },
  );

  it('clears Android keyboard spacing even when the hide frame excludes system bars', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const handlers: Record<string, (event: KeyboardEvent) => void> = {};
    const removals: jest.SpyInstance[] = [];
    const addListener = Keyboard.addListener.bind(Keyboard);
    const listener = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((name, callback) => {
        handlers[name] = callback;
        const subscription = addListener(name, callback);
        removals.push(jest.spyOn(subscription, 'remove'));
        return subscription;
      });
    const metrics = jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
    try {
      render(
        <VideoAuthLayout>
          <Text>Form</Text>
        </VideoAuthLayout>,
      );
      const root = () => tree.root.findByType(KeyboardAvoidingView);
      const padding = () =>
        StyleSheet.flatten(root().props.style).paddingBottom;
      act(() => {
        root().props.onLayout({
          nativeEvent: { layout: { y: 0, height: 800 } },
        });
      });
      expect(padding()).toBe(0);
      act(() => {
        handlers.keyboardDidShow({
          endCoordinates: { screenY: 520, height: 280 },
        } as KeyboardEvent);
      });
      expect(padding()).toBe(280);
      act(() => {
        root().props.onLayout({
          nativeEvent: { layout: { y: 0, height: 900 } },
        });
      });
      expect(padding()).toBe(380);
      act(() => {
        handlers.keyboardDidHide({
          endCoordinates: { screenY: 840, height: 0 },
        } as KeyboardEvent);
      });
      expect(padding()).toBe(0);
      act(() => tree.unmount());
      expect(removals.length).toBeGreaterThanOrEqual(2);
      expect(removals.every(remove => remove.mock.calls.length === 1)).toBe(
        true,
      );
    } finally {
      removals.forEach(remove => remove.mockRestore());
      listener.mockRestore();
      metrics.mockRestore();
      platform.restore();
    }
  });

  it('keeps welcome tiles slim with the label beside the icon in the bundled bold face', () => {
    render(<AuthRoleCards welcome value="CUSTOMER" onChange={jest.fn()} />);
    const card = tree.root.findAllByProps({ testID: 'login-role-customer' })[0];
    expect(
      StyleSheet.flatten(card.props.style({ pressed: false })).minHeight,
    ).toBeUndefined();
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

  it('keeps the welcome wordmark hidden until the splash has handed its lettering over', () => {
    const wordmarks = () =>
      tree.root.findAll(
        node =>
          typeof node.type === 'string' &&
          node.props.testID === 'auth-wordmark',
      );
    render(
      <SplashDoneContext.Provider value={false}>
        <VideoAuthLayout welcome>
          <Text>Welcome</Text>
        </VideoAuthLayout>
      </SplashDoneContext.Provider>,
    );
    expect(wordmarks()).toHaveLength(0);
    act(() =>
      tree.update(
        <SplashDoneContext.Provider value>
          <VideoAuthLayout welcome>
            <Text>Welcome</Text>
          </VideoAuthLayout>
        </SplashDoneContext.Provider>,
      ),
    );
    expect(wordmarks()).toHaveLength(1);
    expect(wordmarks()[0].props.style).toContainEqual({ top: 24 + 16 });
  });

  it('rests the welcome sheet at a third and raises it to half', () => {
    render(
      <VideoAuthLayout welcome>
        <Text>Form</Text>
      </VideoAuthLayout>,
    );
    expect(panelFlex()).toBeCloseTo(loginPanelFractions.resting);
    const handle = () =>
      tree.root.findAllByProps({ testID: 'auth-sheet-handle' })[0];
    act(() => handle().props.onPress());
    expect(panelFlex()).toBeCloseTo(loginPanelFractions.raised);
    expect(handle().props.accessibilityLabel).toBe('Lower sign-in panel');
    act(() => handle().props.onPress());
    expect(panelFlex()).toBeCloseTo(loginPanelFractions.resting);
  });

  it('glides a sign-in form up from the welcome height to half the screen', () => {
    render(
      <VideoAuthLayout welcome>
        <Text>Welcome</Text>
      </VideoAuthLayout>,
    );
    act(() => tree.unmount());
    mockReduceMotion = false;
    const timing = jest.spyOn(Animated, 'timing');
    try {
      render(
        <VideoAuthLayout>
          <Text>Form</Text>
        </VideoAuthLayout>,
      );
      // It appears where the welcome sheet was, then slides natively until nothing is hidden.
      expect(panelFlex()).toBeCloseTo(loginPanelFractions.resting);
      const config = timing.mock.calls.at(
        -1,
      )![1] as Animated.TimingAnimationConfig;
      expect(config).toMatchObject({ toValue: 0, useNativeDriver: true });
      expect(config.duration).toBeGreaterThanOrEqual(600);
    } finally {
      timing.mockRestore();
    }
  });
});
