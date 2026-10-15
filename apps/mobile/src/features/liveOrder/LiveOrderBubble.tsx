import React, {useCallback, useEffect, useRef, useState, type RefObject} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {BlurView} from 'expo-blur';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useReducedMotionPreference} from '../../design/reducedMotion';
import {colors, elevation, fontWeight, radius, spacing, typography} from '../../design/tokens';
import {Icon} from '../../shared/components/Icon';
import {CustomerOrderMenuItemImage} from '../customerOrders/components/CustomerOrderMenuItemImage';
import {formatCustomerOrderMoney} from '../customerOrders/presentation/customerOrdersPresentation';
import {LIVE_ORDER_STEPS, type LiveOrder} from './liveOrderModel';

/** Where the bubble sits on screen (window coordinates). The card grows out of it. */
export interface LiveOrderOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

const BUBBLE_SIZE = 60;
const CARD_MARGIN = spacing.md;
const OPEN_MS = 460;
const CLOSE_MS = 360;

export function LiveOrderBubble({
  order,
  onOpen,
}: {
  order: LiveOrder;
  onOpen: (origin: LiveOrderOrigin) => void;
}) {
  const circleRef = useRef<View>(null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Live order from ${order.kitchenName}, ${order.status}. Open order`}
      onPress={() =>
        circleRef.current?.measureInWindow((x, y, width, height) =>
          onOpen({x, y, width, height}),
        )
      }
      style={({pressed}) => [styles.bubbleRow, pressed && styles.pressed]}>
      <View style={styles.ring}>
        <View ref={circleRef} collapsable={false} style={styles.circle}>
          <MaterialDesignIcons color={colors.white} name="moped" size={28} />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The live order card: a dim fades over the page and the card grows out of the bubble,
 * red turning white, before its content fades in. Closing shrinks it back into the bubble.
 */
export function LiveOrderCard({
  order,
  origin,
  blurTarget,
  onClosed,
  onOpenOrder,
  onOpenHelp,
}: {
  order: LiveOrder;
  origin: LiveOrderOrigin;
  blurTarget?: RefObject<View | null>;
  /** Called once the card is gone; the parent unmounts it. */
  onClosed: () => void;
  onOpenOrder: () => void;
  onOpenHelp: () => void;
}) {
  const reduceMotion = useReducedMotionPreference();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const rootRef = useRef<View>(null);
  const closingRef = useRef(false);
  const [frame, setFrame] = useState<LiveOrderOrigin | null>(null);
  const [card, setCard] = useState<{width: number; height: number} | null>(null);
  const ready = frame !== null && card !== null;

  useEffect(() => {
    if (!ready) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 0 : OPEN_MS,
      easing: Easing.bezier(0.2, 0.9, 0.1, 1),
      useNativeDriver: true,
    }).start();
    // Opens once, when the card has been measured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: reduceMotion ? 0 : CLOSE_MS,
      easing: Easing.bezier(0.3, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(() => onClosed());
  }, [onClosed, progress, reduceMotion]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);

  // The bubble, in this overlay's own coordinates.
  const bubble = frame && {
    left: origin.x - frame.x,
    top: origin.y - frame.y,
  };
  const cardBottomY = bubble ? bubble.top + origin.height : 0;
  const fade = (from: number, to: number, out = false) =>
    progress.interpolate({
      inputRange: [from, to],
      outputRange: out ? [1, 0] : [0, 1],
      extrapolate: 'clamp',
    });
  const grow =
    bubble && card
      ? [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [
                bubble.left + origin.width / 2 - (CARD_MARGIN + card.width / 2),
                0,
              ],
            }),
          },
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [bubble.top + origin.height / 2 - (cardBottomY - card.height / 2), 0],
            }),
          },
          {
            scaleX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [origin.width / card.width, 1],
            }),
          },
          {
            scaleY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [origin.height / card.height, 1],
            }),
          },
        ]
      : [];
  const blurAvailable =
    Platform.OS === 'ios' || (Boolean(blurTarget) && Number(Platform.Version) >= 31);

  return (
    <View
      ref={rootRef}
      collapsable={false}
      onLayout={() =>
        rootRef.current?.measureInWindow((x, y, width, height) =>
          setFrame({x, y, width, height}),
        )
      }
      style={styles.overlay}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {opacity: fade(0, 0.7)}]}>
        {blurAvailable ? (
          <BlurView
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={blurTarget}
            intensity={14}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.dim} />
      </Animated.View>
      <Pressable
        accessibilityLabel="Close live order"
        accessibilityRole="button"
        onPress={close}
        style={StyleSheet.absoluteFill}
      />

      {frame && bubble ? (
        <Animated.View
          accessibilityLabel={`Live order from ${order.kitchenName}`}
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          onLayout={event => {
            const {width, height} = event.nativeEvent.layout;
            setCard(current => current ?? {width, height});
          }}
          style={[
            styles.card,
            {
              bottom: frame.height - cardBottomY,
              maxHeight: cardBottomY - insets.top - spacing.md,
              opacity: card ? fade(0, 0.08) : 0,
              transform: grow,
            },
          ]}>
          <Animated.View
            pointerEvents="none"
            style={[styles.cardRed, {opacity: fade(0.2, 0.55, true)}]}
          />
          <Animated.View style={[styles.cardContent, {opacity: fade(0.45, 1)}]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeading}>
                <Text style={styles.eyebrow}>{order.status.toUpperCase()}</Text>
                <Text accessibilityRole="header" style={styles.cardTitle}>
                  {order.title}
                </Text>
                <Text numberOfLines={1} style={styles.cardMeta}>
                  {order.kitchenName} · {order.reference}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={spacing.xxs}
                onPress={close}
                style={({pressed}) => [styles.closeButton, pressed && styles.pressed]}>
                <Icon color={colors.flameRed} name="close" size={22} surface={false} />
              </Pressable>
            </View>

            <View
              accessibilityLabel={`Order progress: ${LIVE_ORDER_STEPS[order.doneSteps - 1]}`}
              accessible
              style={styles.steps}>
              {LIVE_ORDER_STEPS.map((step, index) => {
                const done = index < order.doneSteps;
                const current = index === order.doneSteps - 1;
                return (
                  <View key={step} style={styles.step}>
                    <View style={[styles.stepBar, done && styles.stepBarDone]} />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.stepLabel,
                        !done && styles.stepLabelLater,
                        current && styles.stepLabelCurrent,
                      ]}>
                      {step}
                    </Text>
                  </View>
                );
              })}
            </View>

            <ScrollView bounces={false} style={styles.items}>
              {order.items.map(item => (
                <View key={item.id} style={styles.itemRow}>
                  <CustomerOrderMenuItemImage menuItemId={item.menuItemId} size={52} />
                  <View style={styles.itemCopy}>
                    <Text numberOfLines={2} style={styles.itemName}>
                      {item.itemName} × {item.quantity}
                    </Text>
                    <Text style={styles.itemPrice}>{formatCustomerOrderMoney(item.lineTotal)}</Text>
                  </View>
                </View>
              ))}
              <Text style={styles.paid}>Paid {order.paid}</Text>
            </ScrollView>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenOrder}
                style={({pressed}) => [styles.detailsButton, pressed && styles.pressed]}>
                <Text style={styles.detailsText}>View order details</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Get help with this order"
                accessibilityRole="button"
                onPress={onOpenHelp}
                style={({pressed}) => [styles.helpButton, pressed && styles.pressed]}>
                <Icon color={colors.flameRed} name="headset" size={22} surface={false} />
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {opacity: 0.84},
  bubbleRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ring: {
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(217,39,20,0.25)',
  },
  circle: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
    ...elevation.primaryAction,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 60,
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20,14,12,0.30)',
  },
  card: {
    position: 'absolute',
    left: CARD_MARGIN,
    right: CARD_MARGIN,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 18},
    elevation: 16,
  },
  cardRed: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.flameRedAccessible,
  },
  cardContent: {
    flexShrink: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  cardHeading: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    color: colors.flameRedAccessible,
    fontSize: typography.tiny + 1,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
  cardMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  closeButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  steps: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 18,
    paddingHorizontal: spacing.lg,
  },
  step: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  stepBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  stepBarDone: {
    backgroundColor: colors.flameRedAccessible,
  },
  stepLabel: {
    color: colors.textPrimary,
    fontSize: typography.tiny + 1,
    fontWeight: fontWeight.semibold,
  },
  stepLabelLater: {
    color: colors.textSecondary,
  },
  stepLabelCurrent: {
    color: colors.flameRedAccessible,
    fontWeight: fontWeight.bold,
  },
  items: {
    flexGrow: 0,
    flexShrink: 1,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  itemPrice: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  paid: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  detailsButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  detailsText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  helpButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
});
