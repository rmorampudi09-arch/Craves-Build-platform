import React from 'react';
import {ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQueryClient} from '@tanstack/react-query';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useChefRead} from '../../chefProfile/state/useChefRead';
import {
  ChefActionButton,
  ChefScreen,
  ChefTopBar,
  ComingSoon,
  StatusChip,
  useChefToast,
} from '../../chefShell/components/ui';
import {formatDayLabel, formatTimeOfDay, shortOrderNumber} from '../../chefShell/domain/chefFormat';
import type {SupportCaseDetail, SupportCaseMessage} from '../../customerSupport/api/customerSupportCasesApi';
import {
  buildChefSupportMessageRequest,
  buildCreateChefSupportCaseRequest,
  chefSupportCasesApi,
} from '../api/chefSupportCasesApi';
import {isTicketClosed, ticketNumber, ticketStatus} from '../domain/supportPresentation';
import {useSupportCall} from '../state/useSupportCall';

const CHAT_COMING_SOON = {title: 'Chat is on its way', message: 'You will be able to write to Craves support here soon. You can call us in the meantime.'};
export const SEND_FAILED = "We couldn't send that. Your message is still here.";

const when = (iso: string, now: Date) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${formatDayLabel(date, now)} ${formatTimeOfDay(date)}`;
};

function Bubble({message, now}: {message: SupportCaseMessage; now: Date}) {
  const mine = message.senderRole === 'CHEF';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {mine ? null : (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.sender}>
          Craves support
        </Text>
      )}
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
        {message.body}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.time, mine && styles.timeMine]}>
        {when(message.createdAt, now)}
      </Text>
    </View>
  );
}

/** One support conversation, or a new chat when there is no ticket yet: the first message opens the ticket. */
export function ChefSupportTicketScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChefProductStackParamList, 'ChefSupportTicket'>>();
  const {caseId, orderId, topic} = useRoute<RouteProp<ChefProductStackParamList, 'ChefSupportTicket'>>().params ?? {};
  const queryClient = useQueryClient();
  const toast = useChefToast();
  const opened = useChefRead('chef-support-case', signal => chefSupportCasesApi.get(caseId as string, signal), {
    entityId: caseId,
    enabled: Boolean(caseId),
  });

  // What the last send returned wins over the first read, so the new message shows at once.
  const [latest, setLatest] = React.useState<SupportCaseDetail | null>(null);
  const detail = latest ?? opened.query.data ?? null;
  const activeCaseId = detail?.supportCase.id ?? caseId;
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [notPublished, setNotPublished] = React.useState(false);
  const busy = React.useRef(false);
  const support = useSupportCall("We couldn't get our phone number just now. Please try again in a moment.", notPublished);
  const scroller = React.useRef<ScrollView>(null);

  const subject =
    [topic, orderId ? shortOrderNumber(orderId) : null].filter(Boolean).join(' · ').slice(0, 160) || 'General question';

  const send = async () => {
    const message = draft.trim();
    if (!message || busy.current) {
      return;
    }
    busy.current = true;
    setSending(true);
    try {
      setLatest(
        activeCaseId
          ? await chefSupportCasesApi.addMessage(activeCaseId, buildChefSupportMessageRequest(message))
          : await chefSupportCasesApi.create(buildCreateChefSupportCaseRequest({subject, message, orderId})),
      );
      setDraft('');
      queryClient.invalidateQueries({queryKey: ['craves', 'v1', 'private', 'chef-support-cases']}).catch(() => undefined);
    } catch (error) {
      if (isRouteNotPublished(error)) {
        setNotPublished(true);
      } else {
        toast.show(SEND_FAILED);
      }
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const status = detail ? ticketStatus(detail.supportCase.status) : null;
  const closed = detail ? isTicketClosed(detail.supportCase.status) : false;
  const now = new Date(Date.now());

  // Not published: the box stays with what the chef typed (never thrown away), and Call is offered instead of Send.
  const composer =
    closed || (caseId && !detail) ? null : (
      <View style={styles.composer}>
        <View style={styles.inputBox}>
          <TextInput
            accessibilityLabel={detail ? 'Write a reply' : 'Write your message'}
            allowFontScaling={textDefaults.allowFontScaling}
            editable={!sending}
            maxLength={5000}
            multiline
            onChangeText={setDraft}
            placeholder={detail ? 'Write a reply…' : 'Write your message…'}
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            value={draft}
          />
        </View>
        <ChefActionButton
          busy={sending}
          disabled={!draft.trim() || notPublished}
          label="Send"
          onPress={() => send().catch(() => undefined)}
        />
      </View>
    );

  const thread = detail ? (
    <>
      {detail.messages.map(message => (
        <Bubble key={message.id} message={message} now={now} />
      ))}
      {closed ? (
        <View style={styles.closed}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.closedTitle}>
            This ticket is closed
          </Text>
          <ChefActionButton label="Start a new chat" onPress={() => navigation.replace('ChefSupportTicket', {})} tone="neutral" />
        </View>
      ) : null}
    </>
  ) : null;

  let content: React.ReactNode;
  if (notPublished) {
    content = (
      <>
        <ComingSoon {...CHAT_COMING_SOON} />
        {draft.trim() ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.intro}>
            Your message is still in the box below.
          </Text>
        ) : null}
        <ChefActionButton
          busy={support.loading}
          icon="phone"
          label="Call"
          onPress={() => {
            support.call().catch(() => undefined);
          }}
          tone="neutral"
        />
        {support.loadFailed ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.intro}>
            We couldn't load our phone number. Press Call to try again.
          </Text>
        ) : null}
      </>
    );
  } else if (!caseId && !detail) {
    content = (
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.intro}>
        {topic ? 'Tell us what happened and a Craves support person will reply here.' : 'Ask us anything. A Craves support person will reply here.'}
        {topic === 'Problem with an order' ? ' Mention the order number.' : ''}
      </Text>
    );
  } else if (detail) {
    content = thread;
  } else {
    content = (
      <ReadState comingSoon={CHAT_COMING_SOON} query={opened.query}>
        {() => thread}
      </ReadState>
    );
  }

  return (
    <ChefScreen
      footer={composer}
      header={
        <ChefTopBar
          onBack={() => navigation.goBack()}
          right={status ? <StatusChip label={status.label} tone={status.tone} /> : undefined}
          showBell={false}
          subtitle={detail ? detail.supportCase.subject : topic}
          title={detail ? ticketNumber(detail.supportCase) : 'Chat with us'}
        />
      }
      scroll={false}>
      <ScrollView
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroller.current?.scrollToEnd({animated: false})}
        ref={scroller}>
        {content}
      </ScrollView>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  thread: {flexGrow: 1, gap: spacing.sm, padding: spacing.md},
  intro: {color: colors.textSecondary, fontSize: typography.body},
  bubble: {maxWidth: '82%', gap: 2, padding: spacing.sm, borderRadius: radius.md},
  mine: {alignSelf: 'flex-end', backgroundColor: colors.errorSoft, borderBottomRightRadius: 4},
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  sender: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.bold},
  body: {color: colors.textPrimary, fontSize: typography.body},
  time: {color: colors.textSecondary, fontSize: typography.tiny},
  timeMine: {textAlign: 'right'},
  closed: {gap: spacing.sm, paddingTop: spacing.sm},
  closedTitle: {color: colors.textSecondary, fontSize: typography.body, fontWeight: fontWeight.semibold, textAlign: 'center'},
  composer: {flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs},
  inputBox: {
    flex: 1,
    minHeight: touchTarget.minimum,
    maxHeight: 120,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  input: {color: colors.textPrimary, fontSize: typography.body, paddingVertical: spacing.xs},
});
