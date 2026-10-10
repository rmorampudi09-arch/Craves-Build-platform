import React from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  CravesWordmark,
  SPLASH_WORDMARK_OFFSET_Y,
  SPLASH_WORDMARK_WIDTH,
  WELCOME_WORDMARK_WIDTH,
  welcomeWordmarkTop,
  wordmarkHeight,
} from '../components/CravesWordmark';

type SplashScreenProps = {
  onFinish?: () => void;
  readyToLeave?: boolean;
  /** Asked when leaving: true flies the lettering up into the welcome screen's wordmark. */
  movesToWelcome?: () => boolean;
};

const CRAVES_RED = '#ff1707';
const ICON_SIZE = 118;

export function SplashScreen({
  onFinish,
  readyToLeave = false,
  movesToWelcome,
}: SplashScreenProps) {
  const {width, height} = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  const [rootHeight, setRootHeight] = React.useState(height);
  const fly = React.useRef(new Animated.Value(0)).current;
  const backgroundOpacity = React.useRef(new Animated.Value(1)).current;
  const expand = React.useRef(new Animated.Value(0)).current;
  const finishOpacity = React.useRef(new Animated.Value(1)).current;
  const introCompleteRef = React.useRef(false);
  const logoOpacity = React.useRef(new Animated.Value(1)).current;
  const logoScale = React.useRef(new Animated.Value(1)).current;
  const shake = React.useRef(new Animated.Value(0)).current;
  const exitStartedRef = React.useRef(false);

  const expandScale = React.useMemo(() => {
    const longestSide = Math.max(width, height);
    return longestSide / ICON_SIZE + 2.6;
  }, [height, width]);

  const startExit = React.useCallback(() => {
    if (exitStartedRef.current || !introCompleteRef.current || !readyToLeave) {
      return;
    }

    exitStartedRef.current = true;
    const exit = movesToWelcome?.()
      ? Animated.parallel([
          Animated.timing(fly, {
            toValue: 1,
            duration: 850,
            easing: Easing.bezier(0.65, 0, 0.35, 1),
            useNativeDriver: true,
          }),
          Animated.timing(backgroundOpacity, {
            toValue: 0,
            duration: 600,
            delay: 100,
            easing: Easing.bezier(0, 0, 0.58, 1),
            useNativeDriver: true,
          }),
        ])
      : Animated.parallel([
          Animated.timing(finishOpacity, {
            toValue: 0,
            duration: 420,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 0.92,
            duration: 420,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);
    exit.start(({finished}) => {
      if (finished) {
        onFinish?.();
      }
    });
  }, [
    backgroundOpacity,
    finishOpacity,
    fly,
    logoScale,
    movesToWelcome,
    onFinish,
    readyToLeave,
  ]);

  React.useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(expand, {
          toValue: 1,
          duration: 760,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(shake, {
          toValue: 1,
          duration: 78,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: -1,
          duration: 78,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: 0.75,
          duration: 70,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: -0.45,
          duration: 62,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: 0,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(380),
    ]);

    animation.start(({finished}) => {
      if (finished) {
        introCompleteRef.current = true;
        startExit();
      }
    });

    return () => {
      animation.stop();
    };
  }, [expand, logoOpacity, logoScale, shake, startExit]);

  React.useEffect(() => {
    startExit();
  }, [readyToLeave, startExit]);

  const iconScale = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [1, expandScale],
  });

  const iconRadius = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 2],
  });

  const logoTranslateX = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-4, 0, 4],
  });

  const logoRotate = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-1.15deg', '0deg', '1.15deg'],
  });

  // Centre-to-centre path from the splash lettering to the welcome wordmark.
  const welcomeCenterY =
    welcomeWordmarkTop(insets.top) +
    wordmarkHeight(WELCOME_WORDMARK_WIDTH) / 2;
  const flyY = fly.interpolate({
    inputRange: [0, 1],
    outputRange: [SPLASH_WORDMARK_OFFSET_Y, welcomeCenterY - rootHeight / 2],
  });
  const flyScale = fly.interpolate({
    inputRange: [0, 1],
    outputRange: [1, WELCOME_WORDMARK_WIDTH / SPLASH_WORDMARK_WIDTH],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, {opacity: finishOpacity}]}
      onLayout={event => setRootHeight(event.nativeEvent.layout.height)}>
      <Animated.View
        style={[styles.background, {opacity: backgroundOpacity}]}
      />
      <StatusBar
        animated
        backgroundColor={CRAVES_RED}
        barStyle="light-content"
        hidden={Platform.OS === 'ios'}
      />
      <View style={styles.centerStage}>
        <Animated.View
          style={[
            styles.expandingIcon,
            {
              borderRadius: iconRadius,
              opacity: backgroundOpacity,
              transform: [{scale: iconScale}],
            },
          ]}
        />
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [
              {translateY: flyY},
              {translateX: logoTranslateX},
              {rotate: logoRotate},
              {scale: logoScale},
              {scale: flyScale},
            ],
          }}>
          <CravesWordmark width={SPLASH_WORDMARK_WIDTH} shadow={fly} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100,
  },
  background: {
    ...StyleSheet.absoluteFill,
    backgroundColor: CRAVES_RED,
  },
  centerStage: {
    alignItems: 'center',
    height: ICON_SIZE,
    justifyContent: 'center',
    width: ICON_SIZE,
  },
  expandingIcon: {
    backgroundColor: CRAVES_RED,
    height: ICON_SIZE,
    position: 'absolute',
    width: ICON_SIZE,
  },
});
