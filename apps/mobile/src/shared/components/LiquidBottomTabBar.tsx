import React, {createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren, type RefObject} from 'react';
import {StyleSheet, View} from 'react-native';
import {BottomTabBar, type BottomTabBarButtonProps, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {PlatformPressable} from '@react-navigation/elements';
import {BlurTargetView} from 'expo-blur';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, radius, spacing} from '../../design/tokens';
import {customerHaptics} from '../haptics/customerHaptics';
import {LiquidGlassSurface} from './LiquidGlassSurface';

export function LiquidTabButton(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      pressColor="transparent"
      android_ripple={{color: 'transparent', borderless: false}}
      onPress={event => {
        void customerHaptics.selection();
        props.onPress?.(event);
      }}
      style={[props.style, styles.button]}
    />
  );
}

type BlurTargets = Record<string, RefObject<View | null>>;
const ScenesContext = createContext<{
  targets: BlurTargets;
  register: (key: string, target: RefObject<View | null> | null) => void;
} | null>(null);

export function LiquidTabScenesProvider({children}: PropsWithChildren) {
  const [targets, setTargets] = useState<BlurTargets>({});
  const register = useCallback((key: string, target: RefObject<View | null> | null) => {
    setTargets(current => {
      if (target) return current[key] === target ? current : {...current, [key]: target};
      const next = {...current};
      delete next[key];
      return next;
    });
  }, []);
  return <ScenesContext.Provider value={{targets, register}}>{children}</ScenesContext.Provider>;
}

export function LiquidTabScene({routeKey, children}: PropsWithChildren<{routeKey: string}>) {
  const target = useRef<View | null>(null);
  const register = useContext(ScenesContext)?.register;
  useEffect(() => {
    register?.(routeKey, target);
    return () => register?.(routeKey, null);
  }, [register, routeKey]);
  return <BlurTargetView ref={target} style={styles.scene}>{children}</BlurTargetView>;
}

/** A reserved layout slot keeps Chef actions above the floating glass menu. */
export function LiquidBottomTabBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const targets = useContext(ScenesContext)?.targets;
  return (
    <View style={[styles.slot, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
      <View style={styles.shadow}>
        <LiquidGlassSurface
          appearance="home"
          variant="navigation"
          blurTarget={targets?.[props.state.routes[props.state.index].key]}
          style={styles.surface}>
          <BottomTabBar {...props} insets={{...props.insets, bottom: 0}} />
        </LiquidGlassSurface>
      </View>
    </View>
  );
}

// Navigation invokes tabBar as a callback, not as a React component.
export function renderLiquidBottomTabBar(props: BottomTabBarProps) {
  return <LiquidBottomTabBar {...props} />;
}

const styles = StyleSheet.create({
  scene: {flex: 1},
  button: {justifyContent: 'center', paddingVertical: 8},
  slot: {paddingHorizontal: spacing.md, paddingTop: spacing.xs},
  shadow: {
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: colors.espressoBrown,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 9},
    elevation: 9,
  },
  surface: {height: '100%', borderRadius: radius.pill, overflow: 'hidden'},
});
