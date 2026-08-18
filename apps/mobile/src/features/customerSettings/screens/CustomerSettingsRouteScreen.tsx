import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
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
import {ScreenShell} from '../../../shared/components/ScreenShell';

type SettingsNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerSettings'
>;

interface SettingsRowProps {
  icon: IconName;
  title: string;
  subtitle: string;
  value?: string;
  onPress: () => void;
}

function SettingsRow({icon, title, subtitle, value, onPress}: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={iconSize.md} color={colors.flameRed} surface={false} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Icon
        name="chevron-right"
        size={iconSize.sm}
        color={colors.flameRed}
        surface={false}
      />
    </Pressable>
  );
}

export function CustomerSettingsRouteScreen() {
  const navigation = useNavigation<SettingsNavigation>();

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-settings">
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={spacing.xs}
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.headerButton, pressed && styles.rowPressed]}>
            <Icon
              name="arrow-left"
              size={iconSize.lg}
              color={colors.espressoBrown}
              surface={false}
            />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.headerTitle}>
              Settings
            </Text>
            <Text style={styles.headerSubtitle}>Manage your preferences</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text style={styles.sectionEyebrow}>SECURITY & PRIVACY</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="shield"
                title="Privacy & Security"
                subtitle="Password, biometric login and account security"
                onPress={() => navigation.navigate('CustomerSettingsPrivacySecurity')}
              />
            </View>

            <Text style={styles.sectionEyebrow}>PREFERENCES</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="translate"
                title="Language"
                subtitle="Choose your preferred app language"
                onPress={() => navigation.navigate('CustomerSettingsLanguage')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="location"
                title="Location"
                subtitle="Manage saved addresses and locations"
                onPress={() => navigation.navigate('CustomerAddresses')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="theme"
                title="Appearance"
                subtitle="Choose light, dark or system theme"
                onPress={() => navigation.navigate('CustomerSettingsAppearance')}
              />
            </View>

            <Text style={styles.sectionEyebrow}>SUPPORT & LEGAL</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="headset"
                title="Help & Support"
                subtitle="FAQs, raise a ticket or contact us"
                onPress={() => navigation.navigate('CustomerSettingsSupport')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="document"
                title="Terms & Conditions"
                subtitle="Read our terms and conditions"
                onPress={() => navigation.navigate('CustomerSettingsLegal')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="shield"
                title="Privacy Policy"
                subtitle="Learn how we protect your data"
                onPress={() => navigation.navigate('CustomerSettingsLegal')}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon="info"
                title="About Craves"
                subtitle="Version info and app updates"
                onPress={() => navigation.navigate('CustomerSettingsAbout')}
              />
            </View>
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
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  headerButton: {
    width: touchTarget.comfortable,
    height: touchTarget.comfortable,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  headerCopy: {
    minWidth: 0,
    flex: 1,
  },
  headerTitle: {
    color: colors.espressoBrown,
    fontSize: 32,
    fontWeight: fontWeight.extrabold,
  },
  headerSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
    backgroundColor: colors.white,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sectionEyebrow: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  card: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  row: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  rowCopy: {
    minWidth: 0,
    flex: 1,
  },
  rowTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  rowSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  rowValue: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: borderWidth.standard,
    marginLeft: 80,
    backgroundColor: colors.border,
  },
});
