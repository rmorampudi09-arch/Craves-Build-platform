import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {
  Camera,
  Map as MapLibreMap,
  TransformRequestManager,
  type CameraRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../design/tokens';
import {
  mapTilesBaseUrl,
  mapTilesReferer,
  mapTilesRequestMatch,
  olaMapStyleUrl,
} from './olaMapTiles';

export type MapPoint = { latitude: number; longitude: number };

export type OlaMapPickerProps = MapPoint & {
  /** Called once the map settles on a point the customer chose. */
  onCenterChange: (point: MapPoint) => void;
  onUseCurrentLocation?: () => void;
  locating?: boolean;
  disabled?: boolean;
  /** Short line above the resting pin, e.g. "Your order will be delivered here". */
  pinHint?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const START_ZOOM = 16.5;
/** Report the point only once the finger has left the map. */
const SETTLE_MS = 450;
const SAME_POINT = 1e-6;
const PIN_WIDTH = 40;
const PIN_HEIGHT = 52;

const sameCenter = (a: MapPoint, b: MapPoint) =>
  Math.abs(a.latitude - b.latitude) < SAME_POINT &&
  Math.abs(a.longitude - b.longitude) < SAME_POINT;

/**
 * Ola map with a fixed centre pin: the map moves under it, Swiggy-style. Rendered by
 * MapLibre Native (the engine inside Ola's own SDKs) from Ola tiles served by the CRAVES
 * proxy, so no Ola key ships in the app. Ready for the address screens; no screen uses it yet.
 */
export function OlaMapPicker({
  latitude,
  longitude,
  onCenterChange,
  onUseCurrentLocation,
  locating = false,
  disabled = false,
  pinHint,
  accessibilityLabel = 'Delivery map. Move the map to place the pin on your exact location.',
  style,
}: OlaMapPickerProps) {
  const base = mapTilesBaseUrl();
  const cameraRef = useRef<CameraRef>(null);
  /** The point the screen knows about; moves that end here are not reported again. */
  const knownCenter = useRef<MapPoint>({ latitude, longitude });
  const onCenterChangeRef = useRef(onCenterChange);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lift = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  });

  useEffect(() => {
    // The proxy only serves craves.in; a stable id updates this header in place.
    TransformRequestManager.addHeader({
      id: 'craves-map-tiles-referer',
      match: mapTilesRequestMatch(base),
      name: 'Referer',
      value: mapTilesReferer(base),
    });
  }, [base]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  useEffect(() => {
    Animated.spring(lift, {
      toValue: moving ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [lift, moving]);

  // The screen moved the pin (search result, current location): glide there silently.
  useEffect(() => {
    const next = { latitude, longitude };
    if (sameCenter(next, knownCenter.current)) {
      return;
    }
    knownCenter.current = next;
    cameraRef.current?.easeTo({ center: [longitude, latitude], duration: 600 });
  }, [latitude, longitude]);

  const handleRegionWillChange = (
    event: NativeSyntheticEvent<ViewStateChangeEvent>,
  ) => {
    if (!event.nativeEvent.userInteraction) {
      return;
    }
    clearTimeout(settleTimer.current);
    setMoving(true);
  };

  const handleRegionDidChange = (
    event: NativeSyntheticEvent<ViewStateChangeEvent>,
  ) => {
    setMoving(false);
    const [lng, lat] = event.nativeEvent.center;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const next = {
        latitude: Number(lat.toFixed(7)),
        longitude: Number(lng.toFixed(7)),
      };
      if (sameCenter(next, knownCenter.current)) {
        return;
      }
      knownCenter.current = next;
      onCenterChangeRef.current(next);
    }, SETTLE_MS);
  };

  const retry = () => {
    setFailed(false);
    setReady(false);
    setAttempt(current => current + 1);
  };

  return (
    <View style={[styles.frame, style]}>
      {failed ? (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>The map could not load.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <MaterialDesignIcons
              name="refresh"
              size={18}
              color={colors.flameRed}
            />
            <Text style={styles.pillText}>Retry map</Text>
          </Pressable>
        </View>
      ) : (
        <MapLibreMap
          key={attempt}
          style={StyleSheet.absoluteFill}
          mapStyle={olaMapStyleUrl(base)}
          dragPan={!disabled}
          touchZoom={!disabled}
          doubleTapZoom={!disabled}
          doubleTapHoldZoom={!disabled}
          touchRotate={false}
          touchPitch={false}
          compass={false}
          logo={false}
          attribution={false}
          accessibilityLabel={accessibilityLabel}
          onRegionWillChange={handleRegionWillChange}
          onRegionDidChange={handleRegionDidChange}
          onDidFinishLoadingMap={() => setReady(true)}
          onDidFailLoadingMap={() => setFailed(true)}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: [
                knownCenter.current.longitude,
                knownCenter.current.latitude,
              ],
              zoom: START_ZOOM,
            }}
            minZoom={5}
            maxZoom={19.5}
          />
        </MapLibreMap>
      )}

      {!ready && !failed ? (
        <View pointerEvents="none" style={styles.loading}>
          <View style={styles.pill}>
            <ActivityIndicator size="small" color={colors.flameRed} />
            <Text style={styles.pillText}>Loading map</Text>
          </View>
        </View>
      ) : null}

      {!failed ? (
        <View pointerEvents="none" style={styles.pinAnchor}>
          <Animated.View
            style={[
              styles.pinShadow,
              {
                transform: [
                  {
                    scale: lift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.5],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.pinGroup,
              {
                transform: [
                  {
                    translateY: lift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -12],
                    }),
                  },
                ],
              },
            ]}
          >
            {pinHint && ready && !moving ? (
              <View style={styles.hint}>
                <Text style={styles.hintTitle}>{pinHint}</Text>
                <Text style={styles.hintCaption}>
                  Move the map to adjust the pin
                </Text>
                <View style={styles.hintArrow} />
              </View>
            ) : null}
            <Svg width={PIN_WIDTH} height={PIN_HEIGHT} viewBox="0 0 40 52">
              <Path
                d="M20 51c-1.1 0-2.1-.6-2.7-1.6C11.4 39.6 2 30.6 2 19.8 2 9.4 10.1 1 20 1s18 8.4 18 18.8c0 10.8-9.4 19.8-15.3 29.6-.6 1-1.6 1.6-2.7 1.6z"
                fill={colors.flameRed}
              />
              <Circle cx={20} cy={19.5} r={7.25} fill={colors.white} />
            </Svg>
          </Animated.View>
        </View>
      ) : null}

      <Text style={styles.attribution} accessibilityRole="text">
        © Ola Maps · © OpenStreetMap contributors
      </Text>

      {onUseCurrentLocation ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use current location"
          accessibilityState={{
            disabled: disabled || locating,
            busy: locating,
          }}
          disabled={disabled || locating}
          onPress={onUseCurrentLocation}
          style={({ pressed }) => [
            styles.pill,
            styles.locate,
            pressed && styles.pressed,
            (disabled || locating) && styles.disabled,
          ]}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.flameRed} />
          ) : (
            <MaterialDesignIcons
              name="crosshairs-gps"
              size={18}
              color={colors.flameRed}
            />
          )}
          <Text style={styles.pillText}>Locate me</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 4 / 3,
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  fallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  fallbackText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  pinAnchor: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
  },
  pinShadow: {
    position: 'absolute',
    top: -4,
    left: -10,
    width: 20,
    height: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(38,26,21,0.25)',
  },
  pinGroup: {
    position: 'absolute',
    bottom: 0,
    width: 260,
    left: -130,
    alignItems: 'center',
  },
  hint: {
    marginBottom: spacing.xs,
    maxWidth: 240,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.espresso,
    ...elevation.card,
  },
  hintTitle: {
    color: colors.white,
    fontSize: typography.tiny,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
  },
  hintCaption: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  hintArrow: {
    position: 'absolute',
    bottom: -4,
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    backgroundColor: colors.espresso,
    transform: [{ rotate: '45deg' }],
  },
  attribution: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.85)',
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: fontWeight.semibold,
  },
  pill: {
    minHeight: touchTarget.minimum - 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  pillText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.extrabold,
  },
  locate: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    minHeight: touchTarget.minimum,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});
