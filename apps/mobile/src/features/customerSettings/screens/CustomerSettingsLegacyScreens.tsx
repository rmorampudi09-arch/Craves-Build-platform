import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
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
import {IconButton} from '../../../shared/components/IconButton';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {firebaseAuth} from '../../auth/firebase/firebaseAuth';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {CustomerReferralScreen} from '../../referralsV2/screens/CustomerReferralScreens';
import {LEGAL_DOCUMENTS} from '../content/legalText';
import {
  CUSTOMER_APP_VERSION,
  CUSTOMER_SETTINGS_CAPABILITY_STATUS,
  hasPasswordChangeErrors,
  validatePasswordChange,
} from '../domain/customerSettingsChildModel';

type SettingsNavigation = NativeStackNavigationProp<CustomerProfileStackParamList>;

interface ChildScaffoldProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** Asks first, then signs this phone out. Shared by Settings and Privacy & security. */
export function useConfirmLogout() {
  const dispatch = useAppDispatch();
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = useCallback(() => {
    if (loggingOut) {
      return;
    }
    Alert.alert('Log out?', 'You will need to sign in again to use Craves on this phone.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await completeLogout(dispatch);
          } catch {
            setLoggingOut(false);
            Alert.alert('Could not log out', 'Please try again.');
          }
        },
      },
    ]);
  }, [dispatch, loggingOut]);
  return {loggingOut, logout};
}

