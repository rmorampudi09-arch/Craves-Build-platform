import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {z} from 'zod';
import type {RootStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {colors, spacing} from '../../../design/tokens';
import {chefRegistrationSchema} from '../../../utils/validation';
import {profileApi} from '../api/profileApi';
import {AuthCard} from '../components/AuthCard';
import {AuthShell} from '../components/AuthShell';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {ScreenHeader} from '../components/ScreenHeader';
import {
  chefApplicationToDraft,
  mapChefApplicationSubmissionFailure,
  normalizeChefApplicationInput,
} from '../domain/chefApplicationOnboarding';
import {accountResolutionService} from '../state/accountResolutionService';
import {authActions} from '../state/authSlice';

type Form = z.infer<typeof chefRegistrationSchema>;
type Props = NativeStackScreenProps<RootStackParamList, 'ChefRegistration'>;

const emptyDraft: Form = {
  email: '',
  firstName: '',
  lastName: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  postalCode: '',
};

export function ChefRegistrationScreen({navigation}: Props) {
  const dispatch = useAppDispatch();
  const accountResolution = useAppSelector(state => state.auth.accountResolution);
  const [serverError, setServerError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: {errors, isSubmitting},
  } = useForm<Form>({
    resolver: zodResolver(chefRegistrationSchema),
    defaultValues: emptyDraft,
  });

  const isRejectedApplication =
    accountResolution?.flow === 'CHEF_ONBOARDING' &&
    accountResolution.onboardingStatus === 'REJECTED';

  const loadRejectedApplication = useCallback(async () => {
    setLoadingExisting(true);
    setServerError(null);

    try {
      const application = await profileApi.getChefApplication();

      if (application.status === 'APPROVED') {
        const resolved = await accountResolutionService.resolve('CHEF');
        dispatch(authActions.accountResolved(resolved));
        navigation.replace('ChefAccountStatus', {status: 'APPROVED'});
        return;
      }

      dispatch(authActions.chefApplicationStatusObserved(application.status));

      if (application.status === 'PENDING') {
        navigation.replace('ChefAccountStatus', {status: 'PENDING'});
        return;
      }

      if (application.status === 'NOT_SUBMITTED') {
        setRejectionReason(null);
        reset(emptyDraft);
        return;
      }

      setRejectionReason(application.rejectionReason);
      reset(chefApplicationToDraft(application));
    } catch (cause) {
      const failure = mapChefApplicationSubmissionFailure(cause);
      setServerError(failure.error.message);
    } finally {
      setLoadingExisting(false);
    }
  }, [dispatch, navigation, reset]);

  useEffect(() => {
    if (isRejectedApplication) {
      void loadRejectedApplication();
    }
  }, [isRejectedApplication, loadRejectedApplication]);

  const submit = handleSubmit(async values => {
    setServerError(null);

    if (
      accountResolution?.flow !== 'CHEF_ONBOARDING' ||
      (accountResolution.onboardingStatus !== 'NOT_SUBMITTED' &&
        accountResolution.onboardingStatus !== 'REJECTED')
    ) {
      setServerError('Your Chef application state changed. Refresh your status before continuing.');
      return;
    }

    try {
      const application = await profileApi.submitChefApplication(
        normalizeChefApplicationInput(values),
      );

      if (application.status !== 'PENDING') {
        setServerError(
          'We could not confirm your application as pending. Refresh your Chef status before continuing.',
        );
        return;
      }

      dispatch(authActions.chefApplicationStatusObserved('PENDING'));
      navigation.replace('ChefAccountStatus', {status: 'PENDING'});
    } catch (cause) {
      const failure = mapChefApplicationSubmissionFailure(cause);
      const fieldEntries = Object.entries(failure.fieldErrors) as Array<
        [keyof Form, string]
      >;

      for (const [field, message] of fieldEntries) {
        setError(field, {type: 'server', message});
      }

      setServerError(
        fieldEntries.length > 0
          ? 'Please check the highlighted fields and try again.'
          : failure.error.message,
      );
    }
  });

  return (
    <AuthShell>
      <ScreenHeader title="Become a Chef" />
      <AuthCard>
        <Text style={styles.title}>
          {isRejectedApplication ? 'Update your chef application' : 'Set up your chef application'}
        </Text>
        <Text style={styles.description}>
          Your details are reviewed before Chef mode is enabled. Chef email is required.
        </Text>
        {loadingExisting ? (
          <Text style={styles.loadingText}>Loading your latest application…</Text>
        ) : null}
        {rejectionReason ? (
          <Text style={styles.rejectionReason}>Review note: {rejectionReason}</Text>
        ) : null}
        <Controller
          control={control}
          name="firstName"
          render={({field}) => (
            <InputField
              placeholder="First name"
              autoCapitalize="words"
              autoComplete="name-given"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.firstName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="lastName"
          render={({field}) => (
            <InputField
              placeholder="Last name"
              autoCapitalize="words"
              autoComplete="name-family"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.lastName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({field}) => (
            <InputField
              placeholder="Chef email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              leftIcon="mail"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.email?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="addressLine1"
          render={({field}) => (
            <InputField
              placeholder="Address line 1"
              autoCapitalize="words"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.addressLine1?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="addressLine2"
          render={({field}) => (
            <InputField
              placeholder="Address line 2 (optional)"
              autoCapitalize="words"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.addressLine2?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="landmark"
          render={({field}) => (
            <InputField
              placeholder="Landmark (optional)"
              autoCapitalize="words"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.landmark?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="city"
          render={({field}) => (
            <InputField
              placeholder="City"
              autoCapitalize="words"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.city?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="state"
          render={({field}) => (
            <InputField
              placeholder="State"
              autoCapitalize="words"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.state?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="postalCode"
          render={({field}) => (
            <InputField
              placeholder="Postal code (optional)"
              autoCapitalize="characters"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.postalCode?.message}
            />
          )}
        />
        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
        <PrimaryButton
          label={isRejectedApplication ? 'Resubmit for review' : 'Submit for review'}
          loading={isSubmitting}
          disabled={loadingExisting}
          onPress={submit}
        />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.espressoBrown,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
    marginTop: 7,
    marginBottom: spacing.md,
  },
  loadingText: {
    fontSize: 13,
    color: colors.mutedText,
    marginBottom: spacing.sm,
  },
  rejectionReason: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: spacing.sm,
  },
});
