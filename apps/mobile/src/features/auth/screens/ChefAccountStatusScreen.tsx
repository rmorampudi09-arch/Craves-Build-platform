import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {profileApi} from '../api/profileApi';
import {AuthCard} from '../components/AuthCard';
import {AuthShell} from '../components/AuthShell';
import {PrimaryButton} from '../components/PrimaryButton';
import type {ChefApplication, ChefApplicationStatus} from '../domain/types';
import {accountResolutionService} from '../state/accountResolutionService';
import {authService} from '../state/authService';
import {authActions} from '../state/authSlice';

type Props = NativeStackScreenProps<RootStackParamList, 'ChefAccountStatus'>;

export function ChefAccountStatusScreen({navigation, route}: Props) {
  const dispatch = useAppDispatch();
  const accountResolution = useAppSelector(state => state.auth.accountResolution);
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const resolutionStatus: ChefApplicationStatus | null =
    accountResolution && accountResolution.flow !== 'CUSTOMER'
      ? accountResolution.onboardingStatus
      : null;
  const fallbackStatus = route.params?.status ?? 'PENDING';
  const status = application?.status ?? resolutionStatus ?? fallbackStatus;

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);

    try {
      const current = await profileApi.getChefApplication();

      if (current.status === 'APPROVED') {
        const resolved = await accountResolutionService.resolve('CHEF');
        dispatch(authActions.accountResolved(resolved));
        setApplication(current);
        return;
      }

      dispatch(authActions.chefApplicationStatusObserved(current.status));
      setApplication(current);

      if (current.status === 'NOT_SUBMITTED') {
        navigation.replace('ChefRegistration');
      }
    } catch (cause) {
      setRefreshError(toAppApiError(cause).message);
    } finally {
      setRefreshing(false);
    }
  }, [dispatch, navigation]);

  useEffect(() => {
    refreshStatus().catch(() => undefined);
  }, [refreshStatus]);

  const content =
    status === 'APPROVED'
      ? {
          title: 'Chef account approved',
          body: 'Your backend approval and Chef role are verified. Chef business screens are delivered in later implementation phases.',
        }
      : status === 'REJECTED'
        ? {
            title: 'Chef application needs attention',
            body: 'Your application was not approved. Review the reason, update your information, and resubmit when ready.',
          }
        : status === 'NOT_SUBMITTED'
          ? {
              title: 'Chef application not submitted',
              body: 'Complete your application before Craves can review your Chef access.',
            }
          : {
              title: 'Chef application under review',
              body: 'Your application has been submitted. Chef mode stays locked until the backend grants the CHEF role after approval.',
            };

  const rejectionReason =
    application?.status === 'REJECTED' ? application.rejectionReason : null;

  const logout = async () => {
    await authService.logout();
    dispatch(authActions.signedOut());
  };

  return (
    <AuthShell>
      <View style={styles.top} />
      <AuthCard>
        <View style={styles.icon}>
          <Icon
            name={status === 'APPROVED' ? 'check' : 'chef'}
            size={30}
            color={status === 'APPROVED' ? colors.success : colors.flameRed}
          />
        </View>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.description}>{content.body}</Text>
        {rejectionReason ? (
          <Text style={styles.rejectionReason}>Review note: {rejectionReason}</Text>
        ) : null}
        {refreshError ? <Text style={styles.error}>{refreshError}</Text> : null}
        {status === 'REJECTED' ? (
          <PrimaryButton
            label="Update and resubmit"
            disabled={refreshing}
            onPress={() => navigation.replace('ChefRegistration')}
          />
        ) : null}
        {status === 'NOT_SUBMITTED' ? (
          <PrimaryButton
            label="Start application"
            disabled={refreshing}
            onPress={() => navigation.replace('ChefRegistration')}
          />
        ) : null}
        <PrimaryButton
          variant={status === 'PENDING' || status === 'APPROVED' ? 'primary' : 'outline'}
          label="Refresh status"
          loading={refreshing}
          onPress={refreshStatus}
        />
        <PrimaryButton
          variant="outline"
          label="Sign out"
          disabled={refreshing}
          onPress={logout}
        />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  top: {height: 90},
  icon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0ED',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.espressoBrown,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    color: colors.mutedText,
    marginTop: 8,
    marginBottom: spacing.md,
  },
  rejectionReason: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: colors.error,
    marginBottom: spacing.sm,
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: colors.error,
    marginBottom: spacing.sm,
  },
});
