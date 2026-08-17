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
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {authActions} from '../../auth/state/authSlice';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import type {CustomerProfileHubContract} from '../domain/customerProfileContract';
import {
  CUSTOMER_PROFILE_MENU_ROWS,
  CUSTOMER_PROFILE_REWARDS_UNSUPPORTED_COPY,
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
      accessibilityLabel="Loading customer profile"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonIdentity}>
        <View style={styles.skeletonAvatar} />
        <View style={styles.skeletonCopy}>
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonLineShort} />
        </View>
      </View>
      <View style={styles.skeletonRewards} />
      <View style={styles.skeletonMenu} />
      <View style={styles.skeletonMenu} />
    </View>
  );
}

function ProfileMenuRow({row, disabled = false, onPress}: ProfileMenuRowProps) {
  const logout = row.id === 'logout';
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
      <View style={[styles.menuIcon, logout && styles.menuIconDanger]}>
        <Icon
          name={row.icon}
          size={iconSize.sm}
          color={logout ? colors.error : colors.flameRed}
        />
      </View>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuTitle, logout && styles.menuTitleDanger]}>
          {row.title}
        </Text>
        <Text style={styles.menuSubtitle}>{row.subtitle}</Text>
      </View>
      {logout ? null : (
        <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} />
      )}
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
  const rewardsUnsupported = data.rewards.availability === 'unsupported';

  return (
    <View style={styles.content}>
      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{resolveCustomerProfileInitials(profile)}</Text>
        </View>
        <View style={styles.identityCopy}>
          <Text accessibilityRole="header" style={styles.profileName}>
            {resolveCustomerProfileDisplayName(profile)}
          </Text>
          {profile.email ? <Text style={styles.identityMeta}>{profile.email}</Text> : null}
          <Text style={styles.identityMeta}>{resolveCustomerProfilePhoneLabel(profile)}</Text>
        </View>
        <View style={styles.completenessPill}>
          <Text style={styles.completenessText}>
            {profile.completeness === 'full' ? 'Profile ready' : 'Profile incomplete'}
          </Text>
        </View>
        <Button
          accessibilityHint="Opens customer profile editing"
          label="Edit Profile"
          onPress={onEditProfile}
          variant="outline"
          style={styles.editButton}
        />
      </View>

      <View style={styles.rewardsCard}>
        <View style={styles.rewardsIcon}>
          <Icon name="shield" size={iconSize.lg} color={colors.flameRed} />
        </View>
        <View style={styles.rewardsCopy}>
          <Text style={styles.rewardsEyebrow}>CRAVES REWARDS</Text>
          <Text style={styles.rewardsTitle}>
            {rewardsUnsupported ? 'Rewards currently unavailable' : 'Craves Rewards'}
          </Text>
          {rewardsUnsupported ? (
            <Text style={styles.rewardsDescription}>
              {CUSTOMER_PROFILE_REWARDS_UNSUPPORTED_COPY}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.menuCard}>
        {CUSTOMER_PROFILE_MENU_ROWS.map((row, index) => (
          <React.Fragment key={row.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <ProfileMenuRow
              row={row}
              disabled={
                (loggingOut && row.id === 'logout') ||
                (switchingRole && row.id === 'switch-chef')
              }
              onPress={() => onMenuPress(row)}
            />
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export function CustomerProfileScreen() {
  const navigation = useNavigation<ProfileNavigation>();
  const dispatch = useAppDispatch();
  const identity = useAppSelector(state => state.auth.identity);
  const header = useCustomerHeaderState();
  const profileQuery = useCustomerProfileQuery();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);

  const showContractBlocker = useCallback((title: string, message: string) => {
    Alert.alert(`${title} unavailable`, message, [{text: 'OK'}]);
  }, []);

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
      Alert.alert(
        'Logout could not finish',
        'Please try again. Your private session state was not intentionally retained by this screen.',
      );
    }
  }, [dispatch, loggingOut, switchingRole]);

  const confirmLogout = useCallback(() => {
    Alert.alert('Logout?', 'You will need to sign in again to use your Craves account.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Logout',
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
      Alert.alert(
        'Could not open Chef registration',
        'Please try again. Craves could not safely return to the Chef sign-in flow.',
      );
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
      Alert.alert(
        'Could not switch roles',
        'Customer-private data could not be isolated safely. Please try again before opening the Chef workspace.',
      );
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
      'Switch to Chef?',
      'Craves will leave the Customer workspace and reload your Chef account.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Switch', onPress: performRoleSwitch},
      ],
    );
  }, [identity?.roles, openChefRegistration, performRoleSwitch]);

  const handleMenuPress = useCallback(
    (row: CustomerProfileMenuRowModel) => {
      if (row.action === 'route-favorites') {
        navigation.navigate('CustomerFavorites');
        return;
      }

      if (row.action === 'route-payments') {
        navigation.navigate('CustomerPaymentMethods');
        return;
      }

      if (row.action === 'switch-chef') {
        confirmRoleSwitch();
        return;
      }

      if (row.action === 'logout') {
        confirmLogout();
        return;
      }

      showContractBlocker(
        row.title,
        row.blockerMessage ??
          'This destination is not registered in the approved mobile route contract yet.',
      );
    },
    [confirmLogout, confirmRoleSwitch, navigation, showContractBlocker],
  );

  const retryProfile = useCallback(() => {
    profileQuery.refetch().catch(() => undefined);
  }, [profileQuery]);

  const body = (() => {
    if (profileQuery.sessionRequired) {
      return (
        <TerminalState
          title="Sign in required"
          description="Your customer profile is private and requires an authenticated customer session."
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
            description="No customer profile record was returned for this signed-in account."
            actionLabel="Try again"
            onAction={retryProfile}
          />
        );
      case 'unsupported':
        return (
          <TerminalState
            title="Profile unavailable"
            description="The approved mobile contract cannot provide this profile state yet."
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
                ? 'The profile response did not match the approved mobile contract.'
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
        <CustomerHeader
          onPressLocation={() => setLocationSelectorVisible(true)}
          onPressNotifications={header.refreshNotifications}
        />
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
        <CustomerLocationSelector
          visible={locationSelectorVisible}
          onClose={() => setLocationSelectorVisible(false)}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.white,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
  },
  identityCard: {
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    marginBottom: spacing.sm,
  },
  avatarText: {
    color: colors.flameRed,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  identityCopy: {
    gap: spacing.xxs,
  },
  profileName: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  identityMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  completenessPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  completenessText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  editButton: {
    marginTop: spacing.md,
  },
  rewardsCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.creamDeep,
    backgroundColor: colors.white,
  },
  rewardsIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  rewardsCopy: {
    minWidth: 0,
    flex: 1,
  },
  rewardsEyebrow: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 0.8,
  },
  rewardsTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xxs,
  },
  rewardsDescription: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  menuCard: {
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  menuRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  menuRowDisabled: {
    opacity: 0.55,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  menuIconDanger: {
    backgroundColor: colors.iconSurface,
  },
  menuCopy: {
    minWidth: 0,
    flex: 1,
  },
  menuTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  menuTitleDanger: {
    color: colors.error,
  },
  menuSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  divider: {
    height: borderWidth.standard,
    marginLeft: 68,
    backgroundColor: colors.border,
  },
  skeletonWrap: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
  },
  skeletonIdentity: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.white,
  },
  skeletonAvatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCopy: {
    flex: 1,
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  skeletonLineWide: {
    width: '70%',
    height: 16,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    width: '55%',
    height: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLineShort: {
    width: '42%',
    height: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonRewards: {
    height: 132,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  skeletonMenu: {
    height: 144,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
});
