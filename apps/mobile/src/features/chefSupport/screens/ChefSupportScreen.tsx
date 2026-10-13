import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {colors, fontWeight, spacing, textDefaults, typography} from '../../../design/tokens';
import type {IconName} from '../../../shared/components/Icon';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useChefRead} from '../../chefProfile/state/useChefRead';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefTopBar,
  ListGroup,
  ListRow,
  SectionHeader,
  StatusChip,
} from '../../chefShell/components/ui';
import {chefSupportCasesApi} from '../api/chefSupportCasesApi';
import {ticketNumber, ticketStatus, ticketSubtitle} from '../domain/supportPresentation';
import {useSupportCall} from '../state/useSupportCall';

export const SUPPORT_TOPICS: readonly {title: string; icon: IconName}[] = [
  {title: 'Problem with an order', icon: 'orders'},
  {title: 'Payout not received', icon: 'wallet'},
  {title: 'Delivery partner issue', icon: 'delivery'},
  {title: 'Update a document', icon: 'document'},
];

/** Help & support: call or chat with Craves, start a chat on a common topic, and the chef's own tickets. */
export function ChefSupportScreen() {
  const navigation = useNavigation<NavigationProp<ChefProductStackParamList>>();
  const support = useSupportCall("We couldn't get our phone number just now. You can chat with us instead.");
  const cases = useChefRead('chef-support-cases', signal => chefSupportCasesApi.list({limit: 20, signal}));
  const tickets = cases.query.data?.cases ?? [];
  const now = new Date(Date.now());

  return (
    <ChefScreen
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Help & support" />}
      withTabBar>
      <ChefCard style={styles.helpCard}>
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.helpTitle}>
          How can we help?
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
          Craves support team
        </Text>
        <View style={styles.buttons}>
          <ChefActionButton
            busy={support.loading}
            icon="phone"
            label="Call"
            onPress={() => {
              support.call().catch(() => undefined);
            }}
            style={styles.button}
            tone="neutral"
          />
          <ChefActionButton
            icon="headset"
            label="Chat with us"
            onPress={() => navigation.navigate('ChefSupportChat')}
            style={styles.button}
            tone="success"
          />
        </View>
        {support.loadFailed ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
            We couldn't load our phone number. Press Call to try again.
          </Text>
        ) : null}
      </ChefCard>

      <SectionHeader title="Common topics" />
      <ListGroup>
        {SUPPORT_TOPICS.map(topic => (
          <ListRow
            icon={topic.icon}
            key={topic.title}
            onPress={() => navigation.navigate('ChefSupportTicket', {topic: topic.title})}
            title={topic.title}
          />
        ))}
      </ListGroup>

      <SectionHeader title="Your tickets" />
      <ReadState
        comingSoon={{title: 'Your tickets are on their way', message: 'Your chats with Craves support will be listed here soon.'}}
        query={cases.query}>
        {() =>
          tickets.length === 0 ? (
            <View style={styles.none}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.noneTitle}>
                No tickets yet
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                When you write to Craves support, your chats are listed here.
              </Text>
            </View>
          ) : (
            <ListGroup>
              {tickets.map(ticket => {
                const status = ticketStatus(ticket.status);
                return (
                  <ListRow
                    key={ticket.id}
                    onPress={() => navigation.navigate('ChefSupportTicket', {caseId: ticket.id})}
                    right={<StatusChip label={status.label} tone={status.tone} />}
                    subtitle={ticketSubtitle(ticket, now)}
                    title={`${ticketNumber(ticket)} · ${ticket.subject}`}
                  />
                );
              })}
            </ListGroup>
          )
        }
      </ReadState>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  helpCard: {alignItems: 'center', gap: spacing.xxs, padding: spacing.lg},
  helpTitle: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  muted: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  buttons: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignSelf: 'stretch'},
  button: {flex: 1},
  none: {alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.md},
  noneTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
});
