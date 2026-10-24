import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {motionDuration} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {OlaMapPicker, type MapPoint} from '../../maps/OlaMapPicker';
import type {ReverseGeocodedCustomerAddress} from '../api/customerAddressesApi';

export type PinLookupState =
  | {status: 'idle'}
  | {status: 'resolving'}
  | {status: 'resolved'; result: ReverseGeocodedCustomerAddress; point: MapPoint}
  | {status: 'limited'; retryAt: number}
  | {status: 'unavailable'}
  | {status: 'failed'; message: string};

interface Props {
  pin: MapPoint;
  lookup: PinLookupState;
  limitedSeconds: number;
  locating: boolean;
  locationNotice: string | null;
  onCenterChange: (point: MapPoint) => void;
  onUseCurrentLocation: () => void;
  onConfirm: () => void;
  onEnterManually: () => void;
  onRetryLookup: () => void;
  onOpenSearch: () => void;
  onBack: () => void;
}

/** The sheet overlaps the map by its corner radius; map controls stay above it. */
const SHEET_OVERLAP = radius.xl;
const TITLE_LINE = 24;
const BODY_LINE = 19;

/** Grey bars that pulse in the exact space the address text will take. */
function AddressSkeleton({fontScale}: {fontScale: number}) {
  const reduceMotion = useReducedMotionPreference();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const half = motionDuration.skeletonCycle / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 0.45, duration: half, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 1, duration: half, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [pulse, reduceMotion]);

  return (
    <Animated.View style={[styles.statusCopy, {opacity: pulse}]}>
      <View style={[styles.skeletonRow, {height: TITLE_LINE * fontScale}]}>
        <SkeletonBlock borderRadius={radius.pill} height={14 * fontScale} width="55%" />
      </View>
      <View style={[styles.skeletonRow, {height: BODY_LINE * fontScale}]}>
        <SkeletonBlock borderRadius={radius.pill} height={10 * fontScale} width="92%" />
      </View>
      <View style={[styles.skeletonRow, {height: BODY_LINE * fontScale}]}>
        <SkeletonBlock borderRadius={radius.pill} height={10 * fontScale} width="68%" />
      </View>
    </Animated.View>
  );
}

function StatusTile({icon, tone}: {icon: IconName; tone: 'pin' | 'error' | 'warning'}) {
  return (
    <View style={styles.tile}>
      <Icon
        color={tone === 'error' ? colors.error : tone === 'warning' ? colors.warningText : colors.flameRed}
        name={icon}
        size={iconSize.md}
        surface={false}
      />
    </View>
  );
}

