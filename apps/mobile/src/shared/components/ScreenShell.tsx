import React, {PropsWithChildren} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import type {
  ColorValue,
  StatusBarStyle,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {Edge} from 'react-native-safe-area-context';
import {colors, safeArea} from '../../design/tokens';

export interface ScreenShellProps extends PropsWithChildren {
  backgroundColor?: ColorValue;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  keyboardAvoiding?: boolean;
  keyboardVerticalOffset?: number;
  scroll?: boolean;
  statusBarStyle?: StatusBarStyle;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ScreenShell({
  children,
  backgroundColor = colors.surfaceBase,
  contentContainerStyle,
  edges = ['top', 'bottom'],
  keyboardAvoiding = true,
  keyboardVerticalOffset = 0,
  scroll = false,
  statusBarStyle = 'dark-content',
  style,
  testID,
}: ScreenShellProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, contentContainerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, {backgroundColor}, style]}
      testID={testID}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={backgroundColor} />
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={keyboardVerticalOffset}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: safeArea.contentBottomPadding,
  },
});
