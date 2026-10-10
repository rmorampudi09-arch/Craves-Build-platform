import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
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

function StatusTile({icon, tone}: {icon: IconName; tone: 'pin' | 'error' | 'warning'}) {
  return (
    <View
      style={[
        styles.tile,
        tone === 'error' && {backgroundColor: colors.errorSoft},
        tone === 'warning' && {backgroundColor: colors.warningSoft},
      ]}>
      <Icon
        color={tone === 'error' ? colors.error : tone === 'warning' ? colors.warningText : colors.flameRed}
        name={icon}
        size={iconSize.sm}
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
  const approximate =
    resolved !== null && (resolved.confidence === 'Medium' || resolved.confidence === 'Low');

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
            <Icon color={colors.flameRedAccessible} name="search" size={18} surface={false} />
            <Text numberOfLines={1} style={styles.searchPillText}>
              Search for area, street or landmark
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sheet}>
        {locationNotice ? (
          <Text accessibilityRole="alert" style={styles.locationNotice}>
            {locationNotice}
          </Text>
        ) : null}

        {lookup.status === 'idle' ? (
          <View style={styles.statusRow}>
            <StatusTile icon="location" tone="pin" />
            <View style={styles.statusCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                Set your delivery pin
              </Text>
              <Text style={styles.body}>Move the map to place the pin on your building.</Text>
            </View>
          </View>
        ) : null}

        {lookup.status === 'resolving' ? (
          <View accessibilityLabel="Finding the address for this pin" accessibilityRole="progressbar">
            <Text style={styles.overline}>Delivering to</Text>
            <View style={styles.statusRow}>
              <StatusTile icon="location" tone="pin" />
              <View style={styles.statusCopy}>
                <View style={[styles.skeleton, styles.skeletonTitle]} />
                <View style={[styles.skeleton, styles.skeletonLine]} />
              </View>
            </View>
          </View>
        ) : null}

        {resolved ? (
          <View>
            <Text style={styles.overline}>Delivering to</Text>
            <View style={styles.statusRow}>
              <StatusTile icon="location" tone="pin" />
              <View style={styles.statusCopy}>
                <Text accessibilityRole="header" style={styles.title}>
                  {resolved.area || resolved.city || resolved.district || 'Selected location'}
                </Text>
                <Text style={styles.body}>{resolved.formattedAddress}</Text>
              </View>
            </View>
            {approximate ? (
              <View accessibilityRole="alert" style={styles.approximate}>
                <Icon color={colors.warningText} name="alert" size={18} surface={false} />
                <Text style={styles.approximateText}>
                  This pin is approximate. Move the map so the pin sits on your building.
                </Text>
              </View>
            ) : null}
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
    backgroundColor: colors.iconSurface,
  },
  statusCopy: {flex: 1, minWidth: 0, gap: spacing.xxs},
  title: {
    color: colors.textPrimary,
    fontSize: typography.heading - 2,
    fontWeight: fontWeight.bold,
  },
  body: {color: colors.textSecondary, fontSize: typography.small + 1},
  skeleton: {borderRadius: radius.sm, backgroundColor: colors.surfaceMuted},
  skeletonTitle: {width: '45%', height: 18},
  skeletonLine: {width: '90%', height: 14, marginTop: spacing.xs},
  approximate: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  approximateText: {flex: 1, color: colors.warningText, fontSize: typography.small},
  actions: {gap: spacing.sm},
});
