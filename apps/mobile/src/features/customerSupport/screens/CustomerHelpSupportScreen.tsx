import React, {useState} from 'react';
import {Linking, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {CustomerProfileStackParamList, CustomerTabParamList} from '../../../app/navigation/types';
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
import {
  CUSTOMER_SUPPORT_CASES_AVAILABLE,
} from '../api/customerSupportCasesApi';
import {CustomerSupportCasesSection} from '../components/CustomerSupportCasesSection';
import {
  CRAVES_SUPPORT_EMAIL,
  CRAVES_SUPPORT_PHONE,
  CRAVES_SUPPORT_PHONE_LABEL,
  SUPPORT_COMMON_QUESTIONS,
  type SupportQuestionDestination,
} from '../domain/supportContact';

type SupportNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerSettingsSupport'
>;

type GlyphName = React.ComponentProps<typeof MaterialDesignIcons>['name'];

interface ContactTileProps {
  glyph: GlyphName;
  label: string;
  hint: string;
  filled?: boolean;
  onPress: () => void;
  testID: string;
}

function ContactTile({glyph, label, hint, filled = false, onPress, testID}: ContactTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [styles.tile, filled ? styles.tileFilled : styles.tileOutlined, pressed && styles.pressed]}>
      <View style={styles.tileIcon}>
        <MaterialDesignIcons name={glyph} size={iconSize.md} color={filled ? colors.white : colors.flameRed} />
      </View>
      <Text style={[styles.tileLabel, filled && styles.tileLabelFilled]}>{label}</Text>
    </Pressable>
  );
}

/** Help & support: chat, call or email Craves, and shortcuts for the common questions. */
export function CustomerHelpSupportScreen() {
  const navigation = useNavigation<SupportNavigation>();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [supportCaseCreateRequest, setSupportCaseCreateRequest] = useState(0);

  const openLink = async (url: string, failure: string) => {
    setSupportMessage(null);
    try {
      await Linking.openURL(url);
    } catch {
      setSupportMessage(failure);
    }
  };
  const callSupport = () =>
    openLink(`tel:${CRAVES_SUPPORT_PHONE}`, `Calling could not start. Call ${CRAVES_SUPPORT_PHONE_LABEL} from your phone app.`);
  const emailSupport = () =>
    openLink(`mailto:${CRAVES_SUPPORT_EMAIL}?subject=Craves%20support`, `Email could not be opened. Contact ${CRAVES_SUPPORT_EMAIL} from your email app.`);

  const openQuestion = (destination: SupportQuestionDestination) => {
    if (destination === 'orders') {
      navigation
        .getParent<BottomTabNavigationProp<CustomerTabParamList>>()
        ?.navigate('Orders', {screen: 'CustomerOrdersRoot'});
    } else if (destination === 'mealPlanHelp') {
      navigation.navigate('CustomerSettingsSubscription', {screen: 'MealPlanHowItWorks'});
    } else if (destination === 'addresses') {
      navigation.navigate('CustomerAddresses');
    } else {
      navigation.navigate('CustomerSupportChat');
    }
  };

  return (
    <ScreenShell
      backgroundColor={colors.white}
      edges={['top']}
      keyboardAvoiding={false}
      testID="customer-help-support-empty-cart">
      <ScrollView
        {...bottomNavScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.titleBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={spacing.xxs}
              onPress={() => navigation.goBack()}
              style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
              <Icon name="arrow-left" size={iconSize.md} color={colors.flameRed} surface={false} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>Help & support</Text>
          </View>
          <Text style={styles.subtitle}>How would you like to reach Craves?</Text>

          <View style={styles.tiles}>
            <ContactTile
              filled
              glyph="message-outline"
              label="Chat"
              hint="Chat with the Craves assistant about orders, payments, refunds or your account"
              onPress={() => navigation.navigate('CustomerSupportChat')}
              testID="support-start-chat"
            />
            <ContactTile
              glyph="phone-outline"
              label="Call"
              hint={`Calls Craves support on ${CRAVES_SUPPORT_PHONE_LABEL}`}
              onPress={() => { callSupport().catch(() => undefined); }}
              testID="support-call"
            />
            <ContactTile
              glyph="email-outline"
              label="Email"
              hint={`Emails ${CRAVES_SUPPORT_EMAIL}`}
              onPress={() => { emailSupport().catch(() => undefined); }}
              testID="support-email"
            />
          </View>
          <Text style={styles.contactNote}>
            Chat replies in seconds. Call {CRAVES_SUPPORT_PHONE_LABEL}. Email {CRAVES_SUPPORT_EMAIL}.
          </Text>
          {supportMessage ? <Text accessibilityLiveRegion="assertive" style={styles.supportMessage}>{supportMessage}</Text> : null}

          <Text accessibilityRole="header" style={styles.sectionTitle}>Common questions</Text>
          <View style={styles.listCard}>
            {SUPPORT_COMMON_QUESTIONS.map((question, index) => (
              <Pressable
                key={question.label}
                accessibilityRole="button"
                accessibilityLabel={question.label}
                onPress={() => openQuestion(question.destination)}
                style={({pressed}) => [styles.questionRow, index > 0 && styles.rowDivider, pressed && styles.rowPressed]}>
                <Text style={styles.questionText}>{question.label}</Text>
                <Icon name="chevron-right" size={iconSize.sm} color={colors.placeholder} surface={false} />
              </Pressable>
            ))}
            {CUSTOMER_SUPPORT_CASES_AVAILABLE ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open a support case"
                accessibilityHint="Open a case and continue the conversation with Craves Support"
                onPress={() => setSupportCaseCreateRequest(current => current + 1)}
                testID="support-create-case"
                style={({pressed}) => [styles.questionRow, styles.rowDivider, pressed && styles.rowPressed]}>
                <Text style={styles.questionText}>Open a support case</Text>
                <Icon name="chevron-right" size={iconSize.sm} color={colors.placeholder} surface={false} />
              </Pressable>
            ) : null}
          </View>

          <CustomerSupportCasesSection
            createRequestToken={supportCaseCreateRequest}
          />
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  pressed: {opacity: 0.82},
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.xxxl,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  tiles: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    height: 112,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tileFilled: {backgroundColor: colors.flameRedAccessible},
  tileOutlined: {
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  tileLabelFilled: {color: colors.white},
  contactNote: {
    marginTop: 10,
    marginHorizontal: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  supportMessage: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.xxs,
    color: colors.error,
    fontSize: typography.small,
  },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  listCard: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  questionRow: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  rowDivider: {
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.surfaceMuted,
  },
  rowPressed: {backgroundColor: colors.surfaceMuted},
  questionText: {
    flex: 1,
    minWidth: 0,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
});
