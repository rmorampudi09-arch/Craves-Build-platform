import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
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
import {Icon} from '../../../shared/components/Icon';
import {
  CHEF_EDIT_PROFILE_BLOCKED_CAPABILITIES,
  canEditChefKitchenProfile,
  chefEditProfileFormSchema,
  type ChefEditProfileBlockedCapability,
  type ChefEditProfileFormValues,
} from '../domain/chefEditProfileForm';
import {useChefEditProfileDraft} from '../state/ChefEditProfileDraftProvider';
import {useChefEditProfileModel} from '../state/useChefEditProfileModel';
import {useChefProfileModel} from '../state/useChefProfileModel';

type Props = NativeStackScreenProps<ChefProfileStackParamList, 'ChefEditProfile'>;
type FieldErrors = Partial<Record<keyof ChefEditProfileFormValues, string>>;

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
  disabled?: boolean;
};

function FormField({label, error, helper, disabled, style, ...props}: FormFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        editable={!disabled}
        placeholderTextColor={colors.placeholder}
        style={[
          styles.input,
          props.multiline && styles.multilineInput,
          disabled && styles.inputDisabled,
          error && styles.inputError,
          style,
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.fieldError}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.fieldHelper}>{helper}</Text>
      ) : null}
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function capabilityReason(capability: ChefEditProfileBlockedCapability): string {
  return (
    CHEF_EDIT_PROFILE_BLOCKED_CAPABILITIES.find(
      boundary => boundary.capability === capability,
    )?.reason ??
    'This capability does not have an approved mobile/backend contract yet.'
  );
}

function initials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.length > 0
    ? parts.map(part => part[0]?.toUpperCase() ?? '').join('')
    : 'C';
}

function CapabilityRow({
  title,
  subtitle,
  capability,
}: {
  title: string;
  subtitle: string;
  capability: ChefEditProfileBlockedCapability;
}) {
  const handlePress = React.useCallback(() => {
    Alert.alert(`${title} unavailable`, capabilityReason(capability), [{text: 'OK'}]);
  }, [capability, title]);

  return (
    <Pressable
      accessibilityHint="Explains why this profile capability is not available yet"
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={handlePress}
      style={({pressed}) => [styles.capabilityRow, pressed && styles.pressed]}>
      <View style={styles.capabilityIcon}>
        <Icon name="lock" color={colors.textSecondary} size={iconSize.xs} />
      </View>
      <View style={styles.capabilityCopy}>
        <Text style={styles.capabilityTitle}>{title}</Text>
        <Text style={styles.capabilitySubtitle}>{subtitle}</Text>
      </View>
      <Icon name="chevron-right" color={colors.placeholder} size={iconSize.xs} />
    </Pressable>
  );
}

function LoadingState() {
  return (
    <View
      accessibilityLabel="Loading Chef edit profile"
      accessibilityRole="progressbar"
      style={styles.loadingWrap}>
      <View style={styles.loadingAvatar} />
      <View style={styles.loadingLineWide} />
      <View style={styles.loadingLine} />
      <View style={styles.loadingCard} />
      <View style={styles.loadingCard} />
    </View>
  );
}

function validationErrors(values: ChefEditProfileFormValues): FieldErrors | null {
  const result = chefEditProfileFormSchema.safeParse(values);
  if (result.success) {
    return null;
  }

  const fields = result.error.flatten().fieldErrors;
  return {
    kitchenName: fields.kitchenName?.[0],
    displayName: fields.displayName?.[0],
    description: fields.description?.[0],
    phoneNumber: fields.phoneNumber?.[0],
    email: fields.email?.[0],
    addressLine1: fields.addressLine1?.[0],
    addressLine2: fields.addressLine2?.[0],
    landmark: fields.landmark?.[0],
    areaName: fields.areaName?.[0],
    city: fields.city?.[0],
    state: fields.state?.[0],
    postalCode: fields.postalCode?.[0],
  };
}

