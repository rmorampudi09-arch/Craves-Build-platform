import React, { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotionPreference } from '../../../design/reducedMotion';
import {
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import { Icon } from '../../../shared/components/Icon';
import { LiquidGlassSurface } from '../../../shared/components/LiquidGlassSurface';
import { subscribeCartFlight, type CartFlight } from '../cartFlight';

const BUTTON_SIZE = 60;
const FLIGHT_SIZE = 72;
const FLIGHT_MS = 520;
const CHIP_MS = 3000;
// Count changes and photo flights arrive a moment apart; a flight in this window takes over the pop.
const POP_DELAY_MS = 120;

interface Props {
  /** False while the cart is empty: the button scales away but keeps listening for the first add. */
  visible: boolean;
  itemCount: number;
  itemsLabel: string;
  totalLabel: string;
  kitchenName: string | null;
  blurTarget?: RefObject<View | null>;
  /** Moves the button above the menu while the menu shows, and down to the corner when it hides. Screens without a menu leave it out. */
  lift?: Animated.AnimatedInterpolation<number>;
  bottom: number;
  onPress: () => void;
}

interface FlightState {
  imageUrl: string | null;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** The cart on the tab screens: a frosted round button that never hides, with a short total chip after each add. */
export function FloatingCartButton({
  visible,
  itemCount,
  itemsLabel,
  totalLabel,
  kitchenName,
  blurTarget,
  lift,
  bottom,
  onPress,
}: Props) {
  const reduceMotion = useReducedMotionPreference();
  const buttonRef = useRef<View | null>(null);
  const layerRef = useRef<View | null>(null);
  const badgeScale = useRef(new Animated.Value(1)).current;
  const chip = useRef(new Animated.Value(0)).current;
  const flightProgress = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [flight, setFlight] = useState<FlightState | null>(null);
  const [chipShown, setChipShown] = useState(false);
  const lastCount = useRef(itemCount);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const celebrate = useRef(() => {});
  celebrate.current = () => {
    if (reduceMotion) {
      chip.setValue(1);
    } else {
      Animated.sequence([
        Animated.timing(badgeScale, {
          toValue: 1.35,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(badgeScale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
      Animated.timing(chip, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    setChipShown(true);
    if (chipTimer.current) clearTimeout(chipTimer.current);
    chipTimer.current = setTimeout(() => {
      if (reduceMotion) {
        chip.setValue(0);
        setChipShown(false);
        return;
      }
      Animated.timing(chip, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setChipShown(false));
    }, CHIP_MS);
  };

  useEffect(() => {
    if (!visible || reduceMotion) {
      appear.setValue(visible ? 1 : 0);
      return;
    }
    Animated.spring(appear, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [appear, reduceMotion, visible]);

  useEffect(() => {
    if (itemCount > lastCount.current) {
      if (popTimer.current) clearTimeout(popTimer.current);
      popTimer.current = setTimeout(() => celebrate.current(), POP_DELAY_MS);
    }
    lastCount.current = itemCount;
  }, [itemCount]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    return subscribeCartFlight((source: CartFlight) => {
      const button = buttonRef.current;
      const layer = layerRef.current;
      if (!button || !layer) return;
      if (popTimer.current) clearTimeout(popTimer.current);
      layer.measureInWindow((layerX, layerY) => {
        button.measureInWindow((x, y, width, height) => {
          setFlight({
            imageUrl: source.imageUrl,
            from: {
              x: source.x + source.width / 2 - layerX - FLIGHT_SIZE / 2,
              y: source.y + source.height / 2 - layerY - FLIGHT_SIZE / 2,
            },
            to: {
              x: x + width / 2 - layerX - FLIGHT_SIZE / 2,
              y: y + height / 2 - layerY - FLIGHT_SIZE / 2,
            },
          });
          flightProgress.setValue(0);
          Animated.timing(flightProgress, {
            toValue: 1,
            duration: FLIGHT_MS,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }).start(() => {
            setFlight(null);
            celebrate.current();
          });
        });
      });
    });
  }, [flightProgress, reduceMotion]);

  useEffect(
    () => () => {
      if (popTimer.current) clearTimeout(popTimer.current);
      if (chipTimer.current) clearTimeout(chipTimer.current);
    },
    [],
  );

  const label = `View cart, ${itemsLabel}${
    kitchenName ? ` from ${kitchenName}` : ''
  }, ${totalLabel}`;
  // The photo rises a little before it drops into the button, so it reads as a throw, not a slide.
  const arcTop = flight ? Math.min(flight.from.y, flight.to.y) - 80 : 0;

  return (
    <>
      <View
        ref={layerRef}
        collapsable={false}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        {flight ? (
          <Animated.View
            style={[
              styles.flight,
              {
                opacity: flightProgress.interpolate({
                  inputRange: [0, 0.85, 1],
                  outputRange: [1, 1, 0],
                }),
                transform: [
                  {
                    translateX: flightProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [flight.from.x, flight.to.x],
                    }),
                  },
                  {
                    translateY: flightProgress.interpolate({
                      inputRange: [0, 0.35, 1],
                      outputRange: [flight.from.y, arcTop, flight.to.y],
                    }),
                  },
                  {
                    scale: flightProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.3],
                    }),
                  },
                ],
              },
            ]}
          >
            {flight.imageUrl ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: flight.imageUrl }}
                style={styles.flightImage}
              />
            ) : (
              <View style={[styles.flightImage, styles.flightFallback]}>
                <Icon
                  name="meal"
                  size={iconSize.md}
                  color={colors.flameRedAccessible}
                  surface={false}
                />
              </View>
            )}
          </Animated.View>
        ) : null}
      </View>

      {visible ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.dock,
            {
              bottom,
              opacity: appear,
              transform: [{ translateY: lift ?? 0 }, { scale: appear }],
            },
          ]}
        >
          {chipShown ? (
            <Animated.View
              style={{
                opacity: chip,
                transform: [
                  {
                    translateX: chip.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              }}
            >
              <Pressable
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onPress={onPress}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <LiquidGlassSurface
                  appearance="home"
                  blurTarget={blurTarget}
                  variant="navigation"
                  style={styles.chip}
                >
                  <Text numberOfLines={1} style={styles.chipText}>
                    {itemsLabel} · {totalLabel}
                  </Text>
                  <Text style={styles.chipAction}>View cart</Text>
                  <Icon
                    name="chevron-right"
                    size={iconSize.sm}
                    color={colors.flameRed}
                    surface={false}
                  />
                </LiquidGlassSurface>
              </Pressable>
            </Animated.View>
          ) : null}

          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <View ref={buttonRef} collapsable={false}>
              <LiquidGlassSurface
                appearance="home"
                blurTarget={blurTarget}
                variant="navigation"
                style={styles.button}
              >
                <Icon
                  name="cart"
                  size={iconSize.md}
                  color={colors.flameRed}
                  surface={false}
                />
              </LiquidGlassSurface>
              <Animated.View
                style={[styles.badge, { transform: [{ scale: badgeScale }] }]}
              >
                <Text style={styles.badgeText}>
                  {itemCount > 99 ? '99+' : itemCount}
                </Text>
              </Animated.View>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 51,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.espressoBrown,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  badgeText: {
    color: colors.white,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  chip: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  chipText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  chipAction: {
    marginLeft: spacing.xs,
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  flight: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: FLIGHT_SIZE,
    height: FLIGHT_SIZE,
  },
  flightImage: {
    width: FLIGHT_SIZE,
    height: FLIGHT_SIZE,
    borderRadius: FLIGHT_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.white,
  },
  flightFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
});
