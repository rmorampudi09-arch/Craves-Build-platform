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
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  BottomTabBar,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import {
  CommonActions,
  getFocusedRouteNameFromRoute,
  useFocusEffect,
} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAppSelector} from '../store/hooks';
import {resolveMotion} from '../../design/motion';
import {useReducedMotionPreference} from '../../design/reducedMotion';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../design/tokens';
import {
  selectCartFoodSubtotal,
  selectCartItemCount,
} from '../../features/cart/state/cartSelectors';
import {formatCartMoney} from '../../features/cart/viewCartOverlayModel';
import {Icon} from '../../shared/components/Icon';
import {
  createCustomerBottomNavScrollState,
  reduceCustomerBottomNavScroll,
  revealCustomerBottomNav,
} from './customerBottomNavScroll';
import {resolveRouteChromePolicy} from './navigationPolicy';
import type {RegisteredRouteName} from './types';

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

/**
 * React Navigation invokes the `tabBar` renderer as a callback. Keep that
 * callback hook-free and render a real component boundary before using hooks.
 */
export function CustomerBottomTabBar(props: BottomTabBarProps) {
  return <CustomerBottomTabBarContent {...props} />;
}

function CustomerBottomTabBarContent(props: BottomTabBarProps) {
  const {animationProgress, isVisible} =
    useCustomerBottomNavVisibilityContext();
  const insets = useSafeAreaInsets();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const [barHeight, setBarHeight] = useState(0);
  const activeTabRoute = props.state.routes[props.state.index];
  const focusedChildRouteName = getFocusedRouteNameFromRoute(activeTabRoute);
  const focusedRoutePolicy = resolveRouteChromePolicy(
    'Customer',
    (focusedChildRouteName ?? activeTabRoute.name) as RegisteredRouteName,
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setBarHeight(Math.ceil(event.nativeEvent.layout.height));
  }, []);

  const handleOpenCart = useCallback(() => {
    props.navigation.dispatch(
      CommonActions.navigate({
        name: activeTabRoute.name,
        params: {screen: 'CustomerCart'},
      }),
    );
  }, [activeTabRoute.name, props.navigation]);

  if (!focusedRoutePolicy.bottomNavigationVisible) {
    return null;
  }

  const cartVisible =
    focusedRoutePolicy.viewCartEligible && itemCount > 0 && subtotal !== null;
  const bottomOffset = Math.max(insets.bottom, spacing.md);
  const hiddenDistance = Math.max(
    barHeight + bottomOffset + spacing.xl,
    touchTarget.comfortable * 2,
  );
  const translateY = animationProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [hiddenDistance, 0],
    extrapolate: 'clamp',
  });
  const totalLabel = subtotal ? formatCartMoney(subtotal) : '';

  return (
    <Animated.View
      onLayout={handleLayout}
      pointerEvents={isVisible ? 'auto' : 'none'}
      accessibilityElementsHidden={!isVisible}
      importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.positioner,
        {
          bottom: bottomOffset,
          transform: [{translateY}],
        },
      ]}>
      <View style={styles.shell}>
        <View style={styles.tabsArea}>
          <BottomTabBar
            {...props}
            insets={{...props.insets, bottom: 0}}
          />
        </View>

        {cartVisible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View Cart, ${itemCount} ${
              itemCount === 1 ? 'item' : 'items'
            }, ${totalLabel}`}
            onPress={handleOpenCart}
            style={({pressed}) => [
              styles.cartAction,
              pressed && styles.cartActionPressed,
            ]}>
            <Icon name="cart" color={colors.white} size={20} />
            <View style={styles.cartCopy}>
              <Text numberOfLines={1} style={styles.cartTitle}>
                Cart · {itemCount}
              </Text>
              <Text numberOfLines={1} style={styles.cartTotal}>
                {totalLabel}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 50,
    borderRadius: radius.xl,
  },
  shell: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.flameRed,
    overflow: 'hidden',
  },
  tabsArea: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    justifyContent: 'center',
  },
  cartAction: {
    width: 124,
    height: 54,
    flexShrink: 0,
    alignSelf: 'center',
    marginLeft: spacing.xxs,
    marginRight: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.flameRed,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  cartActionPressed: {
    opacity: 0.9,
  },
  cartCopy: {
    flex: 1,
    minWidth: 0,
  },
  cartTitle: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  cartTotal: {
    marginTop: spacing.xxs,
    color: colors.white,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
});

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
