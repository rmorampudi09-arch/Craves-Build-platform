import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {
  ChefProfileStackParamList,
  ChefTabParamList,
} from '../../../app/navigation/types';
import {useAppDispatch} from '../../../app/store/hooks';
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
import {Icon, type IconName} from '../../../shared/components/Icon';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import type {ChefKitchenProfile, ChefKitchenStatus} from '../api/chefProfileApi';
import {useChefEditProfileDraft} from '../state/ChefEditProfileDraftProvider';
import {switchChefToCustomerRole} from '../state/chefProfileRoleSwitch';
import {useChefProfileModel} from '../state/useChefProfileModel';

type ProfileNavigation = NativeStackNavigationProp<
  ChefProfileStackParamList,
  'ChefProfileHome'
>;
type ChefTabsNavigation = BottomTabNavigationProp<ChefTabParamList>;

type BlockedDestination =
  | 'business-information'
  | 'payouts'
  | 'subscription'
  | 'preferences'
  | 'security'
  | 'support';

interface AccountRowModel {
  id: BlockedDestination;
  title: string;
  subtitle: string;
  icon: IconName;
  blockerMessage: string;
}

const BUSINESS_ROWS: readonly AccountRowModel[] = [
  {
    id: 'business-information',
    title: 'Business information',
    subtitle: 'Verification, documents, kitchen details and business status',
    icon: 'chef',
    blockerMessage:
      'Business information is available in the dedicated Chef business flow.',
  },
  {
    id: 'payouts',
    title: 'Payouts',
    subtitle: 'Settlement history and payout details',
    icon: 'analytics',
    blockerMessage:
      'Payout history requires the dedicated Chef payout route and payout-read contract before it can open safely.',
  },
  {
    id: 'subscription',
    title: 'Subscription plan',
    subtitle: 'Plan, billing and benefits',
    icon: 'ticket',
    blockerMessage:
      'No approved Chef-facing subscription summary route is registered in the current mobile contract.',
  },
];

const SETTINGS_ROWS: readonly AccountRowModel[] = [
  {
    id: 'preferences',
    title: 'App preferences',
    subtitle: 'Notifications and Chef workspace preferences',
    icon: 'bell',
    blockerMessage:
      'Chef app preferences have a dedicated screen that is not registered in the current mobile route yet.',
  },
  {
    id: 'security',
    title: 'Security',
    subtitle: 'Account and sign-in security',
    icon: 'lock',
    blockerMessage:
      'A Chef-specific security destination is not present in the approved mobile route contract yet.',
  },
  {
    id: 'support',
    title: 'Help & support',
    subtitle: 'Get help with your Chef account',
    icon: 'phone',
    blockerMessage:
      'A Chef-specific support destination is not present in the approved mobile route contract yet.',
  },
];

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

function kitchenStatusLabel(status: ChefKitchenStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Kitchen active';
    case 'DRAFT':
      return 'Kitchen setup in progress';
    case 'INACTIVE':
      return 'Kitchen inactive';
    case 'SUSPENDED':
      return 'Kitchen suspended';
  }
}

function kitchenStatusTone(status: ChefKitchenStatus) {
  if (status === 'ACTIVE') {
    return {backgroundColor: colors.successSoft, color: colors.success};
  }
  if (status === 'SUSPENDED') {
    return {backgroundColor: colors.errorSoft, color: colors.error};
  }
  return {backgroundColor: colors.warningSoft, color: colors.warning};
}

function profileDisplayName(
  kitchen: ChefKitchenProfile | null,
  identityDisplayName: string | null | undefined,
): string {
  const identityName = identityDisplayName?.trim();
  return kitchen?.displayName ?? kitchen?.kitchenName ?? (identityName || 'Chef account');
}

function ProfileSkeleton() {
  return (
    <View
      accessibilityLabel="Loading Chef profile"
      accessibilityRole="progressbar"
      style={styles.skeletonCard}>
      <View style={styles.skeletonIdentity}>
        <View style={styles.skeletonAvatar} />
        <View style={styles.skeletonCopy}>
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonLine} />
        </View>
      </View>
      <View style={styles.skeletonMetricRow}>
        <View style={styles.skeletonMetric} />
        <View style={styles.skeletonMetric} />
        <View style={styles.skeletonMetric} />
      </View>
    </View>
  );
}

