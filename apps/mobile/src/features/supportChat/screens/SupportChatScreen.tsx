import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {toAppApiError} from '../../../core/http/apiError';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
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
import {Chip} from '../../../shared/components/Chip';
import {Icon} from '../../../shared/components/Icon';
import {IconButton} from '../../../shared/components/IconButton';
import {InputField} from '../../../shared/components/InputField';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {
  SUPPORT_CHAT_MAX_CONTENT_LENGTH,
  supportChatApi,
  type SupportChatContextRole,
  type SupportChatMessage,
} from '../api/supportChatApi';

type Status = 'sending' | 'sent' | 'failed';
type Bubble = SupportChatMessage & {
  id: number;
  at: number;
  status?: Status;
  reveal?: boolean;
};

const ASSISTANT = 'Craves Assistant';
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
// Only Craves links, emails and the support phone become tappable; anything else the model writes stays plain text.
const TOKEN =
  /(https?:\/\/(?:www\.)?craves\.in(?:\/[^\s<>"]*)?|\b[a-z]+@craves\.in\b|\b8367366787\b|"[^"\n]{1,48}")/gi;

function ticketCopy(caseNumber: string): string {
  return `Ticket ${caseNumber} created — our team will reply in your notifications`;
}

function chatErrorMessage(caught: unknown): string {
  const error = toAppApiError(caught);
  if (error.status === 429) {
    return error.retryAfterSeconds
      ? `Too many messages. Please wait ${error.retryAfterSeconds} s and try again.`
      : 'Too many messages. Please wait a moment and try again.';
  }
  if (error.status === 503) {
    return 'Assistant unavailable — email support@craves.in';
  }
  return error.message;
}

const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

/** Reply text with Craves links, contacts and "quoted" button names made readable and tappable. */
export function richText(text: string): React.ReactNode[] {
  return text.split(TOKEN).map((part, index) => {
    if (index % 2 === 0) {
      return part.replaceAll(' > ', ' › ');
    }
    if (part.startsWith('"')) {
      return (
        <Text key={index} style={styles.strong}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    const target = part.includes('@')
      ? `mailto:${part}`
      : /^\d+$/.test(part)
        ? `tel:${part}`
        : part.replace(/[.,;:!?)]+$/, '');
    const label = target.startsWith('http')
      ? target.replace(/^https?:\/\/(www\.)?/, '')
      : part;
    return (
      <React.Fragment key={index}>
        <Text
          accessibilityRole="link"
          onPress={() => {
            Linking.openURL(target).catch(() => undefined);
          }}
          style={styles.link}>
          {label}
        </Text>
        {target.startsWith('http') ? part.slice(target.length) : null}
      </React.Fragment>
    );
  });
}

/** Reveals a fresh reply a few words at a time (about a second and a half at most). */
function useReveal(text: string, animate: boolean): string {
  const words = text.split(/(\s+)/);
  const [shown, setShown] = useState(animate ? 0 : words.length);
  const step = Math.max(2, Math.ceil(words.length / 45));
  useEffect(() => {
    if (shown >= words.length) {
      return;
    }
    if (!animate) {
      setShown(words.length);
      return;
    }
    const timer = setTimeout(
      () => setShown(Math.min(words.length, shown + step)),
      32,
    );
    return () => clearTimeout(timer);
  }, [animate, shown, step, words.length]);
  return shown >= words.length ? text : words.slice(0, shown).join('');
}

function Avatar({size = 32}: {size?: number}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        {width: size, height: size, borderRadius: size / 2},
      ]}>
      <Icon
        name="sparkles"
        size={Math.round(size * 0.55)}
        color={colors.white}
        surface={false}
      />
    </View>
  );
}

function AssistantBubble({
  message,
  first,
  reduceMotion,
}: {
  message: Bubble;
  first: boolean;
  reduceMotion: boolean;
}) {
  const text = useReveal(message.content, Boolean(message.reveal) && !reduceMotion);
  return (
    <View style={styles.assistantRow}>
      {first ? <Avatar /> : <View style={styles.avatarSpace} />}
      <View style={styles.assistantColumn}>
        {first ? <Text style={styles.sender}>{ASSISTANT}</Text> : null}
        <View style={[styles.bubble, styles.assistantBubble]}>
          <Text style={styles.assistantText}>{richText(text)}</Text>
        </View>
        <Text style={styles.meta}>{clock(message.at)}</Text>
      </View>
    </View>
  );
}

function UserBubble({
  message,
  last,
  onRetry,
}: {
  message: Bubble;
  last: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={styles.userRow}>
      <View
        accessible
        accessibilityLabel={`You: ${message.content}`}
        style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{message.content}</Text>
      </View>
      {message.status === 'failed' ? (
        <View style={styles.statusRow}>
          <Icon name="alert" size={iconSize.xs} color={colors.error} surface={false} />
          <Text style={styles.failedText}>Not sent</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry"
            // 32 dp row plus 8 dp slop each side meets the 48 dp touch target.
            hitSlop={spacing.xs}
            onPress={onRetry}
            style={({pressed}) => [styles.retry, pressed && styles.pressed]}
            testID="support-chat-retry">
            <Icon name="refresh" size={iconSize.xs} color={colors.error} surface={false} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : last || message.status === 'sending' ? (
        <View style={styles.statusRow}>
          <Text style={styles.meta}>{clock(message.at)}</Text>
          <Icon
            name={message.status === 'sending' ? 'clock' : 'check'}
            size={iconSize.xs}
            color={message.status === 'sending' ? colors.textSecondary : colors.flameRedAccessible}
            surface={false}
          />
          <Text style={styles.meta}>
            {message.status === 'sending' ? 'Sending' : 'Sent'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TypingDots({reduceMotion}: {reduceMotion: boolean}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);
  return (
    <View
      accessible
      accessibilityLabel={`${ASSISTANT} is typing`}
      style={styles.assistantRow}
      testID="support-chat-typing">
      <Avatar />
      <View style={[styles.bubble, styles.assistantBubble, styles.typing]}>
        {[0, 1, 2].map(dot => {
          // Each dot rises and brightens in turn, then rests.
          const start = dot * 0.2;
          const range = {
            inputRange: [0, start, start + 0.2, start + 0.4, 1],
            extrapolate: 'clamp' as const,
          };
          return (
            <Animated.View
              key={dot}
              style={[
                styles.dot,
                !reduceMotion && {
                  opacity: progress.interpolate({...range, outputRange: [0.35, 0.35, 1, 0.35, 0.35]}),
                  transform: [
                    {translateY: progress.interpolate({...range, outputRange: [0, 0, -3, 0, 0]})},
                  ],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

interface SupportChatScreenProps {
  contextRole: SupportChatContextRole;
  orderId?: string;
}

export function SupportChatScreen({
  contextRole,
  orderId,
}: SupportChatScreenProps) {
  const navigation = useNavigation();
  const reduceMotion = useReducedMotionPreference();
  const listRef = useRef<FlatList<Bubble>>(null);
  const nextId = useRef(1);
  // History stays in component memory only; it can contain order and account details.
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseNumber, setCaseNumber] = useState<string | null>(null);
  const [greetedAt] = useState(() => Date.now());

  const deliver = async (content: string, earlier: Bubble[]) => {
    const id = nextId.current++;
    const outgoing: Bubble = {id, role: 'user', content, at: Date.now(), status: 'sending'};
    const settle = (status: Status, reply?: Bubble) =>
      setMessages(current => [
        ...current.map(message => (message.id === id ? {...message, status} : message)),
        ...(reply ? [reply] : []),
      ]);
    setMessages([...earlier, outgoing]);
    setError(null);
    setPending(true);
    try {
      const {reply, supportCase} = await supportChatApi.send(
        contextRole,
        [...earlier.filter(message => message.status !== 'failed'), outgoing].map(
          ({role, content: text}) => ({role, content: text}),
        ),
        orderId,
      );
      settle('sent', {id: nextId.current++, role: 'assistant', content: reply, at: Date.now(), reveal: true});
      if (supportCase) {
        setCaseNumber(supportCase.caseNumber);
      }
      AccessibilityInfo.announceForAccessibility(
        supportCase ? `${reply} ${ticketCopy(supportCase.caseNumber)}` : reply,
      );
    } catch (caught) {
      // The message stays in the thread as "Not sent" with Retry, so nothing typed is lost.
      settle('failed');
      setError(chatErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  const send = (text: string) => {
    const content = text.trim();
    if (!content || pending) {
      return;
    }
    setDraft('');
    deliver(content, messages).catch(() => undefined);
  };

  const retry = (failed: Bubble) => {
    if (!pending) {
      deliver(failed.content, messages.filter(message => message.id !== failed.id)).catch(
        () => undefined,
      );
    }
  };

  const greeting: Bubble = {
    id: 0,
    role: 'assistant',
    at: greetedAt,
    content: orderId
      ? 'Hi! How can I help with this order? You can also ask where to find anything in the app.'
      : `Hi! I'm the Craves support assistant. Ask me about ${
          contextRole === 'CHEF'
            ? "your kitchen's orders, your menu or where to find something in the app"
            : 'your orders, payments or where to find something in the app'
        }.`,
  };
  const thread = [greeting, ...messages];
  const lastUser = [...messages].reverse().find(message => message.role === 'user')?.id;

  return (
    <ScreenShell
      // Chef keeps its tab bar, which already pads the bottom inset.
      edges={contextRole === 'CHEF' ? ['top'] : ['top', 'bottom']}
      testID="support-chat">
      <View style={styles.titleBar}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
        />
        <Avatar size={40} />
        <View style={styles.titleText}>
          <Text accessibilityRole="header" style={styles.title}>
            Craves support
          </Text>
          <Text style={styles.subtitle}>AI assistant · replies in seconds</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={thread}
        keyExtractor={item => String(item.id)}
        renderItem={({item, index}) =>
          item.role === 'assistant' ? (
            <AssistantBubble
              message={item}
              first={thread[index - 1]?.role !== 'assistant'}
              reduceMotion={reduceMotion}
            />
          ) : (
            <UserBubble
              message={item}
              last={item.id === lastUser}
              onRetry={() => retry(item)}
            />
          )
        }
        ListFooterComponent={
          <>
            {pending ? <TypingDots reduceMotion={reduceMotion} /> : null}
            {caseNumber ? (
              <View
                accessibilityLiveRegion="polite"
                style={styles.ticket}
                testID="support-chat-ticket">
                <Icon name="ticket" size={iconSize.xs} color={colors.flameRedAccessible} surface={false} />
                <Text style={styles.ticketText}>{ticketCopy(caseNumber)}</Text>
              </View>
            ) : null}
          </>
        }
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({animated: !reduceMotion})}
      />

      <View style={styles.footer}>
        {!messages.length ? (
          <View style={styles.suggestions} testID="support-chat-suggestions">
            {SUGGESTIONS[contextRole].map(question => (
              <Chip key={question} label={question} onPress={() => send(question)} />
            ))}
          </View>
        ) : null}
        {error ? (
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={styles.errorText}
            testID="support-chat-error">
            {error}
          </Text>
        ) : null}
        <View style={styles.composer}>
          <InputField
            accessibilityLabel="Message the Craves assistant"
            containerStyle={styles.input}
            inputStyle={styles.inputText}
            maxLength={SUPPORT_CHAT_MAX_CONTENT_LENGTH}
            multiline
            onChangeText={setDraft}
            placeholder="Type your message"
            testID="support-chat-input"
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{disabled: pending || !draft.trim(), busy: pending}}
            disabled={pending || !draft.trim()}
            onPress={() => send(draft)}
            style={({pressed}) => [
              styles.send,
              (pending || !draft.trim()) && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
            testID="support-chat-send">
            <Icon
              name="send"
              size={iconSize.sm}
              color={pending || !draft.trim() ? colors.textSecondary : colors.white}
              surface={false}
            />
          </Pressable>
        </View>
        <Text style={styles.disclosure} testID="support-chat-disclosure">
          {DISCLOSURE}
        </Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  titleText: {flex: 1},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
  },
  avatarSpace: {width: 32},
  list: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingRight: spacing.xxl,
  },
  assistantColumn: {flexShrink: 1, gap: spacing.xxs},
  sender: {
    marginLeft: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: spacing.xxs + 2,
    backgroundColor: colors.surfaceMuted,
  },
  assistantText: {
    color: colors.textPrimary,
    fontSize: typography.body,
    lineHeight: 22,
  },
  strong: {fontWeight: fontWeight.semibold},
  link: {
    color: colors.flameRedAccessible,
    fontWeight: fontWeight.semibold,
    textDecorationLine: 'underline',
  },
  userRow: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
    paddingLeft: spacing.xxxl,
  },
  userBubble: {
    borderBottomRightRadius: spacing.xxs + 2,
    backgroundColor: colors.flameRedAccessible,
  },
  userText: {
    color: colors.white,
    fontSize: typography.body,
    lineHeight: 22,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  meta: {
    marginLeft: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  failedText: {
    color: colors.error,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  retry: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  retryText: {
    color: colors.error,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  pressed: {opacity: 0.8},
  typing: {
    flexDirection: 'row',
    gap: spacing.xxs,
    paddingVertical: spacing.sm + 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textSecondary,
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
  ticketText: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  footer: {
    gap: spacing.xs,
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
  errorText: {
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
  input: {flex: 1},
  inputText: {
    maxHeight: 120,
    paddingVertical: spacing.xs,
  },
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
