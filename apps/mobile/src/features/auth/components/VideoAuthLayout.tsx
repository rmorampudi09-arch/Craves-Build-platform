import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { colors, spacing, touchTarget } from '../../../design/tokens';

interface Props extends React.PropsWithChildren {
  welcome?: boolean;
  onBack?: () => void;
  backDisabled?: boolean;
}

export function VideoAuthLayout({
  children,
  welcome = false,
  onBack,
  backDisabled,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <View
        testID="auth-video-window"
        style={[styles.hero, welcome && styles.welcomeHero]}
      >
        <Image
          source={require('../../../assets/brand/craves-approved-logo.png')}
          accessibilityLabel="Craves"
          resizeMode="contain"
          style={[styles.logo, { marginTop: insets.top + spacing.md }]}
        />
        {onBack ? (
          <Pressable
            onPress={onBack}
            disabled={backDisabled}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityState={{ disabled: Boolean(backDisabled) }}
            style={[
              styles.back,
              { top: insets.top + spacing.sm },
              backDisabled && styles.disabled,
            ]}
          >
            <ArrowLeft size={22} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      <View
        testID="auth-white-panel"
        style={[styles.panel, welcome && styles.welcomePanel]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            welcome && styles.welcomeContent,
            {
              paddingBottom: Math.max(insets.bottom, spacing.sm),
              paddingLeft: Math.max(insets.left, spacing.xl),
              paddingRight: Math.max(insets.right, spacing.xl),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.handle} accessibilityElementsHidden />
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  hero: { flex: 0.4, alignItems: 'center', overflow: 'hidden' },
  welcomeHero: { flex: 0.75 },
  panel: {
    flex: 0.6,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  welcomePanel: { flex: 0.25 },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  welcomeContent: { paddingTop: spacing.xs, gap: 6 },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CED1D8',
    alignSelf: 'center',
  },
  logo: { width: 104, height: 104 },
  back: {
    position: 'absolute',
    left: spacing.md,
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
});
