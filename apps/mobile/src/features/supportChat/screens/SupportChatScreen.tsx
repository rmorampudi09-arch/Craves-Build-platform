import React, {useRef, useState} from 'react';
import {
  AccessibilityInfo,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {IconButton} from '../../../shared/components/IconButton';
import {InputField} from '../../../shared/components/InputField';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {
  SUPPORT_CHAT_MAX_CONTENT_LENGTH,
  supportChatApi,
  type SupportChatContextRole,
  type SupportChatMessage,
} from '../api/supportChatApi';

const DISCLOSURE =
  "You're chatting with Craves' AI assistant. It can make mistakes. Never share OTPs, card numbers or passwords.";

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

function MessageBubble({role, content}: SupportChatMessage) {
  const fromUser = role === 'user';
  return (
    <View
      accessible
      accessibilityLabel={`${fromUser ? 'You' : 'Assistant'}: ${content}`}
      style={[
        styles.bubble,
        fromUser ? styles.userBubble : styles.assistantBubble,
      ]}>
      <Text style={fromUser ? styles.userText : styles.assistantText}>
        {content}
      </Text>
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
  const listRef = useRef<FlatList<SupportChatMessage>>(null);
  // History stays in component memory only; it can contain order and account details.
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseNumber, setCaseNumber] = useState<string | null>(null);

  const send = async () => {
    const content = draft.trim();
    if (!content || pending) {
      return;
    }
    const history: SupportChatMessage[] = [
      ...messages,
      {role: 'user', content},
    ];
    setMessages(history);
    setDraft('');
    setError(null);
    setPending(true);
    try {
      const {reply, supportCase} = await supportChatApi.send(
        contextRole,
        history,
        orderId,
      );
      setMessages([...history, {role: 'assistant', content: reply}]);
      if (supportCase) {
        setCaseNumber(supportCase.caseNumber);
      }
      AccessibilityInfo.announceForAccessibility(
        supportCase ? `${reply} ${ticketCopy(supportCase.caseNumber)}` : reply,
      );
    } catch (caught) {
      // Put the unsent text back so a failed send never loses what the user typed.
      setMessages(messages);
      setDraft(content);
      setError(chatErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

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
        <Text accessibilityRole="header" style={styles.title}>
          Craves assistant
        </Text>
      </View>

      <View style={styles.disclosure} testID="support-chat-disclosure">
        <Icon name="shield" size={iconSize.sm} color={colors.infoText} />
        <Text style={styles.disclosureText}>{DISCLOSURE}</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, index) => String(index)}
        ListHeaderComponent={
          <MessageBubble
            role="assistant"
            content={
              orderId
                ? 'Hi! How can I help with this order?'
                : 'Hi! How can I help you today?'
            }
          />
        }
        renderItem={({item}) => <MessageBubble {...item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({animated: true})
        }
      />

      <View style={styles.footer}>
        {pending ? (
          <LoadingIndicator
            label="Assistant is replying…"
            accessibilityLabel="Assistant is replying"
            testID="support-chat-pending"
          />
        ) : null}
        {caseNumber ? (
          <View style={styles.ticket} testID="support-chat-ticket">
            <Icon name="ticket" size={iconSize.sm} color={colors.successText} />
            <Text style={styles.ticketText}>{ticketCopy(caseNumber)}</Text>
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
            editable={!pending}
            inputStyle={styles.inputText}
            maxLength={SUPPORT_CHAT_MAX_CONTENT_LENGTH}
            multiline
            onChangeText={setDraft}
            placeholder="Type your question"
            testID="support-chat-input"
            value={draft}
          />
          <Button
            accessibilityLabel="Send message"
            disabled={!draft.trim()}
            label="Send"
            loading={pending}
            onPress={() => {
              send().catch(() => undefined);
            }}
            testID="support-chat-send"
          />
        </View>
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
  title: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    marginBottom: spacing.none,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.infoSoft,
  },
  disclosureText: {
    flex: 1,
    color: colors.infoText,
    fontSize: typography.small,
    lineHeight: 20,
  },
  list: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.flameRedAccessible,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
  },
  userText: {
    color: colors.white,
    fontSize: typography.body,
    lineHeight: 22,
  },
  assistantText: {
    color: colors.textPrimary,
    fontSize: typography.body,
    lineHeight: 22,
  },
  footer: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
  ticketText: {
    flex: 1,
    color: colors.successText,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.small,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
  },
  inputText: {
    maxHeight: 120,
    paddingVertical: spacing.xs,
  },
});
