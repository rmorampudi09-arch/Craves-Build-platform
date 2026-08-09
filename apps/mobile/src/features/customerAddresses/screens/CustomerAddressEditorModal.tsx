import React, {useCallback, useState} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
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
import type {
  CustomerAddress,
  CustomerAddressLabel,
} from '../domain/customerAddressContract';
import {
  CUSTOMER_ADDRESS_CREATE_CONTRACT_BLOCKER,
  CUSTOMER_ADDRESS_CURRENT_LOCATION_BLOCKER,
  CUSTOMER_ADDRESS_LOCATION_FALLBACK_COPY,
  CUSTOMER_ADDRESS_PINCODE_FALLBACK_COPY,
  CUSTOMER_ADDRESS_PINCODE_LOOKUP_BLOCKER,
  applyCustomerAddressDefaultRule,
  createCustomerAddressDraft,
  createCustomerAddressSavePlan,
  isCustomerAddressDraftDirty,
  updateCustomerAddressDraftText,
  type CustomerAddressDraft,
  type CustomerAddressFieldErrors,
  type CustomerAddressTextField,
} from '../domain/customerAddressEditor';
import {useUpdateCustomerAddressMutation} from '../query/customerAddressQueries';

interface CustomerAddressEditorModalProps {
  mode: 'add' | 'edit';
  address?: CustomerAddress;
  addresses: CustomerAddress[];
  onClose: () => void;
}

const LABEL_OPTIONS: Array<{value: CustomerAddressLabel; label: string}> = [
  {value: 'HOME', label: 'Home'},
  {value: 'WORK', label: 'Work'},
  {value: 'OTHER', label: 'Other'},
];

