import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {
  CustomerProfileStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {useAppDispatch} from '../../../app/store/hooks';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {firebaseAuth} from '../../auth/firebase/firebaseAuth';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {
  CUSTOMER_SETTINGS_CAPABILITY_STATUS,
  hasPasswordChangeErrors,
  validatePasswordChange,
} from '../domain/customerSettingsChildModel';

type SettingsNavigation = NativeStackNavigationProp<CustomerProfileStackParamList>;
type CustomerTabsNavigation = BottomTabNavigationProp<CustomerTabParamList>;

interface ChildScaffoldProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function useHideCustomerBottomTabs(navigation: SettingsNavigation) {
  const hideBottomTabs = useCallback(() => {
    const tabs = navigation.getParent<CustomerTabsNavigation>();
    tabs?.setOptions({tabBarStyle: {display: 'none'}});
    return () => tabs?.setOptions({tabBarStyle: undefined});
  }, [navigation]);
  useFocusEffect(hideBottomTabs);
}

function ChildScaffold({title, subtitle, children}: ChildScaffoldProps) {
  const navigation = useNavigation<SettingsNavigation>();
  useHideCustomerBottomTabs(navigation);

  return (
    <ScreenShell edges={['top']} keyboardAvoiding testID={`customer-settings-${title.toLowerCase().replace(/\s+/g, '-')}`}>
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
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
          </View>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>{children}</View>
        </ScrollView>
      </View>
    </ScreenShell>
  );
}

interface CapabilityNoticeProps {
  title: string;
  body: string;
}

function CapabilityNotice({title, body}: CapabilityNoticeProps) {
  return (
    <View style={styles.notice} accessibilityRole="text">
      <Icon name="shield" size={iconSize.sm} color={colors.flameRed} />
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
    </View>
  );
}

interface ActionRowProps {
  title: string;
  subtitle: string;
  onPress?: () => void;
  destructive?: boolean;
  trailing?: React.ReactNode;
}

function ActionRow({title, subtitle, onPress, destructive, trailing}: ActionRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      disabled={!onPress}
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && onPress ? styles.rowPressed : null]}>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, destructive ? styles.dangerText : null]}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {trailing ??
        (onPress ? (
          <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} />
        ) : null)}
    </Pressable>
  );
}

function DisabledOption({label, detail}: {label: string; detail: string}) {
  return (
    <ActionRow
      title={label}
      subtitle={detail}
      trailing={<Switch disabled value={false} accessibilityLabel={`${label} unavailable`} />}
    />
  );
}

export function CustomerSettingsNotificationsScreen() {
  return (
    <ChildScaffold title="Notification Preferences" subtitle="Channel-level delivery settings">
      <CapabilityNotice
        title="Preference service contract unavailable"
        body="The current Notification Service exposes the inbox but no authenticated customer preference read/write endpoint. P75 therefore does not create local-only toggles that could disagree with delivery subscriptions."
      />
      <View style={styles.card}>
        <DisabledOption label="Push notifications" detail="Requires backend subscription preference contract" />
        <View style={styles.divider} />
        <DisabledOption label="Email notifications" detail="Requires backend channel preference contract" />
        <View style={styles.divider} />
        <DisabledOption label="SMS notifications" detail="Requires backend channel preference contract" />
      </View>
    </ChildScaffold>
  );
}

export function CustomerSettingsPrivacySecurityScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const dispatch = useAppDispatch();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = useCallback(() => {
    if (loggingOut) {
      return;
    }
    Alert.alert('Sign out of this device?', 'Your secure session will be revoked and local private state cleared.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await completeLogout(dispatch);
          } catch {
            setLoggingOut(false);
            Alert.alert('Could not sign out', 'Please try again.');
          }
        },
      },
    ]);
  }, [dispatch, loggingOut]);

  return (
    <ChildScaffold title="Privacy & Security" subtitle="Password and session controls">
      <View style={styles.card}>
        <ActionRow
          title="Change password"
          subtitle="Re-authenticate before updating your Firebase credential"
          onPress={() => navigation.navigate('CustomerSettingsChangePassword')}
        />
        <View style={styles.divider} />
        <ActionRow
          title={loggingOut ? 'Signing out…' : 'Sign out this device'}
          subtitle="Uses the existing Craves logout/revoke coordinator"
          destructive
          onPress={loggingOut ? undefined : logout}
          trailing={loggingOut ? <ActivityIndicator /> : undefined}
        />
      </View>
      {CUSTOMER_SETTINGS_CAPABILITY_STATUS.deviceSessions === 'contract-unavailable' ? (
        <CapabilityNotice
          title="Other sessions are not exposed"
          body="The current auth contract has no list/revoke-other-devices API. P75 keeps that action unavailable rather than fabricating device rows."
        />
      ) : null}
    </ChildScaffold>
  );
}

export function CustomerSettingsChangePasswordScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const validation = useMemo(
    () => validatePasswordChange({currentPassword, newPassword, confirmPassword}),
    [confirmPassword, currentPassword, newPassword],
  );

  const submit = useCallback(async () => {
    if (submitting || hasPasswordChangeErrors(validation)) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await firebaseAuth.changePassword(currentPassword, newPassword);
      Alert.alert('Password changed', 'Your password was updated securely.', [
        {text: 'Done', onPress: () => navigation.goBack()},
      ]);
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'PASSWORD_CHANGE_REQUIRES_EMAIL_SESSION'
          ? 'Password changes are available only for an active email/password session.'
          : 'We could not change your password. Check your current password and try again.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }, [currentPassword, navigation, newPassword, submitting, validation]);

  return (
    <ChildScaffold title="Change Password" subtitle="Secure credential update">
      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>Current password</Text>
        <TextInput
          accessibilityLabel="Current password"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          style={styles.input}
        />
        {validation.currentPassword ? <Text style={styles.fieldError}>{validation.currentPassword}</Text> : null}

        <Text style={styles.fieldLabel}>New password</Text>
        <TextInput
          accessibilityLabel="New password"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          style={styles.input}
        />
        {validation.newPassword ? <Text style={styles.fieldError}>{validation.newPassword}</Text> : null}

        <Text style={styles.fieldLabel}>Confirm new password</Text>
        <TextInput
          accessibilityLabel="Confirm new password"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          style={styles.input}
        />
        {validation.confirmPassword ? <Text style={styles.fieldError}>{validation.confirmPassword}</Text> : null}
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Update password"
          disabled={submitting || hasPasswordChangeErrors(validation)}
          onPress={submit}
          style={({pressed}) => [
            styles.primaryButton,
            (submitting || hasPasswordChangeErrors(validation)) && styles.primaryButtonDisabled,
            pressed ? styles.primaryButtonPressed : null,
          ]}>
          {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Update password</Text>}
        </Pressable>
      </View>
    </ChildScaffold>
  );
}

export function CustomerSettingsLanguageScreen() {
  return (
    <ChildScaffold title="Language" subtitle="App language">
      <CapabilityNotice
        title="App-wide localization runtime unavailable"
        body="This branch does not yet contain an approved i18n provider or server preference contract. P75 does not persist a selector that cannot update the entire app safely."
      />
      <View style={styles.card}>
        <ActionRow title="English" subtitle="Pending approved localization preference layer" />
        <View style={styles.divider} />
        <ActionRow title="Hindi" subtitle="Pending approved localization preference layer" />
      </View>
    </ChildScaffold>
  );
}

export function CustomerSettingsAppearanceScreen() {
  return (
    <ChildScaffold title="Appearance" subtitle="Theme preference">
      <CapabilityNotice
        title="Shared theme provider unavailable"
        body="The current mobile design tokens are static and no app-wide theme preference layer is registered. P75 leaves theme choices disabled instead of applying an isolated screen-only switch."
      />
      <View style={styles.card}>
        <ActionRow title="System" subtitle="Requires shared theme provider" />
        <View style={styles.divider} />
        <ActionRow title="Light" subtitle="Requires shared theme provider" />
        <View style={styles.divider} />
        <ActionRow title="Dark" subtitle="Requires shared theme provider" />
      </View>
    </ChildScaffold>
  );
}

export function CustomerSettingsAboutScreen() {
  return (
    <ChildScaffold title="About Craves" subtitle="Application information">
      <View style={styles.aboutCard}>
        <Text style={styles.aboutBrand}>Craves</Text>
        <Text style={styles.aboutBody}>Homemade food from trusted home chefs.</Text>
      </View>
      <CapabilityNotice
        title="Runtime build metadata not exposed"
        body="The current native runtime does not expose an approved app-version/build metadata adapter, so P75 does not hardcode a release version."
      />
    </ChildScaffold>
  );
}

export function CustomerSettingsShareScreen() {
  const [sharing, setSharing] = useState(false);
  const share = useCallback(async () => {
    if (sharing) {
      return;
    }
    setSharing(true);
    try {
      await Share.share({message: 'Craves — homemade food from trusted home chefs.'});
    } catch {
      Alert.alert('Could not open share sheet', 'Please try again.');
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  return (
    <ChildScaffold title="Share Craves" subtitle="Use the native share sheet">
      <View style={styles.card}>
        <ActionRow
          title={sharing ? 'Opening share sheet…' : 'Share Craves'}
          subtitle="Share through apps installed on this device"
          onPress={sharing ? undefined : share}
          trailing={sharing ? <ActivityIndicator /> : undefined}
        />
      </View>
    </ChildScaffold>
  );
}

export function CustomerSettingsReferralScreen() {
  return (
    <ChildScaffold title="Referral" subtitle="Invite and reward status">
      <CapabilityNotice
        title="Referral contract unavailable"
        body="No authenticated referral code, eligibility, reward, or redemption API is present in the approved runtime contract. No referral code is fabricated."
      />
    </ChildScaffold>
  );
}

export function CustomerSettingsSupportScreen() {
  return (
    <ChildScaffold title="Support" subtitle="Help and contact">
      <CapabilityNotice
        title="Support destination is phase-gated"
        body="No trusted customer support content/contact contract is registered yet. The full Help & Support experience remains owned by its later phase, so P75 does not pre-implement it."
      />
    </ChildScaffold>
  );
}

export function CustomerSettingsSubscriptionScreen() {
  return (
    <ChildScaffold title="Membership" subtitle="Subscription and benefits">
      <CapabilityNotice
        title="Customer membership contract unavailable"
        body="The mobile branch has no approved customer plan-list, entitlement, or plan-change client contract. Pricing and benefits are not hardcoded."
      />
    </ChildScaffold>
  );
}

export function CustomerSettingsLegalScreen() {
  return (
    <ChildScaffold title="Legal" subtitle="Terms and privacy">
      <CapabilityNotice
        title="Trusted legal-content destination unavailable"
        body="No approved Terms or Privacy URL/content endpoint is present in the mobile runtime configuration. P75 does not open guessed external links."
      />
      <View style={styles.card}>
        <ActionRow title="Terms & Conditions" subtitle="Awaiting approved content destination" />
        <View style={styles.divider} />
        <ActionRow title="Privacy Policy" subtitle="Awaiting approved content destination" />
      </View>
    </ChildScaffold>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.surfaceWarm},
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {minWidth: 0, flex: 1},
  headerTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  headerSubtitle: {marginTop: 2, color: colors.textSecondary, fontSize: typography.tiny},
  scrollContent: {flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xxl},
  content: {width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.md},
  card: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  row: {minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
  rowPressed: {backgroundColor: colors.surfaceMuted},
  rowCopy: {minWidth: 0, flex: 1},
  rowTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.semibold},
  rowSubtitle: {marginTop: 3, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 18},
  divider: {height: borderWidth.standard, marginLeft: spacing.md, backgroundColor: colors.border},
  dangerText: {color: colors.error},
  notice: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  noticeCopy: {minWidth: 0, flex: 1},
  noticeTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  noticeBody: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small, lineHeight: 20},
  formCard: {gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  fieldLabel: {marginTop: spacing.xs, color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  input: {minHeight: touchTarget.minimum, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, color: colors.espressoBrown, fontSize: typography.body},
  fieldError: {color: colors.error, fontSize: typography.tiny},
  formError: {marginTop: spacing.sm, color: colors.error, fontSize: typography.small, lineHeight: 20},
  primaryButton: {minHeight: touchTarget.minimum, marginTop: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.flameRed},
  primaryButtonDisabled: {opacity: 0.45},
  primaryButtonPressed: {opacity: 0.8},
  primaryButtonText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.bold},
  aboutCard: {padding: spacing.xl, alignItems: 'center', borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  aboutBrand: {color: colors.espressoBrown, fontSize: typography.display, fontWeight: fontWeight.extrabold},
  aboutBody: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
});
