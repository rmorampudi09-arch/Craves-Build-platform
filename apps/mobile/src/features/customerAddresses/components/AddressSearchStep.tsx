import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {InputField} from '../../../shared/components/InputField';
import type {CustomerLocationSuggestion} from '../api/customerAddressesApi';
import {
  customerAddressDisplayLine,
  customerAddressLabel,
  type CustomerAddress,
} from '../domain/customerAddressContract';
import type {LocationSearchState} from '../hooks/useLocationSearch';

interface Props {
  query: string;
  onChangeQuery: (value: string) => void;
  state: LocationSearchState;
  limitedSeconds: number;
  onRetrySearch: () => void;
  onPickResult: (result: CustomerLocationSuggestion) => void;
  onUseCurrentLocation: () => void;
  locating: boolean;
  locationDenied: boolean;
  locationError: string | null;
  onOpenSettings: () => void;
  onSetOnMap: () => void;
  savedAddresses: CustomerAddress[];
  onPickSavedAddress?: (address: CustomerAddress) => void;
  onBack: () => void;
}

function labelIcon(address: CustomerAddress): IconName {
  if (address.addressLabel === 'HOME') return 'home';
  if (address.addressLabel === 'WORK') return 'work';
  return 'location';
}

function Notice({
  tone,
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  tone: 'error' | 'warning';
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const ink = tone === 'error' ? colors.error : colors.warningText;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.notice, tone === 'error' ? styles.noticeError : styles.noticeWarning]}>
      <Icon color={ink} name={icon} size={iconSize.md} surface={false} />
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={[styles.noticeBody, {color: tone === 'error' ? colors.textPrimary : ink}]}>
          {body}
        </Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={({pressed}) => [styles.noticeAction, {borderColor: ink}, pressed && styles.pressed]}>
            <Text style={[styles.noticeActionText, {color: ink}]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AddressSearchStep({
  query,
  onChangeQuery,
  state,
  limitedSeconds,
  onRetrySearch,
  onPickResult,
  onUseCurrentLocation,
  locating,
  locationDenied,
  locationError,
  onOpenSettings,
  onSetOnMap,
  savedAddresses,
  onPickSavedAddress,
  onBack,
}: Props) {
  const showSaved =
    state.status === 'idle' && Boolean(onPickSavedAddress) && savedAddresses.length > 0;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={onBack}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
          <Icon color={colors.textPrimary} name="arrow-left" size={iconSize.md} surface={false} />
        </Pressable>
        <InputField
          accessibilityLabel="Search for area, street or landmark"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          containerStyle={styles.searchField}
          leftIcon="search"
          maxLength={160}
          onChangeText={onChangeQuery}
          onRightIconPress={query ? () => onChangeQuery('') : undefined}
          placeholder="Search for area, street or landmark"
          returnKeyType="search"
          rightIcon={query ? 'close' : undefined}
          rightIconAccessibilityLabel="Clear search"
          value={query}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityHint="Asks for location access and places the pin at your GPS location."
          accessibilityRole="button"
          accessibilityState={{busy: locating, disabled: locating}}
          disabled={locating}
          onPress={onUseCurrentLocation}
          style={({pressed}) => [styles.row, styles.currentRow, pressed && styles.pressed]}>
          <View style={styles.tile}>
            {locating ? (
              <ActivityIndicator color={colors.flameRed} size="small" />
            ) : (
              <Icon color={colors.flameRed} name="gps" size={iconSize.sm} surface={false} />
            )}
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.currentTitle}>
              {locating ? 'Finding your location…' : 'Use current location'}
            </Text>
            <Text style={styles.rowSubtitle}>Find your address with GPS</Text>
          </View>
          <Icon color={colors.textSecondary} name="chevron-right" size={18} surface={false} />
        </Pressable>

        {locationDenied ? (
          <View style={styles.inset}>
            <Notice
              actionLabel="Open settings"
              body="Search for your area above, or allow location in Settings to use GPS."
              icon="location-off"
              onAction={onOpenSettings}
              title="Location access is off"
              tone="warning"
            />
          </View>
        ) : locationError ? (
          <View style={styles.inset}>
            <Notice body={locationError} icon="alert" title="Location unavailable" tone="error" />
          </View>
        ) : null}

        <View style={styles.band} />

        {showSaved ? (
          <>
            <Text accessibilityRole="header" style={styles.overline}>
              Saved addresses
            </Text>
            {savedAddresses.map(address => (
              <Pressable
                accessibilityLabel={`${customerAddressLabel(address)}, ${customerAddressDisplayLine(address)}. Deliver here`}
                accessibilityRole="button"
                key={address.id}
                onPress={() => onPickSavedAddress?.(address)}
                style={({pressed}) => [styles.row, styles.divided, pressed && styles.pressed]}>
                <View style={styles.tile}>
                  <Icon color={colors.flameRed} name={labelIcon(address)} size={18} surface={false} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{customerAddressLabel(address)}</Text>
                  <Text numberOfLines={2} style={styles.rowSubtitle}>
                    {customerAddressDisplayLine(address)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}

        {state.status === 'idle' && !showSaved ? (
          <Text style={styles.hint}>
            Type at least 3 letters of your area, street, apartment or landmark.
          </Text>
        ) : null}

        {state.status === 'loading' ? (
          <View accessibilityLabel="Searching places" accessibilityRole="progressbar" style={styles.loading}>
            <ActivityIndicator color={colors.flameRed} size="small" />
            <Text style={styles.rowSubtitle}>Searching…</Text>
          </View>
        ) : null}

        {state.status === 'results' ? (
          <>
            <Text accessibilityRole="header" style={styles.overline}>
              Search results
            </Text>
            {state.results.map((result, index) => (
              <Pressable
                accessibilityLabel={[result.title, result.subtitle].filter(Boolean).join(', ')}
                accessibilityRole="button"
                key={`${index}:${result.id ?? result.title}`}
                onPress={() => onPickResult(result)}
                style={({pressed}) => [styles.row, styles.divided, pressed && styles.pressed]}>
                <View style={styles.tile}>
                  <Icon color={colors.textSecondary} name="location" size={18} surface={false} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{result.title}</Text>
                  {result.subtitle ? (
                    <Text style={styles.rowSubtitle}>{result.subtitle}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </>
        ) : null}

        {state.status === 'empty' ? (
          <View accessibilityRole="summary" style={styles.empty}>
            <View style={styles.emptyTile}>
              <Icon color={colors.textSecondary} name="search-off" size={28} surface={false} />
            </View>
            <Text style={styles.emptyTitle}>No matching places found</Text>
            <Text style={styles.emptyBody}>Try a nearby landmark or area name.</Text>
            <Button label="Set location on the map" leftIcon="location" onPress={onSetOnMap} style={styles.emptyButton} variant="outline" />
          </View>
        ) : null}

        {state.status === 'unavailable' ? (
          <View style={styles.inset}>
            <Notice
              actionLabel="Try again"
              body="Use your current location or set the location on the map."
              icon="cloud-off"
              onAction={onRetrySearch}
              title="Address search is unavailable right now"
              tone="error"
            />
          </View>
        ) : null}

        {state.status === 'failed' ? (
          <View style={styles.inset}>
            <Notice
              actionLabel="Try again"
              body={state.message}
              icon="alert"
              onAction={onRetrySearch}
              title="Search did not complete"
              tone="error"
            />
          </View>
        ) : null}

        {state.status === 'limited' ? (
          <View style={styles.inset}>
            <Notice
              body={`Please try again shortly. Search resumes in ${limitedSeconds} s.`}
              icon="clock"
              title="Too many location lookups"
              tone="warning"
            />
          </View>
        ) : null}

        {state.status !== 'empty' ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSetOnMap}
            style={({pressed}) => [styles.mapLink, pressed && styles.pressed]}>
            <Text style={styles.mapLinkText}>
              Can't find it? <Text style={styles.mapLinkAction}>Set location on the map</Text>
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  searchField: {flex: 1, minWidth: 0},
  scrollContent: {flexGrow: 1, paddingBottom: spacing.xl},
  pressed: {opacity: 0.84},
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currentRow: {paddingBottom: spacing.md},
  divided: {borderBottomWidth: borderWidth.standard, borderBottomColor: colors.border},
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  rowCopy: {flex: 1, minWidth: 0, gap: 2},
  currentTitle: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  rowSubtitle: {color: colors.textSecondary, fontSize: typography.small},
  band: {height: spacing.xs, backgroundColor: colors.surfaceMuted},
  inset: {paddingHorizontal: spacing.md, paddingBottom: spacing.md},
  overline: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hint: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  noticeError: {backgroundColor: colors.errorSoft},
  noticeWarning: {backgroundColor: colors.warningSoft},
  noticeCopy: {flex: 1, minWidth: 0, gap: spacing.xxs},
  noticeTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  noticeBody: {fontSize: typography.small},
  noticeAction: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: borderWidth.standard,
    borderRadius: radius.md,
  },
  noticeActionText: {fontSize: typography.small, fontWeight: fontWeight.semibold},
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
  },
  emptyTile: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading - 2,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: typography.body,
    textAlign: 'center',
  },
  emptyButton: {alignSelf: 'stretch', marginTop: spacing.xs},
  mapLink: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  mapLinkText: {color: colors.textSecondary, fontSize: typography.small},
  mapLinkAction: {color: colors.flameRedAccessible, fontWeight: fontWeight.semibold},
});
