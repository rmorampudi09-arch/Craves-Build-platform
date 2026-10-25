import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import {EmailVerificationPanel} from '../components/EmailVerificationPanel';
import type {CustomerProfileIdentity} from '../domain/customerProfileContract';
import {
  applyCustomerProfileLocalValidation,
  applyCustomerProfileSaveSuccess,
  applyCustomerProfileServerFailure,
  createCustomerProfileEditFormState,
  createCustomerProfileSavePlan,
  shouldConfirmCustomerProfileDiscard,
  updateCustomerProfileEditField,
  type CustomerProfileEditFormState,
  type CustomerProfileEditableField,
} from '../domain/customerProfileEditForm';
import {resolveCustomerProfilePhoneLabel} from '../presentation/customerProfileUiModel';
import {
  useCustomerProfileQuery,
  useUpdateCustomerProfileMutation,
} from '../query/customerProfileQueries';

type EditProfileNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerProfileEdit'
>;

function EditProfileSkeleton() {
  return (
    <View accessibilityLabel="Loading edit profile" accessibilityRole="progressbar" style={styles.skeleton}>
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
}: {
  profile: CustomerProfileIdentity;
  form: CustomerProfileEditFormState;
  saving: boolean;
  onChange: (field: CustomerProfileEditableField, value: string) => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.formCard}>
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
        <EmailVerificationPanel
          email={form.draft.email}
          disabled={saving}
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
          description="Sign in again before changing your profile."
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
            onChange={handleChange}
            onSave={handleSave}
            profile={profile}
            saving={updateMutation.isPending}
          />
        ) : (
          <EditProfileSkeleton />
        );
      case 'empty':
        return <TerminalState title="Profile not available" description="We could not find a profile for this account. Please try again." />;
      case 'unsupported':
        return <TerminalState title="Profile unavailable" description="We could not show your profile right now. Please try again." />;
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
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-profile-edit">
      {/* Edge-to-edge Android no longer shrinks the window for the keyboard, so the screen makes room itself. */}
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
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
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
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
  skeletonLine: {height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
});