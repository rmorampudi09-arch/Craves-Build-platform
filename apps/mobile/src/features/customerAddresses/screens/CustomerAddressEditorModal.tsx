import React, {useCallback, useState} from 'react';
import {Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import * as Location from 'expo-location';
import {toAppApiError} from '../../../core/http/apiError';
import {resolveReducedMotionAnimation} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
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
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {customerAddressesApi} from '../api/customerAddressesApi';
import type {CustomerAddress, CustomerAddressLabel} from '../domain/customerAddressContract';
import {
  CUSTOMER_ADDRESS_PINCODE_FALLBACK_COPY,
  applyDetectedCustomerAddress,
  createCustomerAddressDraft,
  createCustomerAddressSavePlan,
  isCustomerAddressDraftDirty,
  updateCustomerAddressDraftText,
  type CustomerAddressDraft,
  type CustomerAddressFieldErrors,
  type CustomerAddressTextField,
} from '../domain/customerAddressEditor';
import {
  useCreateCustomerAddressMutation,
  useUpdateCustomerAddressMutation,
} from '../query/customerAddressQueries';

interface Props {
  mode: 'add' | 'edit';
  address?: CustomerAddress;
  addresses: CustomerAddress[];
  onClose: () => void;
}

const LABELS: Array<{value: CustomerAddressLabel; label: string}> = [
  {value: 'HOME', label: 'Home'},
  {value: 'WORK', label: 'Work'},
  {value: 'OTHER', label: 'Other'},
];

export function CustomerAddressEditorModal({mode, address, addresses, onClose}: Props) {
  const editingAddressId = mode === 'edit' ? address?.id ?? null : null;
  const initialDraft = createCustomerAddressDraft(address);
  const [original] = useState<CustomerAddressDraft>(initialDraft);
  const [draft, setDraft] = useState<CustomerAddressDraft>(initialDraft);
  const [fieldErrors, setFieldErrors] = useState<CustomerAddressFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const createMutation = useCreateCustomerAddressMutation();
  const updateMutation = useUpdateCustomerAddressMutation();
  const reducedMotion = useReducedMotionPreference();
  const saving = createMutation.isPending || updateMutation.isPending;

  const updateText = useCallback((field: CustomerAddressTextField, value: string) => {
    setDraft(current => updateCustomerAddressDraftText(current, field, value));
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = {...current};
      delete next[field];
      return next;
    });
    setFormError(null);
  }, []);

  const requestClose = useCallback(() => {
    if (!isCustomerAddressDraftDirty(draft, original)) {
      onClose();
      return;
    }
    Alert.alert('Discard address changes?', 'Your unsaved address changes will be lost.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard', style: 'destructive', onPress: onClose},
    ]);
  }, [draft, onClose, original]);

  const handleUseCurrentLocation = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    setFormError(null);
    setLocationMessage(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationMessage('Allow location access to fill and map this delivery address.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.High});
      const resolved = await customerAddressesApi.reverseGeocode(
        current.coords.latitude,
        current.coords.longitude,
      );
      setDraft(existing =>
        applyDetectedCustomerAddress(existing, {
          ...resolved,
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        }),
      );
      setFieldErrors({});
      setLocationMessage(
        resolved.preciseHouseNumber
          ? 'Current location found. Review the filled address before saving.'
          : 'Current location found. Confirm your exact flat, house or building before saving.',
      );
    } catch (caught) {
      setLocationMessage(toAppApiError(caught).message);
    } finally {
      setLocating(false);
    }
  }, [locating]);

  const save = useCallback(async () => {
    if (saving) return;
    const plan = createCustomerAddressSavePlan(draft, addresses, editingAddressId);
    if (plan.status === 'invalid') {
      setFieldErrors(plan.fieldErrors);
      setFormError(plan.formError);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    try {
      if (editingAddressId) {
        await updateMutation.mutateAsync({addressId: editingAddressId, request: plan.request});
        Alert.alert('Address updated', 'Your saved address has been updated.', [
          {text: 'Done', onPress: onClose},
        ]);
      } else {
        await createMutation.mutateAsync(plan.request);
        Alert.alert('Address saved', 'Your delivery address has been saved.', [
          {text: 'Done', onPress: onClose},
        ]);
      }
    } catch (caught) {
      setFormError(toAppApiError(caught).message);
    }
  }, [addresses, createMutation, draft, editingAddressId, onClose, saving, updateMutation]);

  return (
    <Modal
      animationType={resolveReducedMotionAnimation('slide' as const, reducedMotion)}
      onRequestClose={requestClose}
      presentationStyle="fullScreen"
      visible>
      <ScreenShell edges={['top', 'bottom']} keyboardAvoiding testID="customer-address-editor">
        <View style={styles.root}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Close address editor"
              accessibilityRole="button"
              hitSlop={spacing.sm}
              onPress={requestClose}
              style={({pressed}) => [styles.headerButton, pressed && styles.pressed]}>
              <Icon name="arrow-left" color={colors.espressoBrown} size={iconSize.md} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>
              {mode === 'add' ? 'Add Address' : 'Edit Address'}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Address type</Text>
              <View style={styles.labelOptions}>
                {LABELS.map(option => {
                  const selected = draft.addressLabel === option.value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{selected}}
                      key={option.value}
                      onPress={() => setDraft(current => ({...current, addressLabel: option.value}))}
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

              <Button
                accessibilityHint="Uses foreground location to fill the delivery address."
                label="Use current location"
                leftIcon="location"
                loading={locating}
                onPress={() => handleUseCurrentLocation().catch(() => undefined)}
                style={styles.locationButton}
                variant="outline"
              />
              {locationMessage ? (
                <View accessibilityRole="alert" style={styles.notice}>
                  <Text style={styles.noticeText}>{locationMessage}</Text>
                </View>
              ) : null}

              <View style={styles.fields}>
                <InputField autoCapitalize="words" autoComplete="name" error={fieldErrors.recipientName} label="Recipient name" maxLength={160} onChangeText={value => updateText('recipientName', value)} value={draft.recipientName} />
                <InputField autoComplete="tel" error={fieldErrors.contactPhoneNumber} keyboardType="phone-pad" label="Phone number" maxLength={32} onChangeText={value => updateText('contactPhoneNumber', value)} value={draft.contactPhoneNumber} />
                <InputField autoCapitalize="words" error={fieldErrors.addressLine1} label="House / building / street" maxLength={250} onChangeText={value => updateText('addressLine1', value)} value={draft.addressLine1} />
                <InputField autoCapitalize="words" error={fieldErrors.addressLine2} label="Address line 2 (optional)" maxLength={250} onChangeText={value => updateText('addressLine2', value)} value={draft.addressLine2} />
                <InputField autoCapitalize="words" error={fieldErrors.landmark} label="Landmark (optional)" maxLength={240} onChangeText={value => updateText('landmark', value)} value={draft.landmark} />
                <InputField autoCapitalize="words" error={fieldErrors.areaName} label="Area / locality" maxLength={160} onChangeText={value => updateText('areaName', value)} value={draft.areaName} />
                <InputField autoCapitalize="words" error={fieldErrors.districtName} label="District" maxLength={160} onChangeText={value => updateText('districtName', value)} value={draft.districtName} />
                <InputField error={fieldErrors.postalCode} helperText={CUSTOMER_ADDRESS_PINCODE_FALLBACK_COPY} keyboardType="number-pad" label="Pincode" maxLength={6} onChangeText={value => updateText('postalCode', value.replace(/[^0-9]/g, '').slice(0, 6))} value={draft.postalCode} />
                <InputField autoCapitalize="words" error={fieldErrors.city} label="City" maxLength={120} onChangeText={value => updateText('city', value)} value={draft.city} />
                <InputField autoCapitalize="words" error={fieldErrors.state} label="State" maxLength={120} onChangeText={value => updateText('state', value)} value={draft.state} />
              </View>

              {formError ? (
                <View accessibilityRole="alert" style={styles.errorBox}>
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}

              <Button
                label={mode === 'add' ? 'Save address' : 'Save changes'}
                loading={saving}
                onPress={() => save().catch(() => undefined)}
                style={styles.saveButton}
              />
            </View>
          </ScrollView>
        </View>
      </ScreenShell>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  header: {minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, borderBottomWidth: borderWidth.standard, borderBottomColor: colors.border, backgroundColor: colors.white},
  headerButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill},
  pressed: {opacity: 0.72},
  title: {flex: 1, textAlign: 'center', color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  headerSpacer: {width: touchTarget.minimum},
  scrollContent: {flexGrow: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.lg},
  card: {width: '100%', maxWidth: 640, alignSelf: 'center', borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, padding: spacing.lg, ...elevation.card},
  sectionTitle: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold, marginBottom: spacing.xs},
  labelOptions: {flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md},
  labelOption: {flex: 1, minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.borderStrong, backgroundColor: colors.white},
  labelOptionSelected: {borderColor: colors.flameRed, backgroundColor: colors.white},
  labelOptionText: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  labelOptionTextSelected: {color: colors.flameRed},
  locationButton: {marginBottom: spacing.md},
  notice: {padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.md, backgroundColor: colors.white},
  noticeText: {color: colors.textPrimary, fontSize: typography.small},
  fields: {gap: spacing.md},
  errorBox: {padding: spacing.md, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: borderWidth.standard, borderColor: colors.error},
  errorText: {color: colors.error, fontSize: typography.small},
  saveButton: {marginTop: spacing.lg},
});
