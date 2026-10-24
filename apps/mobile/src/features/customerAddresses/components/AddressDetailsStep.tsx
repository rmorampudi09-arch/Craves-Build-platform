import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  borderWidth,
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
import {Icon} from '../../../shared/components/Icon';
import {InputField} from '../../../shared/components/InputField';
import {OlaMapPicker} from '../../maps/OlaMapPicker';
import type {CustomerAddressLabel} from '../domain/customerAddressContract';
import type {
  CustomerAddressDraft,
  CustomerAddressFieldErrors,
  CustomerAddressTextField,
} from '../domain/customerAddressEditor';

const LABELS: Array<{value: CustomerAddressLabel; label: string}> = [
  {value: 'HOME', label: 'Home'},
  {value: 'WORK', label: 'Work'},
  {value: 'OTHER', label: 'Other'},
];

const AREA_FIELDS: CustomerAddressTextField[] = [
  'areaName',
  'postalCode',
  'city',
  'districtName',
  'state',
];

interface Props {
  mode: 'add' | 'edit';
  draft: CustomerAddressDraft;
  fieldErrors: CustomerAddressFieldErrors;
  formError: string | null;
  /** The last pin had no precise house number, so the customer must add it. */
  houseNeedsInput: boolean;
  saving: boolean;
  onChangeText: (field: CustomerAddressTextField, value: string) => void;
  onChangeLabel: (label: CustomerAddressLabel) => void;
  onChangePin: () => void;
  onBack: () => void;
  onSave: () => void;
}

const noop = () => undefined;

