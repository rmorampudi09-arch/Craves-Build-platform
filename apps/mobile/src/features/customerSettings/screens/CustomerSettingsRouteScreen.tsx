import React, {useCallback, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {
  CustomerProfileStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
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
import {Icon, type IconName} from '../../../shared/components/Icon';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {selectCartItemCount} from '../../cart/state/cartSelectors';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import {
  resolveCustomerProfileDisplayName,
  resolveCustomerProfileInitials,
  resolveCustomerProfilePhoneLabel,
} from '../../customerProfile/presentation/customerProfileUiModel';
import {useCustomerProfileQuery} from '../../customerProfile/query/customerProfileQueries';

type SettingsNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerSettings'
>;
type CustomerTabsNavigation = BottomTabNavigationProp<CustomerTabParamList>;

interface SettingsRowProps {
  icon: IconName;
  title: string;
  subtitle: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
}

function SettingsRow({icon, title, subtitle, value, destructive = false, onPress}: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      disabled={!onPress}
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && onPress ? styles.rowPressed : null]}>
      <View style={[styles.rowIcon, destructive && styles.rowIconDanger]}>
        <Icon
          name={icon}
          size={iconSize.sm}
          color={destructive ? colors.error : colors.flameRed}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, destructive && styles.dangerText]}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} /> : null}
    </Pressable>
  );
}

