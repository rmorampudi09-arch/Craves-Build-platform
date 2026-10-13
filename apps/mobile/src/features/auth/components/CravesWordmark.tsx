import React from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import wordmark from '../../../assets/brand/craves-wordmark-white.png';

// The white lettering cut from craves-splash-logo.png (432px icon), 292x84px.
const ASPECT = 292 / 84;
const SPLASH_ICON_SIZE = 240;
const SPLASH_ICON_PX = 432;
/** The lettering's size and offset inside the 240dp splash icon, so swapping the icon for it doesn't move. */
export const SPLASH_WORDMARK_WIDTH = (292 * SPLASH_ICON_SIZE) / SPLASH_ICON_PX;
export const SPLASH_WORDMARK_OFFSET_Y =
  ((198 - SPLASH_ICON_PX / 2) * SPLASH_ICON_SIZE) / SPLASH_ICON_PX;
export const WELCOME_WORDMARK_WIDTH = 130;

export const wordmarkHeight = (width: number) => width / ASPECT;
/** Top of the welcome wordmark; the splash flies its lettering to exactly here. */
export const welcomeWordmarkTop = (insetTop: number) => insetTop + 16;

/** False while the splash still owns the lettering, so the welcome screen doesn't show a second copy. */
export const SplashDoneContext = React.createContext(true);

interface Props {
  width: number;
  /** 0–1 strength of the soft shadow that keeps white text readable over the video. */
  shadow?: number | Animated.AnimatedInterpolation<number> | Animated.Value;
}

export function CravesWordmark({ width, shadow = 1 }: Props) {
  return (
    <View
      style={{ width, height: wordmarkHeight(width) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.fill, styles.shadow, { opacity: shadow }]}>
        <Image source={wordmark} style={styles.fill} />
      </Animated.View>
      <Image source={wordmark} style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  shadow: {
    filter: [
      {
        dropShadow: {
          offsetX: 0,
          offsetY: 1,
          standardDeviation: 3,
          color: 'rgba(0,0,0,0.35)',
        },
      },
    ],
  },
});