export function AddressDetailsStep({
  mode,
  draft,
  fieldErrors,
  formError,
  houseNeedsInput,
  saving,
  onChangeText,
  onChangeLabel,
  onChangePin,
  onBack,
  onSave,
}: Props) {
  const [areaOpen, setAreaOpen] = useState(false);
  // Missing or rejected area details always stay open so they can be fixed.
  const areaForced = AREA_FIELDS.some(
    field => !draft[field].trim() || Boolean(fieldErrors[field]),
  );
  const areaExpanded = areaOpen || areaForced;
  const hasPin = draft.latitude !== null && draft.longitude !== null;
  const summaryTitle = draft.areaName.trim() || draft.city.trim() || 'Delivery pin';
  const summaryLine = [draft.addressLine2, draft.areaName, draft.city, draft.postalCode]
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');

  const field = (
    name: CustomerAddressTextField,
    label: string,
    maxLength: number,
    extra: Partial<React.ComponentProps<typeof InputField>> = {},
  ) => (
    <InputField
      autoCapitalize="words"
      error={fieldErrors[name]}
      label={label}
      maxLength={maxLength}
      onChangeText={value => onChangeText(name, value)}
      value={draft[name]}
      {...extra}
    />
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={onBack}
          style={({pressed}) => [styles.headerButton, pressed && styles.pressed]}>
          <Icon color={colors.textPrimary} name="arrow-left" size={iconSize.md} surface={false} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {mode === 'add' ? 'Add address details' : 'Edit address'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {hasPin ? (
          <View style={styles.preview}>
            <View pointerEvents="none" style={styles.previewMap}>
              <OlaMapPicker
                accessibilityLabel="Map preview of the delivery pin"
                disabled
                fill
                latitude={draft.latitude as number}
                longitude={draft.longitude as number}
                onCenterChange={noop}
                style={styles.previewMap}
              />
            </View>
            <Pressable
              accessibilityLabel="Change delivery pin on the map"
              accessibilityRole="button"
              onPress={onChangePin}
              style={({pressed}) => [styles.changePin, pressed && styles.pressed]}>
              <Icon color={colors.flameRedAccessible} name="edit" size={16} surface={false} />
              <Text style={styles.changePinText}>Change pin</Text>
            </Pressable>
          </View>
        ) : (
          <Button label="Set delivery pin on the map" leftIcon="location" onPress={onChangePin} variant="outline" />
        )}

        {hasPin ? (
          <View style={styles.summary}>
            <View style={styles.tile}>
              <Icon color={colors.flameRed} name="location" size={iconSize.sm} surface={false} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>{summaryTitle}</Text>
              {summaryLine ? <Text style={styles.summaryLine}>{summaryLine}</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.overline}>
            Your door
          </Text>
          {field('addressLine1', 'Flat, house or building', 250, {
            helperText: houseNeedsInput
              ? "The pin can't find your exact door. Add your flat or house number."
              : undefined,
            placeholder: 'e.g. Flat 302, Sri Sai Residency',
          })}
          {field('addressLine2', 'Street, floor or apartment (optional)', 250)}
          {field('landmark', 'Landmark (optional)', 240, {
            placeholder: 'Nearby shop, school or temple',
          })}
        </View>

        <View style={styles.areaCard}>
          <View style={styles.areaHeader}>
            <Text accessibilityRole="header" style={styles.overline}>
              Area from your pin
            </Text>
            {!areaForced ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{expanded: areaExpanded}}
                hitSlop={spacing.xs}
                onPress={() => setAreaOpen(current => !current)}
                style={({pressed}) => [styles.areaToggle, pressed && styles.pressed]}>
                <Text style={styles.areaToggleText}>{areaExpanded ? 'Done' : 'Edit'}</Text>
              </Pressable>
            ) : null}
          </View>
          {areaExpanded ? (
            <View style={styles.section}>
              {field('areaName', 'Area / locality', 160)}
              {field('postalCode', 'Pincode', 6, {
                autoCapitalize: 'none',
                keyboardType: 'number-pad',
                onChangeText: value =>
                  onChangeText('postalCode', value.replace(/[^0-9]/g, '').slice(0, 6)),
              })}
              {field('city', 'City', 120)}
              {field('districtName', 'District', 160)}
              {field('state', 'State', 120)}
            </View>
          ) : (
            <View style={styles.areaGrid}>
              {[
                ['Area', draft.areaName],
                ['Pincode', draft.postalCode],
                ['City', draft.city],
                ['District', draft.districtName],
                ['State', draft.state],
              ].map(([label, value]) => (
                <View key={label} style={styles.areaCell}>
                  <Text style={styles.areaLabel}>{label}</Text>
                  <Text style={styles.areaValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.overline}>
            Receiver
          </Text>
          {field('recipientName', 'Recipient name', 160, {autoComplete: 'name'})}
          {field('contactPhoneNumber', 'Phone number', 32, {
            autoCapitalize: 'none',
            autoComplete: 'tel',
            keyboardType: 'phone-pad',
          })}
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.overline}>
            Save as
          </Text>
          <View style={styles.labelOptions}>
            {LABELS.map(option => {
              const selected = draft.addressLabel === option.value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  key={option.value}
                  onPress={() => onChangeLabel(option.value)}
                  style={({pressed}) => [
                    styles.labelOption,
                    selected && styles.labelOptionSelected,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.labelOptionText, selected && styles.labelOptionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {formError ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={mode === 'add' ? 'Save address' : 'Save changes'}
          loading={saving}
          onPress={onSave}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSpacer: {width: touchTarget.minimum},
  pressed: {opacity: 0.84},
  scrollContent: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  preview: {
    height: 140,
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  previewMap: {height: 140},
  changePin: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  changePinText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small + 1,
    fontWeight: fontWeight.semibold,
  },
  summary: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: {flex: 1, minWidth: 0, gap: 2},
  summaryTitle: {
    color: colors.textPrimary,
    fontSize: typography.body + 2,
    fontWeight: fontWeight.bold,
  },
  summaryLine: {color: colors.textSecondary, fontSize: typography.small},
  section: {gap: spacing.md},
  overline: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  areaCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  areaHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  areaToggle: {minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xxs},
  areaToggleText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small + 1,
    fontWeight: fontWeight.semibold,
  },
  areaGrid: {flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm},
  areaCell: {width: '50%', paddingRight: spacing.sm},
  areaLabel: {color: colors.textSecondary, fontSize: typography.tiny + 1},
  areaValue: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  labelOptions: {flexDirection: 'row', gap: spacing.xs},
  labelOption: {
    flex: 1,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  labelOptionSelected: {borderColor: colors.flameRed, borderWidth: borderWidth.strong},
  labelOptionText: {
    color: colors.textSecondary,
    fontSize: typography.small + 1,
    fontWeight: fontWeight.semibold,
  },
  labelOptionTextSelected: {color: colors.flameRedAccessible},
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.error,
    backgroundColor: colors.white,
  },
  errorText: {color: colors.error, fontSize: typography.small},
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
