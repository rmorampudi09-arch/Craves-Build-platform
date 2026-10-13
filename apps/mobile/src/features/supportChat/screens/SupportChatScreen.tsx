import React, {useRef, useState} from 'react';
import {FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Chip} from '../../../shared/components/Chip';
import {Icon} from '../../../shared/components/Icon';
import {IconButton} from '../../../shared/components/IconButton';
import {InputField} from '../../../shared/components/InputField';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {useSupportCall} from '../../chefSupport/state/useSupportCall';
import {ChefActionButton, ChefScreen, ChefTopBar, ChipTap} from '../../chefShell/components/ui';
import {SUPPORT_CHAT_MAX_CONTENT_LENGTH, type SupportChatContextRole} from '../api/supportChatApi';
import {
  AssistantBubble,
  ChatAvatar,
  TypingDots,
  UserBubble,
} from '../components/ChatBubbles';
import {ticketCopy, useSupportChat, type ChatBubble} from '../state/useSupportChat';

type Chat = ReturnType<typeof useSupportChat>;

const DISCLOSURE =
  "You're chatting with Craves' AI assistant. It can make mistakes. Never share OTPs, card numbers or passwords.";
const SUGGESTIONS: Record<SupportChatContextRole, string[]> = {
  CUSTOMER: [
    'Where is my order?',
    'How do refunds work?',
    'How do I change my delivery address?',
    'How do I start a meal plan?',
  ],
  CHEF: [
    'How do I accept an order?',
    'How do I add a dish?',
    'Where can I see my earnings?',
    'Is my application approved?',
  ],
};
const CHEF_UNAVAILABLE = 'Chat is not available right now. Call Craves support.';
const CUSTOMER_UNAVAILABLE = 'Chat is not available right now. Email support@craves.in.';

function greetingFor(contextRole: SupportChatContextRole, orderId: string | undefined): string {
  if (orderId) {
    return 'Hi! How can I help with this order? You can also ask where to find anything in the app.';
  }
  return `Hi! I'm the Craves support assistant. Ask me about ${
    contextRole === 'CHEF'
      ? "your kitchen's orders, your menu or where to find something in the app"
      : 'your orders, payments or where to find something in the app'
  }.`;
}

interface ThreadProps {
  chat: Chat;
  contextRole: SupportChatContextRole;
  orderId: string | undefined;
  /** Shown after the typing dots: the raised ticket, and on the chef board the suggested questions. */
  after: React.ReactNode;
}

/** The conversation: the greeting, every message, and the typing dots while the assistant answers. */
function ChatThread({chat, contextRole, orderId, after}: ThreadProps) {
  const reduceMotion = useReducedMotionPreference();
  const chef = contextRole === 'CHEF';
  const listRef = useRef<FlatList<ChatBubble>>(null);
  const [greetedAt] = useState(() => Date.now());
  const thread: ChatBubble[] = [
    {id: 0, role: 'assistant', at: greetedAt, content: greetingFor(contextRole, orderId)},
    ...chat.messages,
  ];
  const lastUser = [...chat.messages].reverse().find(message => message.role === 'user')?.id;

  return (
    <FlatList
      ref={listRef}
      data={thread}
      keyExtractor={item => String(item.id)}
      renderItem={({item, index}) =>
        item.role === 'assistant' ? (
          <AssistantBubble
            chef={chef}
            first={thread[index - 1]?.role !== 'assistant'}
            message={item}
            reduceMotion={reduceMotion}
          />
        ) : (
          <UserBubble
            chef={chef}
            last={item.id === lastUser}
            message={item}
            onRetry={() => chat.retry(item)}
            retryDisabled={chat.pending || chat.waiting}
          />
        )
      }
      ListFooterComponent={
        <>
          {chat.pending ? <TypingDots chef={chef} reduceMotion={reduceMotion} /> : null}
          {after}
        </>
      }
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => listRef.current?.scrollToEnd({animated: !reduceMotion})}
      style={styles.thread}
    />
  );
}

