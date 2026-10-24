import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { useReducedMotionPreference } from '../../../design/reducedMotion';
import { colors, iconSize, spacing, touchTarget } from '../../../design/tokens';
import { loginPanelFractions } from './loginVisuals';
import {
  CravesWordmark,
  SplashDoneContext,
  WELCOME_WORDMARK_WIDTH,
  welcomeWordmarkTop,
} from './CravesWordmark';

const SHEET_MOVE_MS = 650;
// The sheet a new auth screen starts from, so moving between screens glides instead of jumping.
let lastPanelFraction: number = loginPanelFractions.resting;

interface Props extends React.PropsWithChildren {
  welcome?: boolean;
  onBack?: () => void;
  backDisabled?: boolean;
}

export function VideoAuthLayout({
  children,
  welcome = false,
  onBack,
  backDisabled,
}: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotionPreference();
  const splashDone = useContext(SplashDoneContext);
  const [androidLayoutBottom, setAndroidLayoutBottom] = useState(0);
  const [androidKeyboardTop, setAndroidKeyboardTop] = useState<number | null>(
    () =>
      Platform.OS === 'android' ? Keyboard.metrics()?.screenY ?? null : null,
  );
  const [keyboardOpen, setKeyboardOpen] = useState(() => Keyboard.isVisible());
  // Welcome rests low to show the video; the sign-in forms open half way.
  const [raised, setRaised] = useState(!welcome);
  const scrollY = useRef(0);
  const [areaHeight, setAreaHeight] = useState(
    () => Dimensions.get('window').height,
  );
  useEffect(() => {
    // Android's hide event can exclude system bars; hiding must reset to zero.
    const show = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardOpen(true);
      if (Platform.OS === 'android') {
        setAndroidKeyboardTop(event.endCoordinates.screenY);
      }
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardOpen(false);
      setAndroidKeyboardTop(null);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const androidKeyboardPadding =
    androidKeyboardTop === null
      ? 0
      : Math.max(0, androidLayoutBottom - androidKeyboardTop);
  const expanded = raised || keyboardOpen;
  const panelFraction = keyboardOpen
    ? loginPanelFractions.keyboard
    : raised
    ? loginPanelFractions.raised
    : loginPanelFractions.resting;
  // The sheet keeps its tallest height and slides on the native driver, so the
  // move stays smooth while the video decodes; resting hides its lower part.
  const sheetHeight =
    areaHeight *
    (keyboardOpen ? loginPanelFractions.keyboard : loginPanelFractions.raised);
  const hiddenBelow = (fraction: number) =>
    keyboardOpen
      ? 0
      : Math.max(0, areaHeight * (loginPanelFractions.raised - fraction));
  const offset = hiddenBelow(panelFraction);
  const slide = useRef(
    new Animated.Value(hiddenBelow(lastPanelFraction)),
  ).current;
  useEffect(() => {
    lastPanelFraction = panelFraction;
    if (reduceMotion) {
      slide.setValue(offset);
      return;
    }
    const move = Animated.timing(slide, {
      toValue: offset,
      duration: SHEET_MOVE_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    move.start();
    return () => move.stop();
  }, [slide, offset, panelFraction, reduceMotion]);
  const raise = (next: boolean) => {
    if (next !== raised) {
      setRaised(next);
    }
  };
  const raiseRef = useRef(raise);
  raiseRef.current = raise;
  const sheetPan = useMemo(
    () =>
      PanResponder.create({
        // Up opens a resting sheet; down lowers a raised one once its copy is at the top.
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          Math.abs(gesture.dy) > 10 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) &&
          (gesture.dy < 0 ? !expanded : raised && scrollY.current <= 0),
        onPanResponderRelease: (_event, gesture) =>
          raiseRef.current(gesture.dy < 0),
      }),
    [expanded, raised],
  );
  return (
    <KeyboardAvoidingView
      style={[
        styles.root,
        Platform.OS === 'android' && {
          paddingBottom: androidKeyboardPadding,
        },
      ]}
      enabled={Platform.OS === 'ios'}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      onLayout={
        Platform.OS === 'android'
          ? event => {
              const { y, height } = event.nativeEvent.layout;
              setAndroidLayoutBottom(y + height);
            }
          : undefined
      }
    >
      <StatusBar barStyle="dark-content" />
      <View
        testID="auth-video-window"
        style={styles.area}
        onLayout={event => setAreaHeight(event.nativeEvent.layout.height)}
      >
        {onBack ? (
          <Pressable
            onPress={onBack}
            disabled={backDisabled}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityState={{ disabled: Boolean(backDisabled) }}
            style={[
              styles.back,
              { top: insets.top + spacing.sm },
              backDisabled && styles.disabled,
            ]}
          >
            <ArrowLeft size={iconSize.md} color={colors.ink} />
          </Pressable>
        ) : null}
        {welcome && splashDone ? (
          <View
            testID="auth-wordmark"
            pointerEvents="none"
            style={[styles.wordmark, { top: welcomeWordmarkTop(insets.top) }]}
          >
            <CravesWordmark width={WELCOME_WORDMARK_WIDTH} />
          </View>
        ) : null}
        <Animated.View
          testID="auth-white-panel"
          style={[
            styles.panel,
            { height: sheetHeight, transform: [{ translateY: slide }] },
          ]}
          {...sheetPan.panHandlers}
        >
          <ScrollView
            style={styles.scroll}
            onScroll={event => {
              scrollY.current = event.nativeEvent.contentOffset.y;
              // Long forms scroll natively, so rolling their copy up also opens the sheet.
              if (!expanded && scrollY.current > 8) {
                raise(true);
              }
            }}
            scrollEventThrottle={16}
            contentContainerStyle={[
              styles.content,
              welcome && styles.welcomeContent,
              {
                // Room to scroll copy out of the part hidden below the screen.
                paddingBottom: Math.max(insets.bottom, spacing.sm) + offset,
                paddingLeft: Math.max(insets.left, spacing.xl),
                paddingRight: Math.max(insets.right, spacing.xl),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              testID="auth-sheet-handle"
              onPress={() => raise(!raised)}
              disabled={keyboardOpen}
              accessibilityRole="button"
              accessibilityLabel={
                raised ? 'Lower sign-in panel' : 'Raise sign-in panel'
              }
              hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
              style={styles.handleTarget}
            >
              <View style={styles.handle} />
            </Pressable>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  area: { flex: 1 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FEFEFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    gap: 12,
  },
  handleTarget: { alignSelf: 'center', paddingBottom: 10 },
  handle: {
    width: 50,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CED1D8',
  },
  welcomeContent: { gap: 10, paddingTop: 12 },
  wordmark: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  back: {
    position: 'absolute',
    left: spacing.md,
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
});
