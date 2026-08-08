import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
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
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import type {CustomerProfileIdentity} from '../domain/customerProfileContract';
import {
  applyCustomerProfileLocalValidation,
  applyCustomerProfileSaveSuccess,
  applyCustomerProfileServerFailure,
  createCustomerProfileEditFormState,
  createCustomerProfileSavePlan,
  shouldConfirmCustomerProfileDiscard,
  updateCustomerProfileEditField,
  validateCustomerProfileAvatarSelection,
  type CustomerProfileEditFormState,
  type CustomerProfileEditableField,
} from '../domain/customerProfileEditForm';
import {
  resolveCustomerProfileInitials,
  resolveCustomerProfilePhoneLabel,
} from '../presentation/customerProfileUiModel';
import {
  useCustomerProfileQuery,
  useUpdateCustomerProfileMutation,
} from '../query/customerProfileQueries';

type EditProfileNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerProfileEdit'
>;

const AVATAR_BLOCKED_COPY =
  'Photo updates are not available yet because the approved customer profile API does not expose an avatar upload operation.';

function EditProfileSkeleton() {
  return (
    <View accessibilityLabel="Loading edit profile" accessibilityRole="progressbar" style={styles.skeleton}>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLine} />
    </View>
  );
}

function EditProfileForm({
  profile,
  form,
  saving,
  onChange,
  onSave,
  onAvatarPress,
}: {
  profile: CustomerProfileIdentity;
  form: CustomerProfileEditFormState;
  saving: boolean;
  onChange: (field: CustomerProfileEditableField, value: string) => void;
  onSave: () => void;
  onAvatarPress: () => void;
}) {
  return (
    <View style={styles.formCard}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{resolveCustomerProfileInitials(profile)}</Text>
        </View>
        <Pressable
          accessibilityHint={AVATAR_BLOCKED_COPY}
          accessibilityLabel="Change profile photo"
          accessibilityRole="button"
          onPress={onAvatarPress}
          style={({pressed}) => [styles.avatarEdit, pressed && styles.pressed]}>
          <Icon name="account" color={colors.white} size={iconSize.xs} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={onAvatarPress} style={styles.photoCopyButton}>
        <Text style={styles.photoAction}>Change profile photo</Text>
      </Pressable>
      <Text style={styles.photoHelper}>Photo upload will be enabled only when its backend contract is approved.</Text>

      <View style={styles.fields}>
        <InputField
          autoCapitalize="words"
          autoComplete="name-given"
          error={form.fieldErrors.firstName}
          label="First name"
          maxLength={100}
          onChangeText={value => onChange('firstName', value)}
          returnKeyType="next"
          value={form.draft.firstName}
        />
        <InputField
          autoCapitalize="words"
          autoComplete="name-family"
          error={form.fieldErrors.lastName}
          label="Last name"
          maxLength={100}
          onChangeText={value => onChange('lastName', value)}
          returnKeyType="next"
          value={form.draft.lastName}
        />
        <InputField
          autoCapitalize="none"
          autoComplete="email"
          error={form.fieldErrors.email}
          keyboardType="email-address"
          label="Email address"
          maxLength={255}
          onChangeText={value => onChange('email', value)}
          returnKeyType="done"
          value={form.draft.email}
        />
        <InputField
          disabled
          helperText="Your registered mobile number cannot be changed from this screen."
          label="Mobile number"
          value={resolveCustomerProfilePhoneLabel(profile)}
        />
      </View>

      {form.formError ? (
        <Text accessibilityRole="alert" style={styles.formError}>
          {form.formError}
        </Text>
      ) : null}

      <Button
        disabled={saving}
        label="Save changes"
        loading={saving}
        onPress={onSave}
        style={styles.saveButton}
        testID="customer-profile-edit-save"
      />
    </View>
  );
}

