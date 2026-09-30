import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors, radius, spacing } from '../../../design/tokens';
import { useReducedMotionPreference } from '../../../design/reducedMotion';
import { Icon } from '../../../shared/components/Icon';

const AUTO_ADVANCE_MS = 2_000;

export function KitchenImageCarousel({
  imageUrls,
  width,
  height,
  kitchenName,
  active,
  onPress,
}: {
  imageUrls: readonly string[];
  width: number;
  height: number;
  kitchenName: string;
  active: boolean;
  onPress: () => void;
}) {
  const slides = useMemo(
    () => (imageUrls.length ? imageUrls : [null]),
    [imageUrls],
  );
  const listRef = useRef<ScrollView>(null);
  const activeIndexRef = useRef(0);
  const isMomentumRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  const reduceMotion = useReducedMotionPreference();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state =>
      setAppActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    activeIndexRef.current = 0;
    isMomentumRef.current = false;
    setActiveIndex(0);
    listRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides, width]);

  useEffect(() => {
    if (
      !active ||
      !appActive ||
      reduceMotion ||
      width <= 0 ||
      slides.length < 2
    )
      return undefined;
    const interval = setInterval(() => {
      if (isMomentumRef.current) return;
      listRef.current?.scrollTo({
        x: ((activeIndexRef.current + 1) % slides.length) * width,
        animated: true,
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [active, appActive, reduceMotion, slides.length, width]);

  const syncPosition = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const index = Math.max(
      0,
      Math.min(
        slides.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / width),
      ),
    );
    activeIndexRef.current = index;
    setActiveIndex(index);
  };
  const firstDot = Math.max(0, Math.min(activeIndex - 2, slides.length - 5));

  return (
    <View style={[styles.carousel, { width, height }]}>
      <ScrollView
        ref={listRef}
        testID="kitchen-photo-scroll"
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        removeClippedSubviews={false}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ width, height }}
        onScroll={syncPosition}
        scrollEventThrottle={16}
        onMomentumScrollBegin={() => {
          isMomentumRef.current = true;
        }}
        onMomentumScrollEnd={event => {
          isMomentumRef.current = false;
          syncPosition(event);
        }}
      >
        {slides.map((url, index) => (
          <Pressable
            key={`${index}:${url}`}
            accessibilityLabel={`Open ${kitchenName}, photo ${index + 1}`}
            accessibilityRole="button"
            onPress={onPress}
            style={{ width, height }}
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
          </Pressable>
        ))}
      </ScrollView>
      {slides.length > 1 ? (
        <View
          accessibilityLabel={`Kitchen photo ${activeIndex + 1} of ${
            slides.length
          }`}
          accessibilityRole="text"
          pointerEvents="none"
          style={styles.pagination}
        >
          {slides.slice(firstDot, firstDot + 5).map((url, index) => (
            <View
              key={`${firstDot + index}:${url}`}
              style={[
                styles.dot,
                firstDot + index === activeIndex && styles.activeDot,
              ]}
            />
          ))}
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
});
