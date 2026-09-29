import React from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import cravesLogo from '../../../assets/brand/craves-approved-logo.png';

type SplashScreenProps = {
  logoSource?: ImageSourcePropType;
  onFinish?: () => void;
  readyToLeave?: boolean;
};

const CRAVES_RED = '#ff1707';
const ICON_SIZE = 118;

export function SplashScreen({
  logoSource = cravesLogo,
  onFinish,
  readyToLeave = false,
}: SplashScreenProps) {
  const {width, height} = Dimensions.get('window');
  const expand = React.useRef(new Animated.Value(0)).current;
  const finishOpacity = React.useRef(new Animated.Value(1)).current;
  const introCompleteRef = React.useRef(false);
  const logoOpacity = React.useRef(new Animated.Value(0)).current;
  const logoScale = React.useRef(new Animated.Value(0.72)).current;
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
    Animated.parallel([
      Animated.timing(finishOpacity, {
        toValue: 0,
        duration: 420,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 0.84,
        duration: 420,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      if (finished) {
        onFinish?.();
      }
    });
  }, [finishOpacity, logoScale, onFinish, readyToLeave]);

  React.useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(expand, {
          toValue: 1,
          duration: 760,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(220),
          Animated.parallel([
            Animated.timing(logoOpacity, {
              toValue: 1,
              duration: 240,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
              toValue: 0.92,
              friction: 7,
              tension: 90,
              useNativeDriver: true,
            }),
          ]),
        ]),
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

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, {opacity: finishOpacity}]}>
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
              transform: [{scale: iconScale}],
            },
          ]}
        />
        <Animated.Image
          source={logoSource}
          resizeMode="contain"
          style={[
            styles.logo,
            {
              opacity: logoOpacity,
              transform: [
                {translateX: logoTranslateX},
                {rotate: logoRotate},
                {scale: logoScale},
              ],
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100,
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
  logo: {
    height: 188,
    width: 192,
  },
});