/** P65 shared edit form. Active/empty cart chrome is owned by the route wrapper. */
export function CustomerProfileEditScreen() {
  const navigation = useNavigation<EditProfileNavigation>();
  const profileQuery = useCustomerProfileQuery();
  const updateMutation = useUpdateCustomerProfileMutation();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [form, setForm] = useState<CustomerProfileEditFormState | null>(null);

  const profile =
    profileQuery.contractState.status === 'ready'
      ? profileQuery.contractState.data.profile
      : null;

  useEffect(() => {
    if (profile && !form) {
      setForm(createCustomerProfileEditFormState(profile));
    }
  }, [form, profile]);

  const handleBack = useCallback(() => {
    if (!form || !shouldConfirmCustomerProfileDiscard(form)) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard changes?', 'Your unsaved profile changes will be lost.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard', style: 'destructive', onPress: () => navigation.goBack()},
    ]);
  }, [form, navigation]);

  const handleChange = useCallback(
    (field: CustomerProfileEditableField, value: string) => {
      setForm(current =>
        current ? updateCustomerProfileEditField(current, field, value) : current,
      );
    },
    [],
  );

  const handleAvatarPress = useCallback(() => {
    const validation = validateCustomerProfileAvatarSelection();
    if (validation.status === 'unsupported') {
      Alert.alert('Profile photo unavailable', AVATAR_BLOCKED_COPY, [{text: 'OK'}]);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!form || updateMutation.isPending) {
      return;
    }

    const plan = createCustomerProfileSavePlan(form);
    if (plan.status === 'unchanged') {
      navigation.goBack();
      return;
    }
    if (plan.status === 'invalid') {
      setForm(current => (current ? applyCustomerProfileLocalValidation(current) : current));
      return;
    }

    try {
      const saved = await updateMutation.mutateAsync(plan.request);
      setForm(current =>
        current ? applyCustomerProfileSaveSuccess(current, saved.profile) : current,
      );
      Alert.alert('Profile updated', 'Your changes have been saved.', [
        {text: 'Done', onPress: () => navigation.goBack()},
      ]);
    } catch (error) {
      const failure = toAppApiError(error);
      setForm(current =>
        current
          ? applyCustomerProfileServerFailure(current, {
              code: failure.code,
              message: failure.message,
              details: failure.details,
            })
          : current,
      );
    }
  }, [form, navigation, updateMutation]);

  const body = (() => {
    if (profileQuery.sessionRequired) {
      return (
        <TerminalState
          title="Sign in required"
          description="Sign in again before changing your customer profile."
        />
      );
    }
    switch (profileQuery.contractState.status) {
      case 'loading':
        return <EditProfileSkeleton />;
      case 'ready':
        return form && profile ? (
          <EditProfileForm
            form={form}
            onAvatarPress={handleAvatarPress}
            onChange={handleChange}
            onSave={handleSave}
            profile={profile}
            saving={updateMutation.isPending}
          />
        ) : (
          <EditProfileSkeleton />
        );
      case 'empty':
        return <TerminalState title="Profile not available" description="No editable customer profile was returned." />;
      case 'unsupported':
        return <TerminalState title="Profile unavailable" description="The approved customer profile contract cannot provide this state yet." />;
      case 'error':
        return (
          <TerminalState
            actionLabel="Try again"
            description="Check your connection and try loading your profile again."
            onAction={() => profileQuery.refetch().catch(() => undefined)}
            title="Profile could not be loaded"
          />
        );
    }
  })();

  return (
    <ScreenShell edges={['top']} keyboardAvoiding testID="customer-profile-edit">
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to profile"
            accessibilityRole="button"
            hitSlop={spacing.sm}
            onPress={handleBack}
            style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
            <Icon name="arrow-left" color={colors.espressoBrown} size={iconSize.md} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>Edit Profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onScroll={bottomNavScroll.onScroll}
          scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      </View>
    </ScreenShell>
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
  backButton: {
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  formCard: {
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
  avatarWrap: {alignSelf: 'center', position: 'relative'},
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.creamDeep,
    overflow: 'hidden',
  },
  avatarText: {
    color: colors.flameRed,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  avatarEdit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    overflow: 'hidden',
  },
  photoCopyButton: {alignSelf: 'center', padding: spacing.xs},
  photoAction: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  photoHelper: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  fields: {gap: spacing.md},
  formError: {
    color: colors.error,
    fontSize: typography.small,
    marginTop: spacing.md,
  },
  saveButton: {marginTop: spacing.lg},
  skeleton: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  skeletonAvatar: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignSelf: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
});