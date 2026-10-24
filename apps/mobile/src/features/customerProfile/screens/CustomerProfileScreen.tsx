import React, {useCallback, useState} from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {IconButton} from '../../../shared/components/IconButton';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {authActions} from '../../auth/state/authSlice';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {CustomerBellButton} from '../../notifications/components/CustomerBellButton';
import type {CustomerProfileHubContract} from '../domain/customerProfileContract';
import {
  CUSTOMER_PROFILE_MENU_ROWS,
  resolveCustomerProfileDisplayName,
  resolveCustomerProfileInitials,
  resolveCustomerProfilePhoneLabel,
  type CustomerProfileMenuRowModel,
} from '../presentation/customerProfileUiModel';
import {useCustomerProfileQuery} from '../query/customerProfileQueries';
import {switchCustomerToChefRole} from '../state/customerProfileRoleSwitch';

type ProfileNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerProfileRoot'
>;

interface ProfileMenuRowProps {
  row: CustomerProfileMenuRowModel;
  disabled?: boolean;
  onPress: () => void;
}

function ProfileSkeleton() {
  return (
    <View
      accessibilityLabel="Loading your profile"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonIdentity} />
      <View style={styles.skeletonMenu} />
    </View>
  );
}

function ProfileMenuRow({row, disabled = false, onPress}: ProfileMenuRowProps) {
  return (
    <Pressable
      accessibilityLabel={row.title}
      accessibilityHint={row.subtitle}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.menuRow,
        pressed && !disabled && styles.menuRowPressed,
        disabled && styles.menuRowDisabled,
      ]}>
      <View style={styles.menuIcon}>
        <Icon name={row.icon} size={iconSize.md} color={colors.flameRed} surface={false} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle}>{row.title}</Text>
        <Text style={styles.menuSubtitle}>{row.subtitle}</Text>
      </View>
      <Icon name="chevron-right" size={iconSize.sm} color={colors.placeholder} surface={false} />
    </Pressable>
  );
}

