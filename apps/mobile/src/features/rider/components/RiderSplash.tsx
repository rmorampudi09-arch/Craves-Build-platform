import React, {useEffect, useRef} from 'react';
import {AccessibilityInfo, Animated, Easing, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle, G, Path, Rect} from 'react-native-svg';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {useStrings} from '../strings/StringsProvider';

// The art is drawn on a 160 × 110 grid and shown at SCALE; the wheels turn on their own, so they are drawn apart.
const SCALE = 1.4;
const WIDTH = 160 * SCALE;
const HEIGHT = 110 * SCALE;
const WHEEL = 36 * SCALE;
const WHEELS = [40, 124].map(x => ({left: (x - 18) * SCALE, top: (86 - 18) * SCALE}));
const DASH = 22;
const PERIOD = 38;
const DASHES = Array.from({length: Math.ceil(WIDTH / PERIOD) + 2}, (_, i) => i);
const LINE = {fill: 'none', stroke: colors.white, strokeLinecap: 'round', strokeLinejoin: 'round'} as const;

/** A rider on a scooter with the Craves box (its dot is the brand's), without the wheels. */
function Rider() {
  return (
    <Svg width={WIDTH} height={HEIGHT} viewBox="0 0 160 110">
      <G {...LINE}>
        <Path d="M24 77 Q40 60 57 75" strokeWidth={6} />
        <Path d="M30 66 H84 L100 50" strokeWidth={8} />
        <Path d="M54 76 H104" strokeWidth={7} />
        <Path d="M100 50 L111 24" strokeWidth={7} />
        <Path d="M105 22 H122" strokeWidth={6} />
        <Path d="M106 34 L122 82" strokeWidth={6} />
        <Path d="M70 31 L64 55" strokeWidth={11} />
        <Path d="M70 37 L105 25" strokeWidth={6} />
        <Path d="M64 55 L84 57 L88 70" strokeWidth={8} />
      </G>
      <Rect x={12} y={26} width={42} height={34} rx={6} fill={colors.white} />
      <Circle cx={33} cy={43} r={7} fill={colors.flameRed} />
      <Circle cx={73} cy={18} r={11} fill={colors.white} />
      <Path d="M74 14 H85 Q86 20 80 22 H74 Z" fill={colors.flameRed} />
    </Svg>
  );
}

/** A wheel with spokes, so its turning shows. */
function Wheel() {
  return (
    <Svg width={WHEEL} height={WHEEL} viewBox="-18 -18 36 36">
      <Circle r={15} fill="none" stroke={colors.white} strokeWidth={5} />
      <Circle r={4} fill={colors.white} />
      <Path d="M0 -11 V11 M-9.5 -5.5 L9.5 5.5 M-9.5 5.5 L9.5 -5.5" stroke={colors.white} strokeWidth={2} />
    </Svg>
  );
}

/**
 * The rider app while it finds out who is signed in (RiderNavigator): a Craves rider riding along on the brand red, the
 * wheels turning and the road passing. Native-driven loops, so a busy JS thread doesn't stutter them; still with Reduce
 * motion on. TalkBack reads it as loading.
 */
export function RiderSplash() {
  const {strings} = useStrings();
  const ride = useRef(new Animated.Value(0)).current;
  const bump = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    let loops: Animated.CompositeAnimation[] = [];
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then(reduceMotion => {
        if (!mounted || reduceMotion) {
          return;
        }
        loops = [
          Animated.loop(Animated.timing(ride, {toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true})),
          Animated.loop(
            Animated.sequence([
              Animated.timing(bump, {toValue: 1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
              Animated.timing(bump, {toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
            ]),
          ),
        ];
        loops.forEach(loop => loop.start());
      });
    return () => {
      mounted = false;
      loops.forEach(loop => loop.stop());
    };
  }, [ride, bump]);

  const turn = ride.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']});
  const road = ride.interpolate({inputRange: [0, 1], outputRange: [0, -PERIOD]});
  const lift = bump.interpolate({inputRange: [0, 1], outputRange: [0, -3]});

  return (
    <SafeAreaView style={styles.splash} testID="rider-splash">
      <StatusBar barStyle="light-content" backgroundColor={colors.flameRed} />
      <View accessible accessibilityRole="progressbar" accessibilityLabel={strings.states.loading} style={styles.centre}>
        <View style={styles.stage}>
          <Animated.View style={{transform: [{translateY: lift}]}}>
            <Rider />
            {WHEELS.map(place => (
              <Animated.View key={place.left} style={[styles.wheel, place, {transform: [{rotate: turn}]}]}>
                <Wheel />
              </Animated.View>
            ))}
          </Animated.View>
          <View style={styles.road}>
            <Animated.View style={[styles.dashes, {transform: [{translateX: road}]}]}>
              {DASHES.map(i => (
                <View key={i} style={styles.dash} />
              ))}
            </Animated.View>
          </View>
        </View>
        <Text style={styles.brand}>{strings.signIn.brand}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splash: {flex: 1, backgroundColor: colors.flameRed},
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl},
  stage: {width: WIDTH, alignItems: 'center'},
  wheel: {position: 'absolute', width: WHEEL, height: WHEEL},
  road: {width: WIDTH, height: 6, marginTop: spacing.xs, overflow: 'hidden'},
  dashes: {flexDirection: 'row', gap: PERIOD - DASH},
  dash: {width: DASH, height: 6, borderRadius: 3, backgroundColor: colors.white},
  brand: {marginTop: spacing.xl, fontSize: typography.title, fontWeight: fontWeight.bold, color: colors.white},
});
