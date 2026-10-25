import React, {memo, useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import {colors, radius} from '../../../design/tokens';
import {useReducedMotionPreference} from '../../../design/reducedMotion';

/**
 * A timer bar drawn with a native-driver scaleX, so nothing re-renders while it runs.
 * - countdown (offer): 8 dp red, the time left, shrinking to empty at `deadlineMs`.
 * - wait (free wait, door wait): 6 dp dark, the time passed, full at `deadlineMs`.
 * It runs for the time left, never longer than `totalMs`. With reduce motion on it steps once a second.
 * The bar is decorative: put the time in text next to it for TalkBack.
 */
export const CountdownBar = memo(function CountdownBarView({
  deadlineMs,
  totalMs,
  variant = 'countdown',
  testID,
}: {
  deadlineMs: number;
  totalMs: number;
  variant?: 'countdown' | 'wait';
  testID?: string;
}) {
  const reduceMotion = useReducedMotionPreference();
  const progress = useRef(new Animated.Value(variant === 'countdown' ? 1 : 0)).current;

  useEffect(() => {
    const leftMs = () => Math.min(totalMs, Math.max(0, deadlineMs - Date.now()));
    const left = () => (totalMs > 0 ? leftMs() / totalMs : 0);
    const fill = () => (variant === 'countdown' ? left() : 1 - left());
    progress.setValue(fill());
    if (reduceMotion) {
      const timer = setInterval(() => progress.setValue(fill()), 1000);
      return () => clearInterval(timer);
    }
    const animation = Animated.timing(progress, {
      toValue: variant === 'countdown' ? 0 : 1,
      duration: leftMs(),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [deadlineMs, totalMs, variant, reduceMotion, progress]);

  const wait = variant === 'wait';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, wait && styles.trackWait]}
      testID={testID}>
      <Animated.View style={[styles.fill, wait && styles.fillWait, {transform: [{scaleX: progress}]}]} />
    </View>
  );
});

const styles = StyleSheet.create({
  track: {height: 8, borderRadius: radius.pill, backgroundColor: colors.muted, overflow: 'hidden'},
  trackWait: {height: 6},
  fill: {
    height: '100%',
    width: '100%',
    backgroundColor: colors.flameRedAccessible,
    transformOrigin: 'left',
  },
  fillWait: {backgroundColor: colors.textPrimary},
});