function ProfileReadyContent({
  data,
  loggingOut,
  switchingRole,
  onEditProfile,
  onMenuPress,
}: {
  data: CustomerProfileHubContract;
  loggingOut: boolean;
  switchingRole: boolean;
  onEditProfile: () => void;
  onMenuPress: (row: CustomerProfileMenuRowModel) => void;
}) {
  const profile = data.profile;
  const name = resolveCustomerProfileDisplayName(profile);

  return (
    <View style={styles.content}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}. Edit profile`}
        onPress={onEditProfile}
        style={({pressed}) => [styles.identityCard, pressed && styles.rowPressed]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{resolveCustomerProfileInitials(profile)}</Text>
        </View>
        <View style={styles.identityCopy}>
          <Text numberOfLines={1} style={styles.profileName}>
            {name}
          </Text>
          {profile.email ? (
            <Text numberOfLines={1} style={styles.identityMeta}>
              {profile.email}
            </Text>
          ) : null}
          <Text style={styles.identityMeta}>{resolveCustomerProfilePhoneLabel(profile)}</Text>
        </View>
        <Text style={styles.editText}>Edit</Text>
      </Pressable>

      <View style={styles.menuCard}>
        {CUSTOMER_PROFILE_MENU_ROWS.map(row => (
          <ProfileMenuRow
            key={row.id}
            row={row}
            disabled={
              (loggingOut && row.id === 'logout') ||
              (switchingRole && row.id === 'switch-chef')
            }
            onPress={() => onMenuPress(row)}
          />
        ))}
      </View>
    </View>
  );
}

export function CustomerProfileScreen() {
  const navigation = useNavigation<ProfileNavigation>();
  const dispatch = useAppDispatch();
  const identity = useAppSelector(state => state.auth.identity);
  const profileQuery = useCustomerProfileQuery();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [loggingOut, setLoggingOut] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);

  const handleEditProfile = useCallback(() => {
    navigation.navigate('CustomerProfileEdit');
  }, [navigation]);

  const performLogout = useCallback(async () => {
    if (loggingOut || switchingRole) {
      return;
    }
    setLoggingOut(true);
    try {
      await completeLogout(dispatch);
    } catch {
      setLoggingOut(false);
      Alert.alert('Could not log out', 'Please try again.');
    }
  }, [dispatch, loggingOut, switchingRole]);

  const confirmLogout = useCallback(() => {
    Alert.alert('Log out?', 'You will need to sign in again to use your Craves account.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Log out',
        style: 'destructive',
        onPress: performLogout,
      },
    ]);
  }, [performLogout]);

  const openChefRegistration = useCallback(async () => {
    if (loggingOut || switchingRole) {
      return;
    }
    setSwitchingRole(true);
    try {
      await completeLogout(dispatch);
      dispatch(authActions.roleSelected('CHEF'));
    } catch {
      setSwitchingRole(false);
      Alert.alert('Could not open Chef registration', 'Please try again.');
    }
  }, [dispatch, loggingOut, switchingRole]);

  const performRoleSwitch = useCallback(async () => {
    if (switchingRole || loggingOut) {
      return;
    }
    setSwitchingRole(true);
    try {
      await switchCustomerToChefRole(dispatch);
    } catch {
      setSwitchingRole(false);
      Alert.alert('Could not switch to Chef mode', 'Please try again.');
    }
  }, [dispatch, loggingOut, switchingRole]);

  const confirmRoleSwitch = useCallback(() => {
    if (!identity?.roles.includes('CHEF')) {
      Alert.alert(
        'Not registered as Chef',
        "You're not registered as a chef. Want to register?",
        [
          {text: 'Back', style: 'cancel'},
          {text: 'Register', onPress: openChefRegistration},
        ],
      );
      return;
    }

    Alert.alert(
      'Switch to Chef mode?',
      "You'll see your kitchen, orders and earnings. You can switch back any time from Profile.",
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Switch', onPress: performRoleSwitch},
      ],
    );
  }, [identity?.roles, openChefRegistration, performRoleSwitch]);

  const handleMenuPress = useCallback(
    (row: CustomerProfileMenuRowModel) => {
      switch (row.action) {
        case 'route-favorites':
          navigation.navigate('CustomerFavorites');
          return;
        case 'route-meal-plans':
          navigation.navigate('CustomerSettingsSubscription');
          return;
        case 'route-payments':
          navigation.navigate('CustomerPaymentMethods');
          return;
        case 'route-referral':
          navigation.navigate('CustomerSettingsReferral');
          return;
        case 'route-support':
          navigation.navigate('CustomerSettingsSupport');
          return;
        case 'switch-chef':
          confirmRoleSwitch();
          return;
        case 'logout':
          confirmLogout();
      }
    },
    [confirmLogout, confirmRoleSwitch, navigation],
  );

  const retryProfile = useCallback(() => {
    profileQuery.refetch().catch(() => undefined);
  }, [profileQuery]);

  const body = (() => {
    if (profileQuery.sessionRequired) {
      return (
        <TerminalState
          title="Sign in required"
          description="Sign in to see your profile."
        />
      );
    }

    switch (profileQuery.contractState.status) {
      case 'loading':
        return <ProfileSkeleton />;
      case 'ready':
        return (
          <ProfileReadyContent
            data={profileQuery.contractState.data}
            loggingOut={loggingOut}
            switchingRole={switchingRole}
            onEditProfile={handleEditProfile}
            onMenuPress={handleMenuPress}
          />
        );
      case 'empty':
        return (
          <TerminalState
            title="Profile not available"
            description="We could not find a profile for this account. Please try again."
            actionLabel="Try again"
            onAction={retryProfile}
          />
        );
      case 'unsupported':
        return (
          <TerminalState
            title="Profile unavailable"
            description="We could not show your profile right now. Please try again."
            actionLabel="Try again"
            onAction={retryProfile}
          />
        );
      case 'error':
        return (
          <TerminalState
            title="Profile could not be loaded"
            description={
              profileQuery.contractState.error.code === 'invalid-response'
                ? 'Something went wrong while loading your profile. Please try again.'
                : 'Check your connection and try loading your profile again.'
            }
            actionLabel="Try again"
            onAction={retryProfile}
          />
        );
    }
  })();

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-profile">
      <View style={styles.root}>
        <View style={styles.topHeader}>
          <Text accessibilityRole="header" style={styles.title}>
            Profile
          </Text>
          <IconButton
            accessibilityLabel="Settings"
            icon="settings"
            onPress={() => navigation.navigate('CustomerSettings')}
          />
          <CustomerBellButton />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={bottomNavScroll.onScroll}
          refreshControl={
            profileQuery.sessionRequired ? undefined : (
              <RefreshControl
                colors={[colors.flameRed]}
                onRefresh={retryProfile}
                refreshing={profileQuery.isRefetching}
                tintColor={colors.flameRed}
              />
            )
          }
          scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  topHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  title: {
    minWidth: 0,
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.title,
    fontWeight: fontWeight.bold,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 120,
    backgroundColor: colors.white,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  avatarText: {
    color: colors.flameRedAccessible,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  identityCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  identityMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  editText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  menuCard: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  menuRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuRowPressed: {backgroundColor: colors.surfaceMuted},
  menuRowDisabled: {opacity: 0.5},
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCopy: {minWidth: 0, flex: 1},
  menuTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  menuSubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  rowPressed: {opacity: 0.72},
  skeletonWrap: {gap: spacing.md},
  skeletonIdentity: {
    height: 100,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonMenu: {
    height: 480,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
