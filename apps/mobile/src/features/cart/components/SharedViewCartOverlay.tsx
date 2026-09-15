import React from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useAppSelector} from '../../../app/store/hooks';
import {resolveMotion} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  safeArea,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import type {RouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import {selectCartFoodSubtotal, selectCartItemCount} from '../state/cartSelectors';
import {formatCartMoney, isViewCartOverlayVisible} from '../viewCartOverlayModel';

export interface SharedViewCartOverlayProps {
  routePolicy: RouteChromePolicy;
  onOpenCart: () => void;
  bottomOffset?: number;
}

export function SharedViewCartOverlay({
  routePolicy,
  onOpenCart,
  bottomOffset = safeArea.floatingControlClearance,
}: SharedViewCartOverlayProps) {
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const visible = isViewCartOverlayVisible({itemCount, subtotal}, routePolicy);
  const progress = React.useRef(new Animated.Value(0)).current;
  const reduceMotionEnabled = useReducedMotionPreference();

  React.useEffect(() => {
    if (!visible) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }

    const motion = resolveMotion('viewCart', reduceMotionEnabled);
    progress.stopAnimation();

    if (!motion.animate) {
      progress.setValue(1);
      return;
    }

    if (motion.useSpring && motion.spring) {
      Animated.spring(progress, {
        toValue: 1,
        damping: motion.spring.damping,
        stiffness: motion.spring.stiffness,
        mass: motion.spring.mass,
        overshootClamping: motion.spring.overshootClamping,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 1,
      duration: motion.durationMs,
      easing: Easing.bezier(
        motion.easing.x1,
        motion.easing.y1,
        motion.easing.x2,
        motion.easing.y2,
      ),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotionEnabled, visible]);

  if (!visible || subtotal === null) {
    return null;
  }

  const totalLabel = formatCartMoney(subtotal);
  const itemLabel = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.positioner,
        {bottom: bottomOffset},
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [spacing.md, 0],
              }),
            },
          ],
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View Cart, ${itemLabel}, ${totalLabel}`}
        onPress={onOpenCart}
        style={({pressed}) => [styles.action, pressed && styles.actionPressed]}>
        <View style={styles.copy}>
          <Text allowFontScaling style={styles.title} numberOfLines={1}>
            View Cart
          </Text>
          <Text allowFontScaling style={styles.meta} numberOfLines={1}>
            {itemLabel}
          </Text>
        </View>
        <Text allowFontScaling style={styles.total} numberOfLines={1}>
          {totalLabel}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 30,
  },
  action: {
    minHeight: touchTarget.comfortable,
    borderRadius: radius.lg,
    backgroundColor: colors.espressoBrown,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    ...elevation.card,
  },
  actionPressed: {
    opacity: 0.9,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  meta: {
    marginTop: spacing.xxs,
    color: colors.cream,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  total: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
});