function TicketNotice({chat, contextRole}: {chat: Chat; contextRole: SupportChatContextRole}) {
  const navigation = useNavigation<NavigationProp<ChefProductStackParamList>>();
  if (!chat.supportCase) {
    return null;
  }
  const copy = ticketCopy(contextRole, chat.supportCase.caseNumber);
  if (contextRole === 'CHEF') {
    const caseId = chat.supportCase.id;
    return (
      <Pressable
        accessibilityLabel={`${copy}. Open the ticket.`}
        accessibilityLiveRegion="polite"
        accessibilityRole="button"
        onPress={() => navigation.navigate('ChefSupportTicket', {caseId})}
        style={({pressed}) => [styles.chefTicket, pressed && styles.pressed]}
        testID="support-chat-ticket">
        <Icon name="ticket" size={iconSize.md} color={colors.flameRedAccessible} surface={false} />
        <View style={styles.flex}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.ticketText}>
            {copy}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.ticketHint}>
            Open the ticket to read replies
          </Text>
        </View>
        <Icon name="chevron-right" size={iconSize.md} color={colors.borderStrong} surface={false} />
      </Pressable>
    );
  }
  return (
    <View accessibilityLiveRegion="polite" style={styles.ticket} testID="support-chat-ticket">
      <Icon name="ticket" size={iconSize.xs} color={colors.flameRedAccessible} surface={false} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.ticketText}>
        {copy}
      </Text>
    </View>
  );
}

/** Chef-only: the Call button of Help & support, asked for the support number only once chat turns out to be down. */
function ChefUnavailable() {
  const support = useSupportCall("We couldn't get our phone number just now. Please try again in a moment.");
  return (
    <View style={styles.problem} testID="support-chat-error">
      <Text
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        allowFontScaling={textDefaults.allowFontScaling}
        style={styles.problemText}>
        {CHEF_UNAVAILABLE}
      </Text>
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
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.problemText}>
          We couldn't load our phone number. Press Call to try again.
        </Text>
      ) : null}
    </View>
  );
}

function CustomerUnavailable() {
  return (
    <View style={styles.problem} testID="support-chat-error">
      <Text
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        allowFontScaling={textDefaults.allowFontScaling}
        style={styles.problemText}>
        {CUSTOMER_UNAVAILABLE}
      </Text>
      <Chip
        label="Email us"
        onPress={() => {
          Linking.openURL('mailto:support@craves.in?subject=Craves%20support').catch(() => undefined);
        }}
      />
    </View>
  );
}

function ChatProblemNotice({chat, contextRole}: {chat: Chat; contextRole: SupportChatContextRole}) {
  if (!chat.problem) {
    return null;
  }
  if (chat.problem.unavailable) {
    return contextRole === 'CHEF' ? <ChefUnavailable /> : <CustomerUnavailable />;
  }
  return (
    <Text
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      allowFontScaling={textDefaults.allowFontScaling}
      style={styles.problemBox}
      testID="support-chat-error">
      {chat.problem.message}
    </Text>
  );
}

function Disclosure() {
  return (
    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.disclosure} testID="support-chat-disclosure">
      {DISCLOSURE}
    </Text>
  );
}

function ChefChat({chat, orderId}: {chat: Chat; orderId: string | undefined}) {
  const navigation = useNavigation<NavigationProp<ChefProductStackParamList>>();
  const blocked = !chat.draft.trim() || chat.waiting;
  return (
    <ChefScreen
      footer={
        <View style={styles.footer}>
          <ChatProblemNotice chat={chat} contextRole="CHEF" />
          <View style={styles.composer}>
            <View style={styles.chefInputBox}>
              <TextInput
                accessibilityLabel="Message the Craves assistant"
                allowFontScaling={textDefaults.allowFontScaling}
                maxLength={SUPPORT_CHAT_MAX_CONTENT_LENGTH}
                multiline
                onChangeText={chat.setDraft}
                placeholder="Type your message"
                placeholderTextColor={colors.placeholder}
                style={styles.chefInput}
                testID="support-chat-input"
                value={chat.draft}
              />
            </View>
            <ChefActionButton
              accessibilityLabel="Send message"
              busy={chat.pending}
              disabled={blocked}
              label="Send"
              onPress={() => chat.send(chat.draft)}
            />
          </View>
          <Disclosure />
        </View>
      }
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} subtitle="AI assistant" title="Chat with us" />}
      scroll={false}
      testID="support-chat">
      <ChatThread
        after={
          <>
            <TicketNotice chat={chat} contextRole="CHEF" />
            {chat.messages.length === 0 && !orderId ? (
              <View style={styles.suggestions} testID="support-chat-suggestions">
                {SUGGESTIONS.CHEF.map(question => (
                  <ChipTap accessibilityLabel={question} accessibilityRole="button" key={question} onPress={() => chat.send(question)}>
                    <View style={styles.chefChip}>
                      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.chefChipText}>
                        {question}
                      </Text>
                    </View>
                  </ChipTap>
                ))}
              </View>
            ) : null}
          </>
        }
        chat={chat}
        contextRole="CHEF"
        orderId={orderId}
      />
    </ChefScreen>
  );
}