export function CustomerSettingsRouteScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const dispatch = useAppDispatch();
  const itemCount = useAppSelector(selectCartItemCount);
  const profileQuery = useCustomerProfileQuery();
  const header = useCustomerHeaderState();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const hideBottomTabBar = useCallback(() => {
    const tabs = navigation.getParent<CustomerTabsNavigation>();
    tabs?.setOptions({tabBarStyle: {display: 'none'}});
    return () => tabs?.setOptions({tabBarStyle: undefined});
  }, [navigation]);
  useFocusEffect(hideBottomTabBar);

  const profile =
    profileQuery.contractState.status === 'ready'
      ? profileQuery.contractState.data.profile
      : null;

  const handleLogout = useCallback(() => {
    if (loggingOut) {
      return;
    }
    Alert.alert('Logout?', 'You will need to sign in again to use your Craves account.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await completeLogout(dispatch);
          } catch {
            setLoggingOut(false);
            Alert.alert('Logout could not finish', 'Please try again.');
          }
        },
      },
    ]);
  }, [dispatch, loggingOut]);

  const openCart = useCallback(() => navigation.navigate('CustomerCart'), [navigation]);

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-settings">
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={spacing.xs}
            onPress={() => navigation.goBack()}
            style={styles.headerButton}>
            <Icon name="arrow-left" size={iconSize.md} color={colors.espressoBrown} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSubtitle}>Account & preferences</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={header.badgeLabel ? `Notifications, ${header.badgeLabel} unread` : 'Notifications'}
            onPress={header.openNotifications}
            style={styles.headerButton}>
            <Icon name="bell" size={iconSize.md} color={colors.espressoBrown} />
            {header.badgeLabel ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{header.badgeLabel}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={itemCount > 0 ? `Cart, ${itemCount} items` : 'Cart, empty'}
            onPress={openCart}
            style={styles.headerButton}>
            <Text style={styles.cartGlyph}>🛍️</Text>
            {itemCount > 0 ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text style={styles.sectionEyebrow}>ACCOUNT</Text>
            <View style={styles.accountCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile ? resolveCustomerProfileInitials(profile) : 'C'}</Text>
              </View>
              <View style={styles.accountCopy}>
                <Text style={styles.accountName}>{profile ? resolveCustomerProfileDisplayName(profile) : 'Craves customer'}</Text>
                <Text style={styles.accountMeta}>{profile?.email ?? 'Email unavailable'}</Text>
                <Text style={styles.accountMeta}>{profile ? resolveCustomerProfilePhoneLabel(profile) : 'Phone unavailable'}</Text>
                <Text style={styles.accountMeta}>{header.locationDisplayName}</Text>
              </View>
            </View>

            <Text style={styles.sectionEyebrow}>ACCOUNT SETTINGS</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="shield"
                title="Privacy & Security"
                subtitle="Password and current-session controls"
                onPress={() => navigation.navigate('CustomerSettingsPrivacySecurity')}
              />
            </View>

            <Text style={styles.sectionEyebrow}>PREFERENCES</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="mail"
                title="Language"
                subtitle="App-wide language preference"
                onPress={() => navigation.navigate('CustomerSettingsLanguage')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="location"
                title="Location"
                subtitle="Choose from your established saved locations"
                value={header.locationDisplayName}
                onPress={() => setLocationSelectorVisible(true)}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="bell"
                title="Notifications"
                subtitle="Push, email and SMS preferences"
                onPress={() => navigation.navigate('CustomerSettingsNotifications')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="eye"
                title="Appearance"
                subtitle="System, light or dark theme"
                onPress={() => navigation.navigate('CustomerSettingsAppearance')}
              />
            </View>

            <Text style={styles.sectionEyebrow}>SHARE & MEMBERSHIP</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="mail"
                title="Share Craves"
                subtitle="Open the native share sheet"
                onPress={() => navigation.navigate('CustomerSettingsShare')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="account"
                title="Referral"
                subtitle="Invite and reward status"
                onPress={() => navigation.navigate('CustomerSettingsReferral')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="orders"
                title="Membership"
                subtitle="Subscription and benefits"
                onPress={() => navigation.navigate('CustomerSettingsSubscription')}
              />
            </View>

            <Text style={styles.sectionEyebrow}>SUPPORT & INFO</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="mail"
                title="Get Support"
                subtitle="Help and contact destination"
                onPress={() => navigation.navigate('CustomerSettingsSupport')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="shield"
                title="Legal"
                subtitle="Terms & Conditions and Privacy Policy"
                onPress={() => navigation.navigate('CustomerSettingsLegal')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="account"
                title="About Craves"
                subtitle="Application information"
                onPress={() => navigation.navigate('CustomerSettingsAbout')}
              />
            </View>

            <Text style={styles.sectionEyebrow}>SESSION</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="lock"
                title={loggingOut ? 'Logging out…' : 'Logout'}
                subtitle="Sign out of this device"
                destructive
                onPress={loggingOut ? undefined : handleLogout}
              />
            </View>

            <Text style={styles.phaseNote}>
              P75 routes are registered. Actions without an approved production contract are capability-gated inside their child screen rather than simulated locally.
            </Text>
          </View>
        </ScrollView>

        <CustomerLocationSelector visible={locationSelectorVisible} onClose={() => setLocationSelectorVisible(false)} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.surfaceWarm},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  headerButton: {width: touchTarget.minimum, height: touchTarget.minimum, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center'},
  headerTitleWrap: {minWidth: 0, flex: 1},
  headerTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  headerSubtitle: {color: colors.textSecondary, fontSize: typography.tiny},
  cartGlyph: {fontSize: 20},
  headerBadge: {position: 'absolute', top: 1, right: 0, minWidth: 18, height: 18, paddingHorizontal: 3, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.flameRed, borderWidth: 2, borderColor: colors.white},
  headerBadgeText: {color: colors.white, fontSize: 9, fontWeight: fontWeight.bold},
  scrollContent: {flexGrow: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.lg},
  content: {width: '100%', maxWidth: 640, alignSelf: 'center'},
  sectionEyebrow: {marginTop: spacing.md, marginBottom: spacing.xs, color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.extrabold, letterSpacing: 0.8},
  accountCard: {flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, ...elevation.card},
  avatar: {width: 58, height: 58, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.creamDeep},
  avatarText: {color: colors.flameRed, fontSize: typography.heading, fontWeight: fontWeight.extrabold},
  accountCopy: {minWidth: 0, flex: 1, gap: spacing.xxs},
  accountName: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  accountMeta: {color: colors.textSecondary, fontSize: typography.small},
  card: {overflow: 'hidden', borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  row: {minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
  rowPressed: {backgroundColor: colors.surfaceMuted},
  rowIcon: {width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceWarm},
  rowIconDanger: {backgroundColor: colors.surfaceMuted},
  rowCopy: {minWidth: 0, flex: 1},
  rowTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.semibold},
  rowSubtitle: {marginTop: 2, color: colors.textSecondary, fontSize: typography.tiny},
  rowValue: {maxWidth: '28%', color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  dangerText: {color: colors.error},
  divider: {height: borderWidth.standard, marginLeft: 66, backgroundColor: colors.border},
  phaseNote: {marginTop: spacing.md, marginBottom: spacing.xxl, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 18},
});
