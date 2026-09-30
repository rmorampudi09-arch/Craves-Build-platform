import React, {type RefObject} from 'react';
import {
  Platform,
  StyleSheet,
  UIManager,
  View,
  requireNativeComponent,
  type HostComponent,
  type ViewProps,
} from 'react-native';
import {BlurView} from 'expo-blur';
import {homeLiquidGlass} from '../../design/tokens';

interface NativeReflectionProps extends ViewProps {
  glassRadius: number;
  edgeWidth: number;
  captureInset: number;
  bendDistance: number;
}

let nativeView: HostComponent<NativeReflectionProps> | undefined;

function getNativeView() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return null;
  try {
    if (!UIManager.getViewManagerConfig('CravesGlassReflection')) return null;
    nativeView ??= requireNativeComponent<NativeReflectionProps>('CravesGlassReflection');
    return nativeView;
  } catch {
    return null;
  }
}

export function LiquidGlassReflection({blurTarget, cornerRadius}: {
  blurTarget?: RefObject<View | null>;
  cornerRadius: number;
}) {
  const NativeReflection = blurTarget ? getNativeView() : null;
  if (!NativeReflection) return null;

  return (
    <NativeReflection
      testID="live-glass-reflection"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      glassRadius={cornerRadius}
      edgeWidth={homeLiquidGlass.edgeDepth}
      captureInset={homeLiquidGlass.reflectionCaptureInset}
      bendDistance={homeLiquidGlass.reflectionBendDistance}
      style={styles.capture}>
      <BlurView
        pointerEvents="none"
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={1}
        blurReductionFactor={homeLiquidGlass.blurReductionFactor}
        tint="default"
        style={StyleSheet.absoluteFill}
      />
    </NativeReflection>
  );
}

const styles = StyleSheet.create({
  // Extra real backdrop pixels keep the bent edge from stretching the crop boundary.
  capture: {
    position: 'absolute',
    top: -homeLiquidGlass.reflectionCaptureInset,
    bottom: -homeLiquidGlass.reflectionCaptureInset,
    left: -homeLiquidGlass.reflectionCaptureInset,
    right: -homeLiquidGlass.reflectionCaptureInset,
  },
});
