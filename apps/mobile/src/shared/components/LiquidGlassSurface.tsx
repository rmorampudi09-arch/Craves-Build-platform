import React, { useId, useState, type RefObject } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { radius } from '../../design/tokens';

interface LiquidGlassSurfaceProps extends ViewProps {
  blurTarget?: RefObject<View | null>;
  variant?: 'image' | 'navigation';
  cornerRadius?: number;
}

function supportsNativeGlass() {
  try {
    return (
      Platform.OS === 'ios' &&
      isGlassEffectAPIAvailable() &&
      isLiquidGlassAvailable()
    );
  } catch {
    return false;
  }
}

const nativeGlassAvailable = supportsNativeGlass();

/** Keep the backdrop separate from the surface so Android never samples its own glass. */
export function LiquidGlassSurface({
  blurTarget,
  variant = 'image',
  cornerRadius = radius.pill,
  children,
  style,
  onLayout,
  ...props
}: LiquidGlassSurfaceProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const navigation = variant === 'navigation';
  const rimWidth = navigation ? 1.5 : 1.8;
  const hasAndroidBlur = Boolean(blurTarget) && Number(Platform.Version) >= 31;
  const roundedCorner = Math.min(cornerRadius, size.width / 2, size.height / 2);

  return (
    <View
      {...props}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setSize(current =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        );
        onLayout?.(event);
      }}
      style={[styles.surface, { borderRadius: cornerRadius }, style]}
    >
      {nativeGlassAvailable ? (
        <GlassView
          pointerEvents="none"
          colorScheme="light"
          glassEffectStyle="regular"
          isInteractive={false}
          tintColor={
            navigation ? 'rgba(255,255,255,0.16)' : 'rgba(80,80,80,0.12)'
          }
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <BlurView
          pointerEvents="none"
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={2.5}
          intensity={navigation ? 66 : 38}
          tint={
            navigation
              ? 'systemUltraThinMaterialLight'
              : 'systemUltraThinMaterial'
          }
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          navigation ? styles.navigationWash : styles.imageWash,
          Platform.OS === 'android' &&
            !hasAndroidBlur &&
            (navigation ? styles.navigationFallback : styles.imageFallback),
        ]}
      />
      {size.width > 0 && size.height > 0 ? (
        <Svg
          pointerEvents="none"
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <LinearGradient
              id={`${gradientId}wash`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <Stop
                offset="0"
                stopColor="white"
                stopOpacity={navigation ? 0.32 : 0.34}
              />
              <Stop offset="0.45" stopColor="white" stopOpacity="0.02" />
              <Stop
                offset="1"
                stopColor="white"
                stopOpacity={navigation ? 0.14 : 0.2}
              />
            </LinearGradient>
            <LinearGradient
              id={`${gradientId}rim`}
              x1="0%"
              y1="0%"
              x2="85%"
              y2="100%"
            >
              <Stop offset="0" stopColor="white" stopOpacity="0.94" />
              <Stop
                offset="0.48"
                stopColor="white"
                stopOpacity={navigation ? 0.24 : 0.32}
              />
              <Stop
                offset="1"
                stopColor="white"
                stopOpacity={navigation ? 0.72 : 0.84}
              />
            </LinearGradient>
          </Defs>
          <Rect
            width={size.width}
            height={size.height}
            rx={roundedCorner}
            fill={`url(#${gradientId}wash)`}
          />
          <Rect
            x={rimWidth / 2}
            y={rimWidth / 2}
            width={Math.max(0, size.width - rimWidth)}
            height={Math.max(0, size.height - rimWidth)}
            rx={Math.max(0, roundedCorner - rimWidth / 2)}
            fill="none"
            stroke={`url(#${gradientId}rim)`}
            strokeWidth={rimWidth}
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' },
  imageWash: { backgroundColor: 'rgba(24,24,24,0.18)' },
  navigationWash: { backgroundColor: 'rgba(255,255,255,0.16)' },
  imageFallback: { backgroundColor: 'rgba(40,40,40,0.28)' },
  navigationFallback: { backgroundColor: 'rgba(255,255,255,0.62)' },
});
