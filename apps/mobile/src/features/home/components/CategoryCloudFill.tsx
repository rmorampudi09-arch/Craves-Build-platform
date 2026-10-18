import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import Svg, {Circle, Defs, RadialGradient, Stop} from 'react-native-svg';

/** Medium speed from the demo: fills in 800 ms, clears 1.6x faster. */
export const CLOUD_FILL_MS = 800;
const CLOUD_CLEAR_MS = CLOUD_FILL_MS / 1.6;
const PUFF_COUNT = 9;
/** Share of the run each puff takes to grow; the latest one starts at 0.42, so all end by 1. */
const PUFF_GROW = 0.58;
const MAX_DELAY = 1 - PUFF_GROW;
/** The solid layer fades in over the last part, so the row ends evenly coloured. */
const BASE_FROM = 0.78;
/** Labels switch to white once the cloud covers most of the row. */
export const CLOUD_LABELS_ON_COLOR_AT = 0.62;

export interface Puff {
  x: number;
  y: number;
  size: number;
  delay: number;
}

/** Puffs spread along the top edge with jitter, so each pin gives a slightly different cloud. */
export function makeCloudPuffs(width: number, random: () => number = Math.random): Puff[] {
  return Array.from({length: PUFF_COUNT}, (_, index) => ({
    x: ((index + 0.5) * width) / PUFF_COUNT + (random() - 0.5) * 30,
    y: -18 + random() * 26,
    size: 150 + random() * 120,
    delay: 0.01 + random() * (MAX_DELAY - 0.01),
  }));
}

// Ease-out cubic as interpolation points: the native driver can't run an easing function here.
const GROW_POINTS = [0, 0.25, 0.5, 0.75, 1];
const GROW_VALUES = [0.001, 0.578, 0.875, 0.984, 1];

interface CategoryCloudFillProps {
  active: boolean;
  color: string;
  width: number;
  /** Called when the row becomes mostly coloured (true) or mostly white again (false). */
  onCoveredChange?: (covered: boolean) => void;
}

/**
 * Fills the pinned category row with the header colour as soft cloud puffs that grow at
 * different times, then a solid layer evens it out. Transforms and opacity only (native driver).
 */
export function CategoryCloudFill({active, color, width, onCoveredChange}: CategoryCloudFillProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const atRest = useRef(true);
  const [seed, setSeed] = useState(0);
  const puffs = useMemo(() => (width > 0 ? makeCloudPuffs(width) : []), [width, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // A fresh pin from fully white gets a new cloud shape.
    if (active && atRest.current) setSeed(value => value + 1);
    atRest.current = false;
    const animation = Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: active ? CLOUD_FILL_MS : CLOUD_CLEAR_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start(({finished}) => {
      if (finished && !active) atRest.current = true;
    });
    const timer = setTimeout(
      () => onCoveredChange?.(active),
      active ? CLOUD_FILL_MS * CLOUD_LABELS_ON_COLOR_AT : CLOUD_CLEAR_MS * (1 - CLOUD_LABELS_ON_COLOR_AT),
    );
    return () => {
      animation.stop();
      clearTimeout(timer);
    };
  }, [active, onCoveredChange, progress]);

  return (
    <View pointerEvents="none" style={styles.fill} testID="home-category-cloud">
      {puffs.map((puff, index) => (
        <Animated.View
          key={`${seed}-${index}`}
          style={[
            styles.puff,
            {
              left: puff.x - puff.size / 2,
              top: puff.y - puff.size / 2,
              width: puff.size,
              height: puff.size,
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, ...GROW_POINTS.map(point => puff.delay + point * PUFF_GROW)],
                    outputRange: [0.001, ...GROW_VALUES],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}>
          <Svg width={puff.size} height={puff.size}>
            <Defs>
              <RadialGradient id={`puff-${index}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0.73" stopColor={color} stopOpacity={1} />
                <Stop offset="0.87" stopColor={color} stopOpacity={0.55} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={puff.size / 2} cy={puff.size / 2} r={puff.size / 2} fill={`url(#puff-${index})`} />
          </Svg>
        </Animated.View>
      ))}
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            opacity: progress.interpolate({inputRange: [BASE_FROM, 1], outputRange: [0, 1], extrapolate: 'clamp'}),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden'},
  puff: {position: 'absolute'},
});