// These routes are immersive (navigationPolicy), so the bottom menu hides itself; never set tabBarStyle here.
function ChildScaffold({title, subtitle, children}: ChildScaffoldProps) {
  const navigation = useNavigation<SettingsNavigation>();
  return (
    <ScreenShell
      backgroundColor={colors.white}
      edges={['top']}
      keyboardAvoiding={false}
      testID={`customer-settings-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      {/* Edge-to-edge Android no longer shrinks the window for the keyboard, so the screen makes room itself. */}
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <View style={styles.header}>
          <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {title}
          </Text>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

function Notice({title, body}: {title: string; body: string}) {
  return (
    <View style={styles.notice} accessibilityRole="text">
      <Icon name="info" size={iconSize.sm} color={colors.flameRed} />
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
          <Icon name="chevron-right" size={iconSize.sm} color={colors.placeholder} surface={false} />
        ) : null)}
    </Pressable>
  );
}

function ComingSoonOption({label}: {label: string}) {
  return (
    <ActionRow
      title={label}
      subtitle="Coming soon"
      trailing={<Switch disabled value={false} accessibilityLabel={`${label}, coming soon`} />}
    />
  );
}

export function CustomerSettingsNotificationsScreen() {
  return (
    <ChildScaffold title="Notifications" subtitle="Order and meal plan alerts">
      <Notice
        title="Choosing your alerts is coming soon"
        body="Updates about your orders show under Notifications in the app. Soon you can pick how else we reach you."
      />
      <View style={styles.card}>
        <ComingSoonOption label="Push notifications" />
        <View style={styles.divider} />
        <ComingSoonOption label="Email" />
        <View style={styles.divider} />
        <ComingSoonOption label="SMS" />
      </View>
    </ChildScaffold>
  );
}

export function CustomerSettingsPrivacySecurityScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const {loggingOut, logout} = useConfirmLogout();

  return (
    <ChildScaffold title="Privacy & security" subtitle="Password and sign-out">
      <View style={styles.card}>
        <ActionRow
          title="Change password"
          subtitle="Only for accounts that sign in with email and password"
          onPress={() => navigation.navigate('CustomerSettingsChangePassword')}
        />
        <View style={styles.divider} />
        <ActionRow
          title={loggingOut ? 'Logging out…' : 'Log out of this device'}
          subtitle="You will need to sign in again on this phone"
          destructive
          onPress={loggingOut ? undefined : logout}
          trailing={loggingOut ? <ActivityIndicator color={colors.flameRed} /> : undefined}
        />
      </View>
      {CUSTOMER_SETTINGS_CAPABILITY_STATUS.deviceSessions === 'contract-unavailable' ? (
        <Notice
          title="Other devices"
          body="Logging out your other phones from here is coming soon."
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
      Alert.alert('Password changed', 'Your new password is saved.', [
        {text: 'Done', onPress: () => navigation.goBack()},
      ]);
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'PASSWORD_CHANGE_REQUIRES_EMAIL_SESSION'
          ? 'You can change a password only when you sign in with email and password.'
          : 'We could not change your password. Check your current password and try again.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }, [currentPassword, navigation, newPassword, submitting, validation]);

  return (
    <ChildScaffold title="Change password" subtitle="Choose a new password">
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
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Update password</Text>
          )}
        </Pressable>
      </View>
    </ChildScaffold>
  );
}

// Settings no longer links Language or Appearance (user decision); these stay for restored routes.
export function CustomerSettingsLanguageScreen() {
  return (
    <ChildScaffold title="Language">
      <Notice title="More languages are coming soon" body="Craves is in English for now." />
    </ChildScaffold>
  );
}

export function CustomerSettingsAppearanceScreen() {
  return (
    <ChildScaffold title="Appearance">
      <Notice title="Dark mode is coming soon" body="Craves uses the light theme for now." />
    </ChildScaffold>
  );
}

export function CustomerSettingsAboutScreen() {
  return (
    <ChildScaffold title="About Craves">
      <View style={styles.aboutCard}>
        <Text style={styles.aboutBrand}>Craves</Text>
        <Text style={styles.aboutBody}>Homemade food from trusted home chefs.</Text>
        <Text style={styles.aboutVersion}>{`Version ${CUSTOMER_APP_VERSION}`}</Text>
      </View>
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
      Alert.alert('Could not open sharing', 'Please try again.');
    } finally {
      setSharing(false);
    }
  }, [sharing]);
  return (
    <ChildScaffold title="Share Craves" subtitle="Tell your friends about Craves">
      <View style={styles.card}>
        <ActionRow
          title={sharing ? 'Opening…' : 'Share Craves'}
          subtitle="Share through apps on your phone"
          onPress={sharing ? undefined : share}
          trailing={sharing ? <ActivityIndicator color={colors.flameRed} /> : undefined}
        />
      </View>
    </ChildScaffold>
  );
}

export function CustomerSettingsReferralScreen() {
  return <CustomerReferralScreen />;
}

export function CustomerSettingsLegalScreen() {
  const route = useRoute<RouteProp<CustomerProfileStackParamList, 'CustomerSettingsLegal'>>();
  const legal = LEGAL_DOCUMENTS[route.params?.document ?? 'terms'];
  return (
    <ChildScaffold title={legal.title}>
      <Text style={styles.legalIntro}>{legal.intro}</Text>
      {legal.sections.map(section => (
        <View key={section.heading} style={styles.legalSection}>
          <Text accessibilityRole="header" style={styles.legalHeading}>
            {section.heading}
          </Text>
          {section.body ? <Text style={styles.legalBody}>{section.body}</Text> : null}
          {section.bullets?.map(item => (
            <Text key={item} style={styles.legalBody}>{`•  ${item}`}</Text>
          ))}
        </View>
      ))}
    </ChildScaffold>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  headerTitle: {minWidth: 0, flex: 1, color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.bold},
  headerSubtitle: {color: colors.textSecondary, fontSize: typography.small},
  scrollContent: {flexGrow: 1, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xxl},
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
  rowSubtitle: {marginTop: 3, color: colors.textSecondary, fontSize: typography.small},
  divider: {height: borderWidth.standard, marginLeft: spacing.md, backgroundColor: colors.border},
  dangerText: {color: colors.flameRedAccessible},
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
  aboutBrand: {color: colors.espressoBrown, fontSize: typography.title, fontWeight: fontWeight.extrabold},
  aboutBody: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
  aboutVersion: {marginTop: spacing.sm, color: colors.textSecondary, fontSize: typography.small},
  legalIntro: {color: colors.textSecondary, fontSize: typography.small, lineHeight: 22},
  legalSection: {gap: spacing.xxs},
  legalHeading: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  legalBody: {color: colors.textPrimary, fontSize: typography.small, lineHeight: 22},
});
