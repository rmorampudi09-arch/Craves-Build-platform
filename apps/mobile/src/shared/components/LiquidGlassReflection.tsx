import React, {useEffect, useState, type RefObject} from 'react';
import {
  Platform,
  StyleSheet,
  UIManager,
  View,
  requireNativeComponent,
  findNodeHandle,
  type HostComponent,
  type ViewProps,
} from 'react-native';
import {homeLiquidGlass} from '../../design/tokens';

interface NativeReflectionProps extends ViewProps {
  blurTargetTag: number;
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
  const [targetTag, setTargetTag] = useState<number | null>(null);
  useEffect(() => {
    try {
      setTargetTag(NativeReflection && blurTarget?.current ? findNodeHandle(blurTarget.current) : null);
    } catch {
      setTargetTag(null);
    }
  }, [NativeReflection, blurTarget]);
  if (!NativeReflection) return null;

  return (
    <NativeReflection
      testID="live-glass-reflection"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      blurTargetTag={targetTag ?? -1}
      glassRadius={cornerRadius}
      edgeWidth={homeLiquidGlass.edgeDepth}
      captureInset={homeLiquidGlass.reflectionCaptureInset}
      bendDistance={homeLiquidGlass.reflectionBendDistance}
      style={styles.capture}
    />
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
