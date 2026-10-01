import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { colors, spacing, touchTarget } from '../../../design/tokens';
import { loginHeroFractions, type LoginLayout } from './loginVisuals';

interface Props extends React.PropsWithChildren {
  welcome?: boolean;
  variant?: LoginLayout;
  onBack?: () => void;
  backDisabled?: boolean;
}

export function VideoAuthLayout({
  children,
  welcome = false,
  variant = 'phone',
  onBack,
  backDisabled,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logoWidth = Math.min(width * 0.65, 310);
  const heroFraction = loginHeroFractions[welcome ? 'welcome' : variant];
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <View
        testID="auth-video-window"
        style={[styles.hero, { flex: heroFraction }]}
      >
        <Image
          testID="auth-wordmark"
          source={require('../../../assets/auth/craves-login-wordmark.png')}
          accessibilityLabel="Craves"
          resizeMode="contain"
          style={{
            width: logoWidth,
            height: logoWidth / 3,
            marginTop: insets.top + spacing.md,
          }}
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
        style={[styles.panel, { flex: 1 - heroFraction }]}
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
  hero: { alignItems: 'center', overflow: 'hidden' },
  panel: {
    backgroundColor: '#FEFEFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    gap: 12,
  },
  handle: {
    width: 50,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CED1D8',
    alignSelf: 'center',
    marginBottom: 10,
  },
  welcomeContent: { gap: 18, paddingTop: 12 },
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