export function ChefEditProfileScreen({navigation}: Props) {
  const profileModel = useChefProfileModel();
  const draft = useChefEditProfileDraft();
  const editModel = useChefEditProfileModel();
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const allowRemoveRef = React.useRef(false);

  React.useEffect(() => {
    if (!draft.formDraft && profileModel.kitchen) {
      draft.begin(profileModel.kitchen);
    }
  }, [draft, profileModel.kitchen]);

  React.useEffect(() => {
    return navigation.addListener('beforeRemove', event => {
      if (allowRemoveRef.current || !draft.dirtyState || editModel.saveState === 'success') {
        return;
      }

      event.preventDefault();
      Alert.alert(
        'Discard profile changes?',
        'Your unsaved Chef profile changes will be lost.',
        [
          {text: 'Keep editing', style: 'cancel'},
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              allowRemoveRef.current = true;
              draft.discard();
              navigation.dispatch(event.data.action);
            },
          },
        ],
      );
    });
  }, [draft, editModel.saveState, navigation]);

  const values = draft.formDraft;
  const originalProfile = draft.originalProfile;
  const readOnly = originalProfile
    ? !canEditChefKitchenProfile(originalProfile)
    : true;
  const submitting = editModel.saveState === 'submitting';
  const displayName =
    values?.displayName.trim() || values?.kitchenName.trim() || 'Chef profile';

  const updateField = React.useCallback(
    <K extends keyof ChefEditProfileFormValues>(
      field: K,
      value: ChefEditProfileFormValues[K],
    ) => {
      if (!draft.formDraft || readOnly || submitting) {
        return;
      }
      draft.replaceDraft({...draft.formDraft, [field]: value});
      setErrors(current => ({...current, [field]: undefined}));
      if (editModel.errorMessage) {
        editModel.clearError();
      }
    },
    [draft, editModel, readOnly, submitting],
  );

  const showCapabilityBlocker = React.useCallback(
    (title: string, capability: ChefEditProfileBlockedCapability) => {
      Alert.alert(`${title} unavailable`, capabilityReason(capability), [{text: 'OK'}]);
    },
    [],
  );

  const save = React.useCallback(async () => {
    if (!values || readOnly || submitting || !draft.dirtyState) {
      return;
    }

    const nextErrors = validationErrors(values);
    if (nextErrors) {
      setErrors(nextErrors);
      Alert.alert(
        'Check your profile',
        'Some required profile fields need attention before Craves can save these changes.',
      );
      return;
    }

    setErrors({});
    editModel.clearError();
    const updated = await editModel.save();
    if (!updated) {
      return;
    }

    allowRemoveRef.current = true;
    Alert.alert('Profile updated', 'Your Chef profile changes were saved.', [
      {
        text: 'Done',
        onPress: () => navigation.goBack(),
      },
    ]);
  }, [draft.dirtyState, editModel, navigation, readOnly, submitting, values]);

  if (!values || !originalProfile) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to Chef profile"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.headerButton, pressed && styles.pressed]}>
            <Icon name="arrow-left" color={colors.espressoBrown} size={22} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Edit Profile
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        {profileModel.kitchenStatus === 'error' ? (
          <View style={styles.centerState}>
            <Icon name="wifi-off" color={colors.textSecondary} size={iconSize.xl} />
            <Text style={styles.centerStateTitle}>Profile details unavailable</Text>
            <Text style={styles.centerStateText}>
              Craves could not load the Chef kitchen profile required by this form. Your existing data was not replaced.
            </Text>
            <Pressable
              accessibilityLabel="Retry Chef profile"
              accessibilityRole="button"
              disabled={profileModel.isRefreshing}
              onPress={() => {
                profileModel.refresh().catch(() => undefined);
              }}
              style={({pressed}) => [
                styles.retryButton,
                (pressed || profileModel.isRefreshing) && styles.pressed,
              ]}>
              {profileModel.isRefreshing ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.retryButtonText}>Try again</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <LoadingState />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to Chef profile"
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [
            styles.headerButton,
            (pressed || submitting) && styles.pressed,
          ]}>
          <Icon name="arrow-left" color={colors.espressoBrown} size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>
            Edit Profile
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            Chef account
          </Text>
        </View>
        <View accessibilityLabel={`${displayName} profile avatar`} style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{initials(displayName)}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {readOnly ? (
            <View accessibilityRole="alert" style={styles.readOnlyBanner}>
              <Icon name="shield" color={colors.error} size={iconSize.lg} />
              <View style={styles.bannerCopy}>
                <Text style={styles.readOnlyTitle}>Profile editing is unavailable</Text>
                <Text style={styles.readOnlyText}>
                  This kitchen is suspended, so the current backend contract requires this profile to remain read-only.
                </Text>
              </View>
            </View>
          ) : null}

          <Section
            title="Profile photo"
            subtitle="Help customers recognize you and your kitchen.">
            <View style={styles.photoRow}>
              <View accessibilityLabel={`${displayName} profile photo`} style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{initials(displayName)}</Text>
              </View>
              <View style={styles.photoCopy}>
                <Text style={styles.photoTitle}>Your Chef photo</Text>
                <Text style={styles.photoHint}>
                  Photo changes are shown in the reference, but this build has no approved Chef upload/remove route or native picker contract.
                </Text>
                <View style={styles.photoActions}>
                  <Pressable
                    accessibilityLabel="Change Chef profile photo"
                    accessibilityRole="button"
                    onPress={() => showCapabilityBlocker('Change photo', 'PHOTO_UPLOAD')}
                    style={({pressed}) => [styles.outlineAction, pressed && styles.pressed]}>
                    <Text style={styles.outlineActionText}>Change photo</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Remove Chef profile photo"
                    accessibilityRole="button"
                    onPress={() => showCapabilityBlocker('Remove photo', 'PHOTO_UPLOAD')}
                    style={({pressed}) => [styles.textAction, pressed && styles.pressed]}>
                    <Text style={styles.textActionText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Section>

          <Section title="Personal information">
            <FormField
              autoCapitalize="words"
              disabled={readOnly || submitting}
              error={errors.displayName}
              label="Display name"
              onChangeText={text => updateField('displayName', text)}
              placeholder="How customers see your name"
              value={values.displayName}
            />
            <FormField
              autoCapitalize="none"
              disabled={readOnly || submitting}
              error={errors.phoneNumber}
              keyboardType="phone-pad"
              label="Phone number"
              onChangeText={text => updateField('phoneNumber', text)}
              placeholder="Phone number"
              value={values.phoneNumber}
            />
            <FormField
              autoCapitalize="none"
              autoCorrect={false}
              disabled={readOnly || submitting}
              error={errors.email}
              keyboardType="email-address"
              label="Email"
              onChangeText={text => updateField('email', text)}
              placeholder="Email address"
              value={values.email}
            />
            <FormField
              disabled={readOnly || submitting}
              error={errors.description}
              label="Bio"
              multiline
              onChangeText={text => updateField('description', text)}
              placeholder="Tell customers about you and your food"
              textAlignVertical="top"
              value={values.description}
            />
            <Text accessibilityLiveRegion="polite" style={styles.counterText}>
              {values.description.length}/2000
            </Text>
          </Section>

          <Section title="Business information">
            <FormField
              autoCapitalize="words"
              disabled={readOnly || submitting}
              error={errors.kitchenName}
              label="Kitchen name"
              onChangeText={text => updateField('kitchenName', text)}
              placeholder="Kitchen name"
              value={values.kitchenName}
            />
            <CapabilityRow
              capability="CUISINE_METADATA"
              subtitle="Cuisine metadata is not exposed by the approved Chef contract yet."
              title="Cuisine & specialties"
            />
            <CapabilityRow
              capability="BUSINESS_VALIDATION"
              subtitle="Business validation/serviceability remains backend-blocked."
              title="Business validation"
            />
          </Section>

          <Section
            title="Address & service area"
            subtitle="These address fields map directly to the current kitchen profile request.">
            <FormField
              autoCapitalize="words"
              disabled={readOnly || submitting}
              error={errors.addressLine1}
              label="Address line 1"
              onChangeText={text => updateField('addressLine1', text)}
              placeholder="Street address"
              value={values.addressLine1}
            />
            <FormField
              autoCapitalize="words"
              disabled={readOnly || submitting}
              error={errors.addressLine2}
              label="Address line 2"
              onChangeText={text => updateField('addressLine2', text)}
              placeholder="Apartment, building or floor"
              value={values.addressLine2}
            />
            <FormField
              autoCapitalize="words"
              disabled={readOnly || submitting}
              error={errors.landmark}
              label="Landmark"
              onChangeText={text => updateField('landmark', text)}
              placeholder="Nearby landmark"
              value={values.landmark}
            />
            <FormField
              autoCapitalize="words"
              disabled={readOnly || submitting}
              error={errors.areaName}
              helper="The current request accepts an area name; service-area lookup is not available."
              label="Area"
              onChangeText={text => updateField('areaName', text)}
              placeholder="Area or neighborhood"
              value={values.areaName}
            />
            <FormField
              autoCapitalize="words"
              disabled={readOnly || submitting}
              error={errors.city}
              label="City"
              onChangeText={text => updateField('city', text)}
              placeholder="City"
              value={values.city}
            />
            <FormField
              autoCapitalize="words"
              disabled={readOnly || submitting}
              error={errors.state}
              label="State"
              onChangeText={text => updateField('state', text)}
              placeholder="State"
              value={values.state}
            />
            <FormField
              autoCapitalize="characters"
              disabled={readOnly || submitting}
              error={errors.postalCode}
              keyboardType="number-pad"
              label="Postal code"
              onChangeText={text => updateField('postalCode', text)}
              placeholder="Postal code"
              value={values.postalCode}
            />
            <CapabilityRow
              capability="SERVICE_AREA_LOOKUP"
              subtitle="No approved Chef service-area selector/lookup endpoint is present."
              title="Select service areas"
            />
          </Section>

          <Section title="Social links">
            <CapabilityRow
              capability="SOCIAL_LINKS"
              subtitle="Social-link fields are not part of the exact KitchenProfileRequest."
              title="Add social links"
            />
          </Section>

          {editModel.errorMessage ? (
            <View accessibilityRole="alert" style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>Profile could not be saved</Text>
              <Text style={styles.errorBannerText}>{editModel.errorMessage}</Text>
              {editModel.errorDetails.map(detail => (
                <Text key={detail} style={styles.errorDetail}>
                  • {detail}
                </Text>
              ))}
              <Pressable
                accessibilityLabel="Dismiss profile save error"
                accessibilityRole="button"
                onPress={editModel.clearError}
                style={({pressed}) => [styles.errorDismiss, pressed && styles.pressed]}>
                <Text style={styles.errorDismissText}>Dismiss</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.saveBlock}>
            <Pressable
              accessibilityHint={
                readOnly
                  ? 'Profile editing is disabled while the kitchen is suspended'
                  : !draft.dirtyState
                    ? 'Make a valid change before saving'
                    : 'Saves this Chef profile through the current kitchen profile API'
              }
              accessibilityLabel="Save Chef profile changes"
              accessibilityRole="button"
              accessibilityState={{
                disabled: readOnly || submitting || !draft.dirtyState,
                busy: submitting,
              }}
              disabled={readOnly || submitting || !draft.dirtyState}
              onPress={save}
              style={({pressed}) => [
                styles.saveButton,
                (readOnly || !draft.dirtyState) && styles.saveButtonDisabled,
                pressed && !submitting && styles.pressed,
              ]}>
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </Pressable>
            <Text style={styles.saveHelper}>
              {draft.dirtyState
                ? 'Unsaved changes are protected if you try to leave this screen.'
                : 'Your profile is up to date.'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  safeArea: {flex: 1, backgroundColor: colors.white},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {flex: 1, minWidth: 0},
  headerTitle: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  headerSpacer: {width: touchTarget.minimum},
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
  },
  headerAvatarText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
    ...elevation.card,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  sectionBody: {marginTop: spacing.md, gap: spacing.md},
  fieldBlock: {gap: spacing.xs},
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  input: {
    minHeight: touchTarget.comfortable,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    color: colors.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multilineInput: {minHeight: 116},
  inputDisabled: {backgroundColor: colors.surfaceMuted, color: colors.textSecondary},
  inputError: {borderColor: colors.error},
  fieldError: {color: colors.error, fontSize: typography.small},
  fieldHelper: {color: colors.textSecondary, fontSize: typography.tiny},
  counterText: {
    marginTop: -spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'right',
  },
  photoRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md},
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
  },
  profileAvatarText: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  photoCopy: {flex: 1, minWidth: 0},
  photoTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  photoHint: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  photoActions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  outlineAction: {
    minHeight: touchTarget.minimum,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  outlineActionText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  textAction: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  textActionText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  capabilityRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  capabilityIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  capabilityCopy: {flex: 1, minWidth: 0},
  capabilityTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  capabilitySubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
  bannerCopy: {flex: 1},
  readOnlyTitle: {
    color: colors.error,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  readOnlyText: {
    marginTop: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.small,
  },
  errorBanner: {
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
  errorBannerTitle: {
    color: colors.error,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  errorBannerText: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.small,
  },
  errorDetail: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  errorDismiss: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingRight: spacing.md,
  },
  errorDismissText: {
    color: colors.error,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  saveBlock: {paddingTop: spacing.xs, paddingBottom: spacing.sm},
  saveButton: {
    minHeight: touchTarget.comfortable,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    paddingHorizontal: spacing.lg,
    ...elevation.primaryAction,
  },
  saveButtonDisabled: {
    backgroundColor: colors.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  saveHelper: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'center',
  },
  loadingWrap: {padding: spacing.lg, gap: spacing.md},
  loadingAvatar: {
    width: 88,
    height: 88,
    alignSelf: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  loadingLineWide: {
    width: '70%',
    height: 18,
    alignSelf: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  loadingLine: {
    width: '48%',
    height: 12,
    alignSelf: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  loadingCard: {
    height: 156,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centerStateTitle: {
    marginTop: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  centerStateText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: touchTarget.minimum,
    minWidth: 120,
    marginTop: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.62},
});