function MetricTile({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </>
  );

  if (!onPress) {
    return <View style={styles.metricTile}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={`Open ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.metricTile, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

function AccountRow({row, onPress}: {row: AccountRowModel; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={row.title}
      accessibilityHint={row.subtitle}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.accountRow, pressed && styles.pressed]}>
      <View style={styles.rowIcon}>
        <Icon name={row.icon} size={iconSize.sm} color={colors.flameRed} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
      </View>
      <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} />
    </Pressable>
  );
}

function Section({
  title,
  rows,
  onRowPress,
}: {
  title: string;
  rows: readonly AccountRowModel[];
  onRowPress: (row: AccountRowModel) => void;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>
        {rows.map((row, index) => (
          <React.Fragment key={row.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <AccountRow row={row} onPress={() => onRowPress(row)} />
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export function ChefProfileScreen() {
  const navigation = useNavigation<ProfileNavigation>();
  const dispatch = useAppDispatch();
  const model = useChefProfileModel();
  const editDraft = useChefEditProfileDraft();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [switchingRole, setSwitchingRole] = React.useState(false);

  const identity = model.identity;
  const kitchen = model.kitchen;
  const displayName = profileDisplayName(kitchen, identity?.displayName);
  const contact =
    kitchen?.email ??
    identity?.email ??
    kitchen?.phoneNumber ??
    identity?.phoneNumber ??
    null;
  const chefAccessApproved =
    model.accountResolution?.flow === 'CHEF' &&
    model.accountResolution.onboardingStatus === 'APPROVED';
  const accountSuspended = identity?.status === 'SUSPENDED';
  const operationalIssue = accountSuspended || kitchen?.status === 'SUSPENDED';

  const ordersValue =
    model.dashboard.sources.orders === 'success'
      ? String(model.dashboard.data.orders.activeOrders)
      : '—';
  const menuValue =
    model.dashboard.sources.menu === 'success'
      ? String(model.dashboard.data.menu.sellableItems)
      : '—';
  const noticesValue =
    model.dashboard.sources.notifications === 'success'
      ? String(model.dashboard.data.notifications.unread)
      : '—';

  const showBlocker = React.useCallback((title: string, message: string) => {
    Alert.alert(`${title} unavailable`, message, [{text: 'OK'}]);
  }, []);

  const openChefTab = React.useCallback(
    (tab: 'Orders' | 'Menu') => {
      const tabs = navigation.getParent<ChefTabsNavigation>();
      if (!tabs) {
        showBlocker(
          tab,
          `The Chef ${tab} tab is not available from the current navigation parent.`,
        );
        return;
      }
      tabs.navigate(tab);
    },
    [navigation, showBlocker],
  );

  const handleBlockedRow = React.useCallback(
    (row: AccountRowModel) => {
      if (row.id === 'business-information') {
        navigation.navigate('ChefBusinessInformation');
        return;
      }
      showBlocker(row.title, row.blockerMessage);
    },
    [navigation, showBlocker],
  );

  const handleEditProfile = React.useCallback(() => {
    if (!kitchen) {
      showBlocker(
        'Edit profile',
        'Chef kitchen details must finish loading before the profile editor can preserve a safe canonical draft.',
      );
      return;
    }
    editDraft.begin(kitchen);
    navigation.navigate('ChefEditProfile');
  }, [editDraft, kitchen, navigation, showBlocker]);

  const performLogout = React.useCallback(async () => {
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
        'Please try again. Craves did not intentionally keep this screen active with a partial logout.',
      );
    }
  }, [dispatch, loggingOut, switchingRole]);

  const confirmLogout = React.useCallback(() => {
    Alert.alert(
      'Logout?',
      'You will need to sign in again to use your Craves account.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Logout', style: 'destructive', onPress: performLogout},
      ],
    );
  }, [performLogout]);

  const performRoleSwitch = React.useCallback(async () => {
    if (switchingRole || loggingOut) {
      return;
    }
    setSwitchingRole(true);
    try {
      await switchChefToCustomerRole(dispatch);
    } catch {
      setSwitchingRole(false);
      Alert.alert(
        'Could not switch roles',
        'Chef-private data could not be isolated safely. Please try again before opening the Customer workspace.',
      );
    }
  }, [dispatch, loggingOut, switchingRole]);

  const confirmRoleSwitch = React.useCallback(() => {
    if (!identity?.roles.includes('CUSTOMER')) {
      showBlocker(
        'Switch to customer',
        'This signed-in identity does not currently have the Customer role.',
      );
      return;
    }
    Alert.alert(
      'Switch to Customer?',
      'Craves will leave the Chef workspace and reload your Customer account.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Switch', onPress: performRoleSwitch},
      ],
    );
  }, [identity?.roles, performRoleSwitch, showBlocker]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title="Profile" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={model.isRefreshing}
            tintColor={colors.flameRed}
            colors={[colors.flameRed]}
            onRefresh={() => {
              model.refresh().catch(() => undefined);
            }}
          />
        }
        showsVerticalScrollIndicator={false}>
        {model.kitchenStatus === 'pending' && !kitchen ? <ProfileSkeleton /> : null}

        <View style={styles.identityCard}>
          <View style={styles.identityTopRow}>
            <View accessibilityLabel={`${displayName} profile avatar`} style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(displayName)}</Text>
            </View>
            <View style={styles.identityCopy}>
              <View style={styles.nameRow}>
                <Text accessibilityRole="header" style={styles.profileName}>
                  {displayName}
                </Text>
                {chefAccessApproved && !accountSuspended ? (
                  <View style={styles.approvedBadge}>
                    <Icon name="check" size={12} color={colors.success} />
                    <Text style={styles.approvedBadgeText}>Chef approved</Text>
                  </View>
                ) : null}
              </View>
              {contact ? <Text style={styles.identityMeta}>{contact}</Text> : null}
              <Text style={styles.identityMeta}>
                {kitchen
                  ? `${kitchen.city}, ${kitchen.state}`
                  : 'Business details load independently'}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityLabel="Edit Chef profile"
            accessibilityHint="Opens the Chef-specific edit profile flow"
            accessibilityRole="button"
            onPress={handleEditProfile}
            style={({pressed}) => [styles.editButton, pressed && styles.pressed]}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </Pressable>
        </View>

        {operationalIssue ? (
          <View accessibilityRole="alert" style={styles.issueCard}>
            <Icon name="shield" size={iconSize.lg} color={colors.error} />
            <View style={styles.issueCopy}>
              <Text style={styles.issueTitle}>Chef operations need attention</Text>
              <Text style={styles.issueText}>
                {accountSuspended
                  ? 'This Craves identity is suspended. Chef operations may be unavailable.'
                  : 'This kitchen is suspended. Review the business status before accepting new work.'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.metricsCard}>
          <View style={styles.sectionHeadingRow}>
            <View>
              <Text style={[styles.sectionTitleInline, styles.metricsCardTitle]}>
                Live summary
              </Text>
              <Text style={[styles.sectionCaption, styles.metricsCardCaption]}>
                Synchronized with Chef workspace data
              </Text>
            </View>
            {model.dashboard.isRefreshing ? (
              <ActivityIndicator color={colors.flameRed} size="small" />
            ) : null}
          </View>
          <View style={styles.metricsRow}>
            <MetricTile
              label="Active orders"
              value={ordersValue}
              onPress={() => openChefTab('Orders')}
            />
            <MetricTile
              label="Sellable dishes"
              value={menuValue}
              onPress={() => openChefTab('Menu')}
            />
            <MetricTile label="Unread alerts" value={noticesValue} />
          </View>
        </View>

        <View style={styles.businessStatusCard}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.businessHeadingCopy}>
              <Text style={styles.sectionTitleInline}>Business status</Text>
              <Text style={styles.sectionCaption}>
                Authoritative kitchen status from your Chef profile
              </Text>
            </View>
            {kitchen ? (
              <View
                style={[
                  styles.statusPill,
                  {backgroundColor: kitchenStatusTone(kitchen.status).backgroundColor},
                ]}>
                <Text
                  style={[
                    styles.statusText,
                    {color: kitchenStatusTone(kitchen.status).color},
                  ]}>
                  {kitchenStatusLabel(kitchen.status)}
                </Text>
              </View>
            ) : null}
          </View>

          {model.kitchenStatus === 'error' && !kitchen ? (
            <View style={styles.businessError}>
              <Text style={styles.businessErrorTitle}>Kitchen details unavailable</Text>
              <Text style={styles.businessErrorText}>
                Your signed-in Chef identity is still available, but business details could not be loaded.
              </Text>
              <Pressable
                accessibilityLabel="Retry Chef business status"
                accessibilityRole="button"
                onPress={() => {
                  model.refresh().catch(() => undefined);
                }}
                style={({pressed}) => [styles.retryButton, pressed && styles.pressed]}>
                <Text style={styles.retryButtonText}>Try again</Text>
              </Pressable>
            </View>
          ) : kitchen ? (
            <View style={styles.businessDetails}>
              <View style={styles.businessDetailRow}>
                <Text style={styles.businessDetailLabel}>Kitchen</Text>
                <Text style={styles.businessDetailValue}>{kitchen.kitchenName}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.businessDetailRow}>
                <Text style={styles.businessDetailLabel}>Verification</Text>
                <Text style={styles.businessDetailMuted}>
                  Open Business information for the verification record
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.businessLoadingRow}>
              <ActivityIndicator color={colors.flameRed} size="small" />
              <Text style={styles.businessErrorText}>Loading business status…</Text>
            </View>
          )}
        </View>

        <Section title="Business" rows={BUSINESS_ROWS} onRowPress={handleBlockedRow} />
        <Section
          title="Settings & support"
          rows={SETTINGS_ROWS}
          onRowPress={handleBlockedRow}
        />

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <Pressable
              accessibilityLabel="Switch to Customer"
              accessibilityHint="Leaves the Chef workspace and opens the Customer account"
              accessibilityRole="button"
              accessibilityState={{disabled: switchingRole || loggingOut}}
              disabled={switchingRole || loggingOut}
              onPress={confirmRoleSwitch}
              style={({pressed}) => [
                styles.accountRow,
                pressed && styles.pressed,
                (switchingRole || loggingOut) && styles.disabled,
              ]}>
              <View style={styles.rowIcon}>
                <Icon name="account" size={iconSize.sm} color={colors.flameRed} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>
                  {switchingRole ? 'Switching…' : 'Switch to Customer'}
                </Text>
                <Text style={styles.rowSubtitle}>Use Craves as a customer</Text>
              </View>
              {switchingRole ? (
                <ActivityIndicator color={colors.flameRed} size="small" />
              ) : (
                <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} />
              )}
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              accessibilityLabel="Logout"
              accessibilityHint="Signs out and clears private session data"
              accessibilityRole="button"
              accessibilityState={{disabled: loggingOut || switchingRole}}
              disabled={loggingOut || switchingRole}
              onPress={confirmLogout}
              style={({pressed}) => [
                styles.accountRow,
                pressed && styles.pressed,
                (loggingOut || switchingRole) && styles.disabled,
              ]}>
              <View style={[styles.rowIcon, styles.rowIconDanger]}>
                <Icon name="lock" size={iconSize.sm} color={colors.error} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, styles.logoutText]}>
                  {loggingOut ? 'Logging out…' : 'Logout'}
                </Text>
                <Text style={styles.rowSubtitle}>Sign out of this device</Text>
              </View>
              {loggingOut ? <ActivityIndicator color={colors.error} size="small" /> : null}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceWarm},
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  identityCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    padding: spacing.md,
    ...elevation.card,
  },
  identityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarmStrong,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
  },
  avatarText: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  identityCopy: {flex: 1, minWidth: 0},
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  profileName: {
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
    flexShrink: 1,
  },
  approvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  approvedBadgeText: {
    color: colors.success,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  identityMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  editButton: {
    minHeight: touchTarget.minimum,
    marginTop: spacing.md,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  editButtonText: {
    color: colors.flameRed,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  issueCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
  issueCopy: {flex: 1},
  issueTitle: {
    color: colors.error,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  issueText: {
    marginTop: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.small,
  },
  metricsCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.espressoBrown,
    padding: spacing.md,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitleInline: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  metricsCardTitle: {color: colors.white},
  metricsCardCaption: {color: colors.creamDeep},
  metricsRow: {flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md},
  metricTile: {
    flex: 1,
    minHeight: 86,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  metricValue: {
    color: colors.flameRed,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  metricLabel: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'center',
  },
  businessStatusCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  businessHeadingCopy: {flex: 1},
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: '46%',
  },
  statusText: {
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  businessDetails: {marginTop: spacing.sm},
  businessDetailRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  businessDetailLabel: {
    width: 84,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  businessDetailValue: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  businessDetailMuted: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  businessError: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  businessErrorTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  businessErrorText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    marginTop: spacing.sm,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  retryButtonText: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  businessLoadingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionWrap: {gap: spacing.xs},
  sectionTitle: {
    marginLeft: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  accountRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  rowIconDanger: {backgroundColor: colors.errorSoft},
  rowCopy: {flex: 1, minWidth: 0},
  rowTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  rowSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  logoutText: {color: colors.error},
  divider: {
    height: borderWidth.standard,
    backgroundColor: colors.border,
    marginLeft: 66,
  },
  pressed: {opacity: 0.62},
  disabled: {opacity: 0.45},
  skeletonCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
    gap: spacing.md,
  },
  skeletonIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skeletonAvatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCopy: {flex: 1, gap: spacing.xs},
  skeletonLineWide: {
    height: 18,
    width: '72%',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    height: 12,
    width: '52%',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonMetricRow: {flexDirection: 'row', gap: spacing.xs},
  skeletonMetric: {
    flex: 1,
    height: 78,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});