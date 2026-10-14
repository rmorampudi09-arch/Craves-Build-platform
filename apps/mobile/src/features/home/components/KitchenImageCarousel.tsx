import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { colors, radius, spacing } from '../../../design/tokens';
import { useReducedMotionPreference } from '../../../design/reducedMotion';
import { Icon } from '../../../shared/components/Icon';
import { LiquidGlassSurface } from '../../../shared/components/LiquidGlassSurface';

export const KITCHEN_PHOTO_ADVANCE_MS = 4_000;
const FADE_MS = 650;

export function KitchenImageCarousel({
  imageUrls,
  width,
  height,
  kitchenName,
  active,
  onPress,
  startDelayMs = 0,
  pager = 'center',
}: {
  imageUrls: readonly string[];
  width: number;
  height: number;
  kitchenName: string;
  active: boolean;
  onPress: () => void;
  /** Offsets this card's timer so a row of cards does not change all at once. */
  startDelayMs?: number;
  /** 'glass-right': the kitchen page's dots, bottom-right in a glass capsule. */
  pager?: 'center' | 'glass-right';
}) {
  const slides = useMemo(
    () => (imageUrls.length ? imageUrls : [null]),
    [imageUrls],
  );
  // Each photo fades in over the one below it; position k means photo k is fully shown.
  const position = useRef(new Animated.Value(0)).current;
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  const reduceMotion = useReducedMotionPreference();
  const photoTarget = useRef<View | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state =>
      setAppActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    position.setValue(0);
  }, [position, slides]);

  useEffect(() => {
    if (!active || !appActive || reduceMotion || slides.length < 2)
      return undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    const advance = () => {
      const from = activeIndexRef.current;
      const next = (from + 1) % slides.length;
      activeIndexRef.current = next;
      setActiveIndex(next);
      // After the last photo comes a copy of the first on top, so the loop always moves forward.
      Animated.timing(position, {
        toValue: from + 1,
        duration: FADE_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && next === 0) position.setValue(0);
      });
    };
    const delay = setTimeout(() => {
      interval = setInterval(advance, KITCHEN_PHOTO_ADVANCE_MS);
    }, startDelayMs);
    return () => {
      clearTimeout(delay);
      if (interval) clearInterval(interval);
      position.stopAnimation();
      position.setValue(activeIndexRef.current);
    };
  }, [active, appActive, position, reduceMotion, slides.length, startDelayMs]);

  const layers = slides.length > 1 ? [...slides, slides[0]] : slides;
  const firstDot = Math.max(0, Math.min(activeIndex - 2, slides.length - 5));
  const glassPager = pager === 'glass-right';
  const pagerLabel = `Kitchen photo ${activeIndex + 1} of ${slides.length}`;
  const dots = slides.slice(firstDot, firstDot + 5).map((url, index) => (
    <View
      key={`${firstDot + index}:${url}`}
      style={[
        styles.dot,
        glassPager && styles.glassDot,
        firstDot + index === activeIndex &&
          (glassPager ? styles.glassActiveDot : styles.activeDot),
      ]}
    />
  ));

  const photos = (
    <Pressable
      accessibilityLabel={`Open ${kitchenName}, photo ${activeIndex + 1}`}
      accessibilityRole="button"
      onPress={onPress}
      style={StyleSheet.absoluteFill}
    >
      {layers.map((url, index) => (
        <Animated.View
          key={`${index}:${url}`}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            index > 0 && {
              opacity: position.interpolate({
                inputRange: [index - 1, index],
                outputRange: [0, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          {url ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: url }}
              resizeMode="cover"
              style={styles.image}
            />
          ) : (
            <View style={styles.placeholder}>
              <Icon
                name="chef"
                size={34}
                color={colors.flameRedAccessible}
                surface={false}
              />
            </View>
          )}
        </Animated.View>
      ))}
    </Pressable>
  );

  return (
    <View style={[styles.carousel, { width, height }]}>
      {glassPager ? (
        // The glass blurs the photos, so they sit in their own blur target.
        <BlurTargetView ref={photoTarget} style={StyleSheet.absoluteFill}>
          {photos}
        </BlurTargetView>
      ) : (
        photos
      )}
      {slides.length > 1 && glassPager ? (
        <LiquidGlassSurface
          accessibilityLabel={pagerLabel}
          accessibilityRole="text"
          appearance="home"
          blurTarget={photoTarget}
          cornerRadius={14}
          pointerEvents="none"
          style={styles.glassPagination}
        >
          {dots}
        </LiquidGlassSurface>
      ) : slides.length > 1 ? (
        <View
          accessibilityLabel={pagerLabel}
          accessibilityRole="text"
          pointerEvents="none"
          style={styles.pagination}
        >
          {dots}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  pagination: {
    position: 'absolute',
    left: 74,
    right: 88,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  activeDot: { backgroundColor: colors.white },
  glassPagination: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  glassDot: { borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  glassActiveDot: { width: 16, backgroundColor: colors.white },
});