function CustomerChat({chat, orderId}: {chat: Chat; orderId: string | undefined}) {
  const navigation = useNavigation();
  const blocked = chat.pending || chat.waiting || !chat.draft.trim();
  return (
    <ScreenShell backgroundColor={colors.white} edges={['top', 'bottom']} testID="support-chat">
      <View style={styles.titleBar}>
        <IconButton icon="arrow-left" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <ChatAvatar size={40} />
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.title}>
            Craves support
          </Text>
          <Text style={styles.subtitle}>AI assistant · replies in seconds</Text>
        </View>
      </View>

      <ChatThread
        after={<TicketNotice chat={chat} contextRole="CUSTOMER" />}
        chat={chat}
        contextRole="CUSTOMER"
        orderId={orderId}
      />

      <View style={[styles.footer, styles.customerFooter]}>
        {!chat.messages.length ? (
          <View style={styles.suggestions} testID="support-chat-suggestions">
            {SUGGESTIONS.CUSTOMER.map(question => (
              <Chip key={question} label={question} onPress={() => chat.send(question)} />
            ))}
          </View>
        ) : null}
        <ChatProblemNotice chat={chat} contextRole="CUSTOMER" />
        <View style={styles.composer}>
          <InputField
            accessibilityLabel="Message the Craves assistant"
            containerStyle={styles.flex}
            inputStyle={styles.customerInput}
            maxLength={SUPPORT_CHAT_MAX_CONTENT_LENGTH}
            multiline
            onChangeText={chat.setDraft}
            placeholder="Type your message"
            testID="support-chat-input"
            value={chat.draft}
          />
          <Pressable
            accessibilityLabel="Send message"
            accessibilityRole="button"
            accessibilityState={{disabled: blocked, busy: chat.pending}}
            disabled={blocked}
            onPress={() => chat.send(chat.draft)}
            style={({pressed}) => [styles.send, blocked && styles.sendDisabled, pressed && styles.pressed]}
            testID="support-chat-send">
            <Icon name="send" size={iconSize.sm} color={blocked ? colors.textSecondary : colors.white} surface={false} />
          </Pressable>
        </View>
        <Disclosure />
      </View>
    </ScreenShell>
  );
}

interface SupportChatScreenProps {
  contextRole: SupportChatContextRole;
  orderId?: string;
}

/** Ask Craves: the AI support assistant. Customers get the customer look, chefs the chef board. */
export function SupportChatScreen({contextRole, orderId}: SupportChatScreenProps) {
  const chat = useSupportChat(contextRole, orderId);
  return contextRole === 'CHEF' ? <ChefChat chat={chat} orderId={orderId} /> : <CustomerChat chat={chat} orderId={orderId} />;
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  pressed: {opacity: 0.8},
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  thread: {flex: 1, backgroundColor: colors.white},
  list: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.errorSoft,
    backgroundColor: colors.cream,
  },
  chefTicket: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  ticketText: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  ticketHint: {color: colors.textSecondary, fontSize: typography.small},
  footer: {
    gap: spacing.xs,
    backgroundColor: colors.white,
  },
  customerFooter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chefChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  chefChipText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  problem: {gap: spacing.xs, alignItems: 'flex-start'},
  problemText: {color: colors.textPrimary, fontSize: typography.small},
  problemBox: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
    color: colors.error,
    fontSize: typography.small,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  customerInput: {
    maxHeight: 120,
    paddingVertical: spacing.xs,
  },
  chefInputBox: {
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
  chefInput: {color: colors.textPrimary, fontSize: typography.body, paddingVertical: spacing.xs},
  send: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  sendDisabled: {backgroundColor: colors.border},
  disclosure: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 16,
  },
});