export function AddressMapStep({
  pin,
  lookup,
  limitedSeconds,
  locating,
  locationNotice,
  onCenterChange,
  onUseCurrentLocation,
  onConfirm,
  onEnterManually,
  onRetryLookup,
  onOpenSearch,
  onBack,
}: Props) {
  const resolved = lookup.status === 'resolved' ? lookup.result : null;
  const {fontScale} = useWindowDimensions();
  // Title is 1 line and address 2 lines in every state, so the sheet never jumps as the pin moves.
  const copyHeight = (TITLE_LINE + 2 * BODY_LINE) * fontScale + spacing.xxs * 2;

  return (
    <View style={styles.root}>
      <View style={styles.mapArea}>
        <OlaMapPicker
          bottomInset={SHEET_OVERLAP}
          fill
          latitude={pin.latitude}
          locating={locating}
          longitude={pin.longitude}
          onCenterChange={onCenterChange}
          onUseCurrentLocation={onUseCurrentLocation}
          pinHint="Your order will be delivered here"
          style={styles.map}
        />
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={onBack}
            style={({pressed}) => [styles.roundButton, pressed && styles.pressed]}>
            <Icon color={colors.textPrimary} name="arrow-left" size={iconSize.md} surface={false} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenSearch}
            style={({pressed}) => [styles.searchPill, pressed && styles.pressed]}>
            <Icon color={colors.flameRedAccessible} name="search" size={iconSize.lg} surface={false} />
            <Text numberOfLines={1} style={styles.searchPillText}>
              Search for area, street or landmark
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sheet}>
        {/* In landscape the sheet is capped so the map stays usable; its copy scrolls. */}
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          style={styles.sheetScroll}>
          {locationNotice ? (
            <Text accessibilityRole="alert" style={styles.locationNotice}>
              {locationNotice}
            </Text>
          ) : null}

          {lookup.status === 'idle' || lookup.status === 'resolving' || resolved ? (
            <View
              accessibilityLabel={
                lookup.status === 'resolving' ? 'Finding the address for this pin' : undefined
              }
              accessibilityRole={lookup.status === 'resolving' ? 'progressbar' : undefined}>
              <Text style={styles.overline}>Delivering to</Text>
              <View style={[styles.statusRow, {height: copyHeight}]}>
                <StatusTile icon="location" tone="pin" />
                {lookup.status === 'resolving' ? (
                  <AddressSkeleton fontScale={fontScale} />
                ) : (
                  <View style={styles.statusCopy}>
                    <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
                      {resolved
                        ? resolved.area || resolved.city || resolved.district || 'Selected location'
                        : 'Set your delivery pin'}
                    </Text>
                    <Text numberOfLines={2} style={styles.body}>
                      {resolved
                        ? resolved.formattedAddress
                        : 'Move the map to place the pin on your building.'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : null}

          {lookup.status === 'unavailable' || lookup.status === 'failed' ? (
            <View accessibilityRole="alert" style={styles.statusRow}>
              <StatusTile icon="alert" tone="error" />
              <View style={styles.statusCopy}>
                <Text style={styles.title}>
                  {lookup.status === 'unavailable'
                    ? 'Craves could not identify this address right now'
                    : 'The address could not be found'}
                </Text>
                <Text style={styles.body}>
                  {lookup.status === 'failed'
                    ? lookup.message
                    : 'Your pin is kept. Type the address to continue, or try again.'}
                </Text>
              </View>
            </View>
          ) : null}

          {lookup.status === 'limited' ? (
            <View accessibilityRole="alert" style={styles.statusRow}>
              <StatusTile icon="clock" tone="warning" />
              <View style={styles.statusCopy}>
                <Text style={styles.title}>Too many location lookups</Text>
                <Text style={styles.body}>
                  {limitedSeconds > 0
                    ? `Please try again shortly. Address lookup resumes in ${limitedSeconds} s.`
                    : 'Address lookup is available again.'}
                </Text>
              </View>
            </View>
          ) : null}

        </ScrollView>

        <View style={styles.actions}>
          {lookup.status === 'unavailable' || lookup.status === 'failed' ? (
            <>
              <Button label="Enter address manually" onPress={onEnterManually} />
              <Button label="Try again" onPress={onRetryLookup} variant="outline" />
            </>
          ) : lookup.status === 'limited' ? (
            <>
              <Button
                disabled={limitedSeconds > 0}
                label={limitedSeconds > 0 ? `Confirm location in ${limitedSeconds} s` : 'Try again'}
                onPress={onRetryLookup}
              />
              <Button label="Enter address manually" onPress={onEnterManually} variant="outline" />
            </>
          ) : (
            <Button
              disabled={!resolved}
              label="Confirm location"
              onPress={onConfirm}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.surfaceMuted},
  mapArea: {flex: 1},
  map: {flex: 1},
  pressed: {opacity: 0.84},
  topBar: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  roundButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  searchPill: {
    flex: 1,
    minWidth: 0,
    height: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  searchPillText: {flex: 1, color: colors.placeholder, fontSize: typography.body},
  sheet: {
    maxHeight: '50%',
    marginTop: -SHEET_OVERLAP,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  sheetScroll: {flexShrink: 1},
  sheetContent: {gap: spacing.md},
  locationNotice: {color: colors.error, fontSize: typography.small},
  overline: {
    marginBottom: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: {flex: 1, minWidth: 0, gap: spacing.xxs},
  title: {
    color: colors.textPrimary,
    fontSize: typography.heading - 2,
    fontWeight: fontWeight.bold,
    lineHeight: TITLE_LINE,
  },
  body: {color: colors.textSecondary, fontSize: typography.small + 1, lineHeight: BODY_LINE},
  skeletonRow: {justifyContent: 'center'},
  actions: {gap: spacing.sm},
});
