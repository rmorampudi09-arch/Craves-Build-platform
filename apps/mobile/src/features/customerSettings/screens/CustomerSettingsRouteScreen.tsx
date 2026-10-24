import React from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
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
import {Icon, type IconName} from '../../../shared/components/Icon';
import {IconButton} from '../../../shared/components/IconButton';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CUSTOMER_APP_VERSION} from '../domain/customerSettingsChildModel';
import {useConfirmLogout} from './CustomerSettingsLegacyScreens';

type SettingsNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerSettings'
>;

interface SettingsRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  onPress: () => void;
}

function SettingsRow({icon, title, subtitle, value, onPress}: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={iconSize.md} color={colors.flameRed} surface={false} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : (
        <Icon name="chevron-right" size={iconSize.sm} color={colors.placeholder} surface={false} />
      )}
    </Pressable>
  );
}

export function CustomerSettingsRouteScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const {loggingOut, logout} = useConfirmLogout();

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-settings">
      <View style={styles.root}>
        <View style={styles.header}>
          <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Settings
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.sectionEyebrow}>ACCOUNT</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="shield"
                title="Privacy & security"
                subtitle="Sign out of this device"
                onPress={() => navigation.navigate('CustomerSettingsPrivacySecurity')}
              />
              <SettingsRow
                icon="location"
                title="Saved addresses"
                subtitle="Home, Work and others"
                onPress={() => navigation.navigate('CustomerAddresses')}
              />
              <SettingsRow
                icon="bell"
                title="Notifications"
                subtitle="Order and meal plan alerts"
                onPress={() => navigation.navigate('CustomerSettingsNotifications')}
              />
            </View>

            <Text accessibilityRole="header" style={styles.sectionEyebrow}>SUPPORT & LEGAL</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="headset"
                title="Help & support"
                onPress={() => navigation.navigate('CustomerSettingsSupport')}
              />
              <SettingsRow
                icon="document"
                title="Terms & conditions"
                onPress={() => navigation.navigate('CustomerSettingsLegal', {document: 'terms'})}
              />
              <SettingsRow
                icon="shield"
                title="Privacy policy"
                onPress={() => navigation.navigate('CustomerSettingsLegal', {document: 'privacy'})}
              />
              <SettingsRow
                icon="info"
                title="About Craves"
                value={`Version ${CUSTOMER_APP_VERSION}`}
                onPress={() => navigation.navigate('CustomerSettingsAbout')}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              accessibilityState={{disabled: loggingOut, busy: loggingOut}}
              disabled={loggingOut}
              onPress={logout}
              style={({pressed}) => [styles.logoutButton, pressed && styles.rowPressed]}>
              {loggingOut ? (
                <ActivityIndicator color={colors.flameRedAccessible} />
              ) : (
                <Text style={styles.logoutText}>Log out</Text>
              )}
            </Pressable>
          </View>
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
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  headerTitle: {
    minWidth: 0,
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sectionEyebrow: {
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  card: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    minWidth: 0,
    flex: 1,
  },
  rowTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  rowSubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  rowValue: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  logoutButton: {
    minHeight: touchTarget.comfortable,
    marginTop: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  logoutText: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
});