export function CustomerAddressEditorModal({
  mode,
  address,
  addresses,
  onClose,
}: CustomerAddressEditorModalProps) {
  const editingAddressId = mode === 'edit' ? address?.id ?? null : null;
  const initialDraft = applyCustomerAddressDefaultRule(
    createCustomerAddressDraft(address),
    addresses,
    editingAddressId,
  );
  const [original] = useState<CustomerAddressDraft>(initialDraft);
  const [draft, setDraft] = useState<CustomerAddressDraft>(initialDraft);
  const [fieldErrors, setFieldErrors] = useState<CustomerAddressFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const updateMutation = useUpdateCustomerAddressMutation();
  const reduceMotionEnabled = useReducedMotionPreference();

  const defaultLocked =
    (mode === 'add' && addresses.length === 0) ||
    Boolean(mode === 'edit' && address?.isDefault);

  const updateText = useCallback(
    (field: CustomerAddressTextField, value: string) => {
      setDraft(current => updateCustomerAddressDraftText(current, field, value));
      setFieldErrors(current => {
        if (!current[field]) {
          return current;
        }
        const next = {...current};
        delete next[field];
        return next;
      });
      setFormError(null);
    },
    [],
  );

  const requestClose = useCallback(() => {
    if (!isCustomerAddressDraftDirty(draft, original)) {
      onClose();
      return;
    }

    Alert.alert(
      'Discard address changes?',
      'Your unsaved address changes will be lost.',
      [
        {text: 'Keep editing', style: 'cancel'},
        {text: 'Discard', style: 'destructive', onPress: onClose},
      ],
    );
  }, [draft, onClose, original]);

  const handleCurrentLocation = useCallback(() => {
    setLocationMessage(CUSTOMER_ADDRESS_LOCATION_FALLBACK_COPY);
  }, []);

  const handleSave = useCallback(async () => {
    if (updateMutation.isPending) {
      return;
    }

    const plan = createCustomerAddressSavePlan(
      draft,
      addresses,
      editingAddressId,
    );

    if (plan.status === 'invalid') {
      setFieldErrors(plan.fieldErrors);
      setFormError(plan.formError);
      return;
    }

    if (plan.status === 'blocked') {
      setFieldErrors(plan.fieldErrors);
      setFormError(plan.formError);
      return;
    }

    if (!editingAddressId) {
      setFormError(
        'This address cannot be saved until the approved create-address contract is available.',
      );
      return;
    }

    setFieldErrors({});
    setFormError(null);
    try {
      await updateMutation.mutateAsync({
        addressId: editingAddressId,
        request: plan.request,
      });
      Alert.alert('Address updated', 'Your saved address has been updated.', [
        {text: 'Done', onPress: onClose},
      ]);
    } catch (caught) {
      const error = toAppApiError(caught);
      setFormError(error.message);
    }
  }, [addresses, draft, editingAddressId, onClose, updateMutation]);

  return (
    <Modal
      animationType={resolveReducedMotionAnimation(
        'slide' as const,
        reduceMotionEnabled,
      )}
      onRequestClose={requestClose}
      presentationStyle="fullScreen"
      visible>
      <ScreenShell
        edges={['top', 'bottom']}
        keyboardAvoiding
        testID="customer-address-editor">
        <View style={styles.root}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Close address editor"
              accessibilityRole="button"
              hitSlop={spacing.sm}
              onPress={requestClose}
              style={({pressed}) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}>
              <Icon
                name="arrow-left"
                color={colors.espressoBrown}
                size={iconSize.md}
              />
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
              {mode === 'add' ? (
                <View style={styles.partialBanner}>
                  <Text style={styles.partialTitle}>
                    Manual address entry is ready
                  </Text>
                  <Text style={styles.partialCopy}>
                    Saving a brand-new address will be connected when the approved
                    create-address backend contract is added.
                  </Text>
                  <Text style={styles.blockerCode}>
                    {CUSTOMER_ADDRESS_CREATE_CONTRACT_BLOCKER}
                  </Text>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Address type</Text>
                <View style={styles.labelOptions}>
                  {LABEL_OPTIONS.map(option => {
                    const selected = draft.addressLabel === option.value;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{selected}}
                        key={option.value}
                        onPress={() => {
                          setDraft(current => ({
                            ...current,
                            addressLabel: option.value,
                          }));
                          setFormError(null);
                        }}
                        style={({pressed}) => [
                          styles.labelOption,
                          selected && styles.labelOptionSelected,
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.labelOptionText,
                            selected && styles.labelOptionTextSelected,
                          ]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Button
                accessibilityHint="Manual entry remains available if current location is unavailable."
                label="Use current location"
                leftIcon="location"
                onPress={handleCurrentLocation}
                style={styles.locationButton}
                variant="outline"
              />

              {locationMessage ? (
                <View accessibilityRole="alert" style={styles.notice}>
                  <Text style={styles.noticeText}>{locationMessage}</Text>
                  <Text style={styles.blockerCode}>
                    {CUSTOMER_ADDRESS_CURRENT_LOCATION_BLOCKER}
                  </Text>
                </View>
              ) : null}

              <View style={styles.fields}>
                <InputField
                  autoCapitalize="words"
                  autoComplete="name"
                  error={fieldErrors.recipientName}
                  label="Recipient name"
                  maxLength={160}
                  onChangeText={value => updateText('recipientName', value)}
                  value={draft.recipientName}
                />
                <InputField
                  autoComplete="tel"
                  error={fieldErrors.contactPhoneNumber}
                  keyboardType="phone-pad"
                  label="Phone number"
                  maxLength={32}
                  onChangeText={value =>
                    updateText('contactPhoneNumber', value)
                  }
                  value={draft.contactPhoneNumber}
                />
                <InputField
                  autoCapitalize="words"
                  error={fieldErrors.addressLine1}
                  label="House / building / street"
                  maxLength={240}
                  onChangeText={value => updateText('addressLine1', value)}
                  value={draft.addressLine1}
                />
                <InputField
                  autoCapitalize="words"
                  error={fieldErrors.addressLine2}
                  label="Address line 2 (optional)"
                  maxLength={240}
                  onChangeText={value => updateText('addressLine2', value)}
                  value={draft.addressLine2}
                />
                <InputField
                  autoCapitalize="words"
                  error={fieldErrors.landmark}
                  label="Landmark (optional)"
                  maxLength={240}
                  onChangeText={value => updateText('landmark', value)}
                  value={draft.landmark}
                />
                <InputField
                  autoCapitalize="words"
                  error={fieldErrors.areaName}
                  label="Area / locality"
                  maxLength={160}
                  onChangeText={value => updateText('areaName', value)}
                  value={draft.areaName}
                />
                <InputField
                  error={fieldErrors.postalCode}
                  helperText={CUSTOMER_ADDRESS_PINCODE_FALLBACK_COPY}
                  keyboardType="number-pad"
                  label="Pincode"
                  maxLength={6}
                  onChangeText={value =>
                    updateText(
                      'postalCode',
                      value.replace(/[^0-9]/g, '').slice(0, 6),
                    )
                  }
                  value={draft.postalCode}
                />
                <InputField
                  autoCapitalize="words"
                  error={fieldErrors.city}
                  label="City"
                  maxLength={120}
                  onChangeText={value => updateText('city', value)}
                  value={draft.city}
                />
                <InputField
                  autoCapitalize="words"
                  error={fieldErrors.state}
                  label="State"
                  maxLength={120}
                  onChangeText={value => updateText('state', value)}
                  value={draft.state}
                />
              </View>

              <Text style={styles.lookupCode}>
                {CUSTOMER_ADDRESS_PINCODE_LOOKUP_BLOCKER}
              </Text>

              <View style={styles.defaultRow}>
                <View style={styles.defaultCopy}>
                  <Text style={styles.defaultTitle}>
                    Make this my default address
                  </Text>
                  <Text style={styles.defaultHelper}>
                    {defaultLocked
                      ? mode === 'add'
                        ? 'Your first saved address must be the default.'
                        : 'The current default stays selected until another address becomes default.'
                      : 'You can choose this address as your default delivery location.'}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Default address"
                  disabled={defaultLocked}
                  onValueChange={value => {
                    setDraft(current => ({...current, isDefault: value}));
                    setFormError(null);
                  }}
                  value={draft.isDefault}
                />
              </View>

              {formError ? (
                <View accessibilityRole="alert" style={styles.errorBox}>
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}

              <Button
                label={mode === 'add' ? 'Save address' : 'Save changes'}
                loading={updateMutation.isPending}
                onPress={() => {
                  handleSave().catch(() => undefined);
                }}
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
  root: {flex: 1, backgroundColor: colors.surfaceWarm},
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  headerButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  pressed: {opacity: 0.72},
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSpacer: {width: touchTarget.minimum},
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.lg,
    ...elevation.card,
  },
  partialBanner: {
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  partialTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  partialCopy: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  blockerCode: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
  section: {marginBottom: spacing.md},
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
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
  labelOptionSelected: {
    borderColor: colors.flameRed,
    backgroundColor: colors.surfaceWarm,
  },
  labelOptionText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  labelOptionTextSelected: {color: colors.flameRed},
  locationButton: {marginBottom: spacing.md},
  notice: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
  },
  noticeText: {color: colors.textPrimary, fontSize: typography.small},
  fields: {gap: spacing.md},
  lookupCode: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
  },
  defaultCopy: {flex: 1},
  defaultTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  defaultHelper: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  errorBox: {
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
    borderWidth: borderWidth.standard,
    borderColor: colors.error,
  },
  errorText: {color: colors.error, fontSize: typography.small},
  saveButton: {marginTop: spacing.lg},
});