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
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {authActions} from '../../auth/state/authSlice';
import {completeLogout} from '../../auth/state/logoutCoordinator';
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
      <View style={styles.skeletonIdentity} />
      <View style={styles.skeletonRewards} />
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
      <View style={styles.menuIcon}>
        <Icon
          name={row.icon}
          size={iconSize.md}
          color={logout ? colors.error : colors.flameRed}
          surface={false}
        />
      </View>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuTitle, logout && styles.menuTitleDanger]}>
          {row.title}
        </Text>
        <Text style={styles.menuSubtitle}>{row.subtitle}</Text>
      </View>
      <Icon
        name="chevron-right"
        size={iconSize.sm}
        color={colors.placeholder}
        surface={false}
      />
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
  const profileReady = profile.completeness === 'full';

  return (
    <View style={styles.content}>
      <View style={styles.identityCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile details"
          onPress={onEditProfile}
          style={({pressed}) => [styles.identityTopRow, pressed && styles.rowPressed]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{resolveCustomerProfileInitials(profile)}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.profileName}>
              {resolveCustomerProfileDisplayName(profile)}
            </Text>
            {profile.email ? (
              <Text numberOfLines={1} style={styles.identityMeta}>
                {profile.email}
              </Text>
            ) : null}
            <Text style={styles.identityMeta}>{resolveCustomerProfilePhoneLabel(profile)}</Text>
            <View
              style={[
                styles.completenessPill,
                profileReady ? styles.completenessPillReady : styles.completenessPillPending,
              ]}>
              <Icon
                name={profileReady ? 'check' : 'account'}
                size={14}
                color={profileReady ? colors.successText : colors.textSecondary}
                surface={false}
              />
              <Text
                style={[
                  styles.completenessText,
                  profileReady && styles.completenessTextReady,
                ]}>
                {profileReady ? 'Profile ready' : 'Profile incomplete'}
              </Text>
            </View>
          </View>
          <Icon
            name="chevron-right"
            size={iconSize.md}
            color={colors.flameRed}
            surface={false}
          />
        </Pressable>

        <Pressable
          accessibilityHint="Opens customer profile editing"
          accessibilityLabel="Edit Profile"
          accessibilityRole="button"
          onPress={onEditProfile}
          style={({pressed}) => [styles.editButton, pressed && styles.editButtonPressed]}>
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </Pressable>
      </View>

      <View style={styles.rewardsCard}>
        <View style={styles.rewardsIcon}>
          <Icon name="shield" size={iconSize.lg} color={colors.flameRed} surface={false} />
        </View>
        <View style={styles.rewardsCopy}>
          <Text style={styles.rewardsEyebrow}>CRAVES REWARDS</Text>
          <Text style={styles.rewardsTitle}>
            {rewardsUnsupported ? 'Rewards currently unavailable' : 'Craves Rewards'}
          </Text>
          <Text style={styles.rewardsDescription}>
            {rewardsUnsupported
              ? CUSTOMER_PROFILE_REWARDS_UNSUPPORTED_COPY
              : 'Your available Craves rewards are linked to this account.'}
          </Text>
        </View>
        <Icon
          name="chevron-right"
          size={iconSize.sm}
          color={colors.flameRed}
          surface={false}
        />
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
      switch (row.action) {
        case 'route-favorites':
          navigation.navigate('CustomerFavorites');
          return;
        case 'route-payments':
          navigation.navigate('CustomerPaymentMethods');
          return;
        case 'route-membership':
          navigation.navigate('CustomerSettingsSubscription');
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
        <View style={styles.topHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Location: ${header.locationDisplayName}`}
            onPress={() => setLocationSelectorVisible(true)}
            style={({pressed}) => [styles.locationButton, pressed && styles.rowPressed]}>
            <View style={styles.locationIcon}>
              <Icon name="location" size={22} color={colors.flameRed} surface={false} />
            </View>
            <View style={styles.locationCopy}>
              <Text style={styles.locationEyebrow}>Delivering to</Text>
              <View style={styles.locationValueRow}>
                <Text numberOfLines={1} style={styles.locationValue}>
                  {header.locationDisplayName}
                </Text>
                <View style={styles.locationChevron}>
                  <Icon
                    name="chevron-right"
                    size={14}
                    color={colors.espressoBrown}
                    surface={false}
                  />
                </View>
              </View>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => navigation.navigate('CustomerSettings')}
            style={({pressed}) => [styles.headerAction, pressed && styles.rowPressed]}>
            <Icon name="settings" size={28} color={colors.espressoBrown} surface={false} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              header.badgeLabel
                ? `Notifications, ${header.badgeLabel} unread`
                : 'Notifications'
            }
            onPress={header.openNotifications}
            style={({pressed}) => [styles.headerAction, pressed && styles.rowPressed]}>
            <Icon name="bell" size={28} color={colors.espressoBrown} surface={false} />
            {header.badgeLabel ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{header.badgeLabel}</Text>
              </View>
            ) : null}
          </Pressable>
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
  topHeader: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  locationButton: {
    minWidth: 0,
    flex: 1,
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorSoft,
  },
  locationCopy: {minWidth: 0, flex: 1},
  locationEyebrow: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  locationValueRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  locationValue: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  locationChevron: {transform: [{rotate: '90deg'}]},
  headerAction: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: 3,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    borderWidth: 2,
    borderColor: colors.white,
  },
  notificationBadgeText: {
    color: colors.white,
    fontSize: 8,
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
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  identityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorSoft,
  },
  avatarText: {
    color: colors.flameRed,
    fontSize: 32,
    fontWeight: fontWeight.extrabold,
  },
  identityCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xxs,
  },
  profileName: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  identityMeta: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  completenessPill: {
    alignSelf: 'flex-start',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  completenessPillReady: {backgroundColor: colors.successSoft},
  completenessPillPending: {backgroundColor: colors.surfaceMuted},
  completenessText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  completenessTextReady: {color: colors.successText},
  editButton: {
    minHeight: touchTarget.comfortable,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.flameRed,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  editButtonPressed: {backgroundColor: colors.errorSoft},
  editButtonText: {
    color: colors.flameRed,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  rewardsCard: {
    minHeight: 128,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
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
  rewardsCopy: {minWidth: 0, flex: 1},
  rewardsEyebrow: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1,
  },
  rewardsTitle: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  rewardsDescription: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  menuCard: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  menuRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
    backgroundColor: colors.iconSurface,
  },
  menuCopy: {minWidth: 0, flex: 1},
  menuTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  menuTitleDanger: {color: colors.espressoBrown},
  menuSubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  divider: {
    height: borderWidth.standard,
    marginLeft: 72,
    backgroundColor: colors.border,
  },
  rowPressed: {opacity: 0.72},
  skeletonWrap: {gap: spacing.md},
  skeletonIdentity: {
    height: 224,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonRewards: {
    height: 128,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonMenu: {
    height: 420,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
