import React, {useEffect, useRef, useState} from 'react';
import {Animated, Image, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
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
import {Icon} from '../../../shared/components/Icon';
import type {ChatBubble} from '../state/useSupportChat';

export const ASSISTANT = 'Craves Assistant';

// Only Craves links, emails and the support phone become tappable; anything else the model writes stays plain text.
const TOKEN = /(https?:\/\/(?:www\.)?craves\.in(?:\/[^\s<>"]*)?|\b[a-z]+@craves\.in\b|\b8367366787\b|"[^"\n]{1,48}")/gi;

export const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});

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
    const label = target.startsWith('http') ? target.replace(/^https?:\/\/(www\.)?/, '') : part;
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
    const timer = setTimeout(() => setShown(Math.min(words.length, shown + step)), 32);
    return () => clearTimeout(timer);
  }, [animate, shown, step, words.length]);
  return shown >= words.length ? text : words.slice(0, shown).join('');
}

const CRAVES_LOGO = require('../../../../assets/brand/craves-app-icon-1024.png');

/** The assistant speaks as Craves, so it wears the Craves logo. */
export function ChatAvatar({size = iconSize.xl}: {size?: number}) {
  return (
    <Image
      accessibilityElementsHidden
      importantForAccessibility="no"
      source={CRAVES_LOGO}
      style={{width: size, height: size, borderRadius: size / 2}}
    />
  );
}

/** `chef` swaps the customer look (grey bubble, red bubble, logo) for the chef board's white screen with borders. */
export function AssistantBubble({
  message,
  first,
  reduceMotion,
  chef,
}: {
  message: ChatBubble;
  first: boolean;
  reduceMotion: boolean;
  chef: boolean;
}) {
  const text = useReveal(message.content, Boolean(message.reveal) && !reduceMotion);
  return (
    <View style={styles.assistantRow}>
      {chef ? null : first ? <ChatAvatar /> : <View style={styles.avatarSpace} />}
      <View style={styles.assistantColumn}>
        {first ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.sender}>
            {ASSISTANT}
          </Text>
        ) : null}
        <View style={[styles.bubble, styles.assistantBubble, chef && styles.chefAssistantBubble]}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.assistantText}>
            {richText(text)}
          </Text>
        </View>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.meta}>
          {clock(message.at)}
        </Text>
      </View>
    </View>
  );
}

export function UserBubble({
  message,
  last,
  chef,
  retryDisabled,
  onRetry,
}: {
  message: ChatBubble;
  last: boolean;
  chef: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
}) {
  const failed = message.status === 'failed';
  const sending = message.status === 'sending';
  return (
    <View style={styles.userRow}>
      <View
        accessible
        accessibilityLabel={`You: ${message.content}`}
        style={[styles.bubble, styles.userBubble, chef && styles.chefUserBubble]}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.userText, chef && styles.chefUserText]}>
          {message.content}
        </Text>
      </View>
      {failed ? (
        <View style={styles.statusRow}>
          <Icon name="alert" size={iconSize.xs} color={colors.error} surface={false} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.failedText}>
            Not sent
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry"
            accessibilityState={{disabled: retryDisabled}}
            disabled={retryDisabled}
            onPress={onRetry}
            style={({pressed}) => [styles.retry, (pressed || retryDisabled) && styles.pressed]}
            testID="support-chat-retry">
            <Icon name="refresh" size={iconSize.xs} color={colors.error} surface={false} />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.retryText}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : last || sending ? (
        <View style={styles.statusRow}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.meta}>
            {clock(message.at)}
          </Text>
          <Icon
            name={sending ? 'clock' : 'check'}
            size={iconSize.xs}
            color={sending ? colors.textSecondary : colors.flameRedAccessible}
            surface={false}
          />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.meta}>
            {sending ? 'Sending' : 'Sent'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function TypingDots({reduceMotion, chef}: {reduceMotion: boolean; chef: boolean}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    const loop = Animated.loop(Animated.timing(progress, {toValue: 1, duration: 1200, useNativeDriver: true}));
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);
  return (
    <View accessible accessibilityLabel={`${ASSISTANT} is typing`} style={styles.assistantRow} testID="support-chat-typing">
      {chef ? null : <ChatAvatar />}
      <View style={[styles.bubble, styles.assistantBubble, chef && styles.chefAssistantBubble, styles.typing]}>
        {[0, 1, 2].map(dot => {
          // Each dot rises and brightens in turn, then rests (animation offsets and opacities have no token).
          const start = dot * 0.2;
          const range = {inputRange: [0, start, start + 0.2, start + 0.4, 1], extrapolate: 'clamp' as const};
          return (
            <Animated.View
              key={dot}
              style={[
                styles.dot,
                !reduceMotion && {
                  opacity: progress.interpolate({...range, outputRange: [0.35, 0.35, 1, 0.35, 0.35]}),
                  transform: [{translateY: progress.interpolate({...range, outputRange: [0, 0, -3, 0, 0]})}],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarSpace: {width: iconSize.xl},
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
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: spacing.xxs,
    backgroundColor: colors.surfaceMuted,
  },
  chefAssistantBubble: {
    backgroundColor: colors.white,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  // No fixed lineHeight on message text: the design tokens leave it out so scaled text is never clipped.
  assistantText: {
    color: colors.textPrimary,
    fontSize: typography.body,
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
    borderBottomRightRadius: spacing.xxs,
    backgroundColor: colors.flameRedAccessible,
  },
  chefUserBubble: {backgroundColor: colors.errorSoft},
  userText: {
    color: colors.white,
    fontSize: typography.body,
  },
  chefUserText: {color: colors.textPrimary},
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
    minHeight: touchTarget.minimum,
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
  pressed: {opacity: 0.6},
  typing: {
    flexDirection: 'row',
    gap: spacing.xxs,
    paddingVertical: spacing.md,
  },
  dot: {
    width: spacing.xs,
    height: spacing.xs,
    borderRadius: spacing.xxs,
    backgroundColor: colors.textSecondary,
  },
});
