import React, {useEffect, useState, type RefObject} from 'react';
import {Platform, findNodeHandle, type View, type ViewProps} from 'react-native';
import {requireNativeViewManager} from 'expo-modules-core';

export interface LiquidGlassOptics {
  /** 0 to 1; 0.5 is physical glass (index 1.5) and 1 bends twice as far. */
  readonly refraction: number;
  /** Frost under the lens, in dp; 0 is clear glass. */
  readonly blurRadius: number;
  /** Width of the curved bezel as a fraction of the shortest side. */
  readonly bezel: number;
  /** Glass height relative to the bezel width; taller glass bends more. */
  readonly thickness: number;
  /** Red/blue split at the bezel; 0 is off. */
  readonly aberration: number;
  /** Colour saturation of what shows through; 1 is unchanged. */
  readonly saturation: number;
  /** Straight RGB plus how much of it covers the backdrop, all 0 to 1. */
  readonly tint: readonly [number, number, number, number];
  /** Strength of the rim light. */
  readonly specular: number;
  /** How much the curved ends glow (Fresnel plus gathered light); 0 is off. */
  readonly edgeGlow: number;
}

type NativeLiquidGlassProps = ViewProps &
  Omit<LiquidGlassOptics, 'tint'> & {
    cornerRadius: number;
    targetId?: number;
    tint: number[];
  };

/** The lens is an AGSL runtime shader, which Android only offers from 13. */
export const liquidGlassRefractionAvailable =
  Platform.OS === 'android' && Number(Platform.Version) >= 33;

const NativeLiquidGlassView = liquidGlassRefractionAvailable
  ? requireNativeViewManager<NativeLiquidGlassProps>(
      'CravesLiquidGlass',
      'CravesLiquidGlassView',
    )
  : null;

interface LiquidGlassBackdropProps extends ViewProps {
  optics: LiquidGlassOptics;
  cornerRadius: number;
  /** An expo-blur BlurTargetView behind the glass, never one that contains it. */
  target: RefObject<View | null>;
}

export function LiquidGlassBackdrop({
  optics,
  cornerRadius,
  target,
  ...props
}: LiquidGlassBackdropProps) {
  const [targetId, setTargetId] = useState<number>();

  // The target mounts independently of the glass, so re-check its handle after each render.
  useEffect(() => {
    const next = target.current ? findNodeHandle(target.current) ?? undefined : undefined;
    setTargetId(current => (current === next ? current : next));
  });

  if (!NativeLiquidGlassView) return null;
  return (
    <NativeLiquidGlassView
      {...props}
      {...optics}
      tint={[...optics.tint]}
      cornerRadius={cornerRadius}
      targetId={targetId}
    />
  );
}
