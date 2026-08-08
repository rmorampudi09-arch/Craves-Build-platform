import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  BottomTabBar,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import {
  getFocusedRouteNameFromRoute,
  useFocusEffect,
} from '@react-navigation/native';
import {resolveMotion} from '../../design/motion';
import {useReducedMotionPreference} from '../../design/reducedMotion';
import {
  createCustomerBottomNavScrollState,
  reduceCustomerBottomNavScroll,
  revealCustomerBottomNav,
} from './customerBottomNavScroll';
import {resolveRouteChromePolicy} from './navigationPolicy';

interface CustomerBottomNavVisibilityContextValue {
  readonly animationProgress: Animated.Value;
  readonly isVisible: boolean;
  readonly handleScrollOffset: (offset: number) => void;
  readonly show: () => void;
}

const CustomerBottomNavVisibilityContext =
  createContext<CustomerBottomNavVisibilityContextValue | null>(null);

function useCustomerBottomNavVisibilityContext(): CustomerBottomNavVisibilityContextValue {
  const value = useContext(CustomerBottomNavVisibilityContext);

  if (!value) {
    throw new Error(
      'Customer bottom navigation visibility must be used inside its provider.',
    );
  }

  return value;
}

export function CustomerBottomNavVisibilityProvider({
  children,
}: PropsWithChildren) {
  const reduceMotionEnabled = useReducedMotionPreference();
  const motion = useMemo(
    () => resolveMotion('bottomNavigation', reduceMotionEnabled),
    [reduceMotionEnabled],
  );
  const animationProgress = useRef(new Animated.Value(1)).current;
  const scrollStateRef = useRef(createCustomerBottomNavScrollState());
  const visibilityRef = useRef(true);
  const [isVisible, setIsVisible] = useState(true);

  const applyVisibility = useCallback(
    (nextVisible: boolean) => {
      if (visibilityRef.current === nextVisible) {
        return;
      }

      visibilityRef.current = nextVisible;
      setIsVisible(nextVisible);
      animationProgress.stopAnimation();

      if (!motion.animate) {
        animationProgress.setValue(nextVisible ? 1 : 0);
        return;
      }

      Animated.timing(animationProgress, {
        toValue: nextVisible ? 1 : 0,
        duration: motion.durationMs,
        easing: Easing.bezier(
          motion.easing.x1,
          motion.easing.y1,
          motion.easing.x2,
          motion.easing.y2,
        ),
        useNativeDriver: true,
      }).start();
    },
    [animationProgress, motion],
  );

  const handleScrollOffset = useCallback(
    (offset: number) => {
      const nextState = reduceCustomerBottomNavScroll(
        scrollStateRef.current,
        offset,
      );
      scrollStateRef.current = nextState;
      applyVisibility(nextState.visibility === 'visible');
    },
    [applyVisibility],
  );

  const show = useCallback(() => {
    scrollStateRef.current = revealCustomerBottomNav(scrollStateRef.current);
    applyVisibility(true);
  }, [applyVisibility]);

  const value = useMemo<CustomerBottomNavVisibilityContextValue>(
    () => ({
      animationProgress,
      isVisible,
      handleScrollOffset,
      show,
    }),
    [animationProgress, handleScrollOffset, isVisible, show],
  );

  return (
    <CustomerBottomNavVisibilityContext.Provider value={value}>
      {children}
    </CustomerBottomNavVisibilityContext.Provider>
  );
}

/** Stable module-level tab-bar renderer required by React Navigation/ESLint. */
export function CustomerBottomTabBar(props: BottomTabBarProps) {
  const {animationProgress, isVisible} =
    useCustomerBottomNavVisibilityContext();
  const [barHeight, setBarHeight] = useState(0);
  const activeTabRoute = props.state.routes[props.state.index];
  const focusedChildRouteName = getFocusedRouteNameFromRoute(activeTabRoute);
  const focusedRoutePolicy =
    focusedChildRouteName === 'CustomerFilterSort'
      ? resolveRouteChromePolicy('Customer', 'CustomerFilterSort')
      : resolveRouteChromePolicy('Customer');

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setBarHeight(Math.ceil(event.nativeEvent.layout.height));
  }, []);

  if (!focusedRoutePolicy.bottomNavigationVisible) {
    return null;
  }

  const hiddenDistance = Math.max(barHeight, 96);
  const translateY = animationProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [hiddenDistance, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      onLayout={handleLayout}
      pointerEvents={isVisible ? 'auto' : 'none'}
      accessibilityElementsHidden={!isVisible}
      importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
      style={{
        opacity: animationProgress,
        transform: [{translateY}],
      }}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

export interface CustomerBottomNavScrollBinding {
  readonly onScroll: (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => void;
  readonly scrollEventThrottle: 16;
}

/**
 * Attach this binding to a vertical Customer tab-root ScrollView/FlatList/
 * FlashList. Focus reveals the bar while preserving the list's own offset.
 */
export function useCustomerBottomNavScroll(): CustomerBottomNavScrollBinding {
  const {handleScrollOffset, show} = useCustomerBottomNavVisibilityContext();

  useFocusEffect(
    useCallback(() => {
      show();
      return undefined;
    }, [show]),
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleScrollOffset(event.nativeEvent.contentOffset.y);
    },
    [handleScrollOffset],
  );

  return useMemo(
    () => ({
      onScroll,
      scrollEventThrottle: 16 as const,
    }),
    [onScroll],
  );
}

/** Tab focus/tab presses must always bring navigation back into view. */
export function useCustomerBottomNavReveal() {
  return useCustomerBottomNavVisibilityContext().show;
}
