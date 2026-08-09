import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
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
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import {customerSupportIntegrationBoundary} from '../domain/customerSupportCapabilityModel';

type SupportNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerSettingsSupport'
>;

interface ContractUnavailableCardProps {
  title: string;
  detail: string;
}

function ContractUnavailableCard({title, detail}: ContractUnavailableCardProps) {
  return (
    <View style={styles.unavailableCard} accessibilityRole="summary">
      <View style={styles.unavailableIcon}>
        <Icon name="shield" size={iconSize.sm} color={colors.textSecondary} />
      </View>
      <View style={styles.unavailableCopy}>
        <Text style={styles.unavailableTitle}>{title}</Text>
        <Text style={styles.unavailableDetail}>{detail}</Text>
      </View>
    </View>
  );
}

interface DisabledSupportActionProps {
  icon: IconName;
  title: string;
  detail: string;
}

function DisabledSupportAction({icon, title, detail}: DisabledSupportActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      accessibilityState={{disabled: true}}
      disabled
      style={styles.supportAction}>
      <View style={styles.actionIcon}>
        <Icon name={icon} size={iconSize.sm} color={colors.textSecondary} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} />
    </Pressable>
  );
}

/** P76 / Guide Reference 35: Help & Support — Empty Cart reference state. */
export function CustomerHelpSupportScreen() {
  const navigation = useNavigation<SupportNavigation>();
  const header = useCustomerHeaderState();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);

  const configuration = customerSupportIntegrationBoundary.supportConfiguration;
  const helpContent = customerSupportIntegrationBoundary.helpContent;
  const availability = customerSupportIntegrationBoundary.supportAvailability;
  const chat = customerSupportIntegrationBoundary.chatSession;
  const ticket = customerSupportIntegrationBoundary.supportTicket;

  return (
    <ScreenShell
      backgroundColor={colors.surfaceWarm}
      edges={['top']}
      keyboardAvoiding={false}
      testID="customer-help-support-empty-cart">
      <View style={styles.root}>
        <CustomerHeader
          variant="compact"
          onPressLocation={() => setLocationSelectorVisible(true)}
          onPressNotifications={header.openNotifications}
        />

        <View style={styles.titleBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={spacing.xs}
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-left" size={iconSize.md} color={colors.espressoBrown} />
          </Pressable>
          <View style={styles.titleCopy}>
            <Text style={styles.title}>Help & Support</Text>
            <Text style={styles.subtitle}>How can we help?</Text>
          </View>
        </View>

        <ScrollView
          {...bottomNavScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.immediateHelpCard}>
              <View style={styles.immediateHelpIcon}>
                <Icon name="phone" size={iconSize.lg} color={colors.flameRed} />
              </View>
              <View style={styles.immediateHelpCopy}>
                <Text style={styles.cardEyebrow}>IMMEDIATE HELP</Text>
                <Text style={styles.immediateHelpTitle}>Need help now?</Text>
                <Text style={styles.immediateHelpDetail}>
                  {availability.reason}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call Us"
                accessibilityHint={configuration.reason}
                accessibilityState={{disabled: true}}
                disabled
                style={styles.callButton}>
                <Text style={styles.callButtonText}>Call Us</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Quick Help</Text>
            <ContractUnavailableCard
              title="Help categories unavailable"
              detail={helpContent.reason}
            />

            <Text style={styles.sectionTitle}>Popular Help Topics</Text>
            <ContractUnavailableCard
              title="Help articles unavailable"
              detail={helpContent.reason}
            />

            <Text style={styles.sectionTitle}>Contact Support</Text>
            <View style={styles.actionsCard}>
              <DisabledSupportAction
                icon="phone"
                title="Call Us"
                detail={configuration.reason}
              />
              <View style={styles.divider} />
              <DisabledSupportAction
                icon="mail"
                title="Email Us"
                detail={configuration.reason}
              />
              <View style={styles.divider} />
              <DisabledSupportAction
                icon="account"
                title="Start Chat"
                detail={chat.reason}
              />
              <View style={styles.divider} />
              <DisabledSupportAction
                icon="orders"
                title="Create Support Ticket"
                detail={ticket.reason}
              />
            </View>

            <View style={styles.reassuranceBanner}>
              <Icon name="shield" size={iconSize.sm} color={colors.espressoBrown} />
              <Text style={styles.reassuranceText}>
                Support requests stay disabled until verified support configuration and contracts are available. No request is simulated locally.
              </Text>
            </View>

            <Text style={styles.referenceNote}>
              This is the P76 empty-cart reference state. The shared cart overlay remains hidden when the established cart item count is zero.
            </Text>
          </View>
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
    backgroundColor: colors.surfaceWarm,
  },
  titleBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderTopWidth: borderWidth.standard,
    borderBottomWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCopy: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  immediateHelpCard: {
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
  immediateHelpIcon: {
    width: touchTarget.comfortable,
    height: touchTarget.comfortable,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  immediateHelpCopy: {
    minWidth: 0,
    flex: 1,
  },
  cardEyebrow: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 0.8,
  },
  immediateHelpTitle: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  immediateHelpDetail: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 17,
  },
  callButton: {
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  callButtonText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  unavailableCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  unavailableIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  unavailableCopy: {
    minWidth: 0,
    flex: 1,
  },
  unavailableTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  unavailableDetail: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 17,
  },
  actionsCard: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  supportAction: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    opacity: 0.78,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  actionCopy: {
    minWidth: 0,
    flex: 1,
  },
  actionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  actionDetail: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 17,
  },
  divider: {
    height: borderWidth.standard,
    marginLeft: 68,
    backgroundColor: colors.border,
  },
  reassuranceBanner: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
  },
  reassuranceText: {
    minWidth: 0,
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.small,
    lineHeight: 20,
  },
  referenceNote: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
  },
});
