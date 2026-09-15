import React, {useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {z} from 'zod';
import type {RootStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {colors, spacing} from '../../../design/tokens';
import {customerRegistrationSchema} from '../../../utils/validation';
import {profileApi} from '../api/profileApi';
import {AuthCard} from '../components/AuthCard';
import {AuthShell} from '../components/AuthShell';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {ScreenHeader} from '../components/ScreenHeader';
import {
  mapCustomerProfileSubmissionFailure,
  normalizeCustomerProfileInput,
} from '../domain/customerProfileCompletion';
import {authActions} from '../state/authSlice';

type Form = z.infer<typeof customerRegistrationSchema>;
type Props = NativeStackScreenProps<RootStackParamList, 'CustomerRegistration'>;

export function CustomerRegistrationScreen({navigation}: Props) {
  const dispatch = useAppDispatch();
  const accountResolution = useAppSelector(state => state.auth.accountResolution);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: {errors, isSubmitting},
  } = useForm<Form>({
    resolver: zodResolver(customerRegistrationSchema),
    defaultValues: {firstName: '', lastName: '', email: ''},
  });

  const submit = handleSubmit(async values => {
    setServerError(null);

    if (
      accountResolution?.flow !== 'CUSTOMER' ||
      accountResolution.onboardingStatus !== 'PROFILE_REQUIRED'
    ) {
      setServerError('Your account state changed. Please sign in again or retry account setup.');
      return;
    }

    try {
      await profileApi.saveCustomerProfile(normalizeCustomerProfileInput(values));
      dispatch(authActions.customerProfileCompleted());
      navigation.replace('CustomerAccountStatus');
    } catch (cause) {
      const failure = mapCustomerProfileSubmissionFailure(cause);
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
      <ScreenHeader title="Create your profile" />
      <AuthCard>
        <Text style={styles.title}>Welcome to Craves</Text>
        <Text style={styles.description}>
          Tell us a little about you before you start ordering homemade food.
        </Text>
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
              placeholder="Email address (optional)"
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
        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
        <PrimaryButton label="Create profile" loading={isSubmitting} onPress={submit} />
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
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: spacing.sm,
  },
});
