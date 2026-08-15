import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';

interface DiscoverySearchInputProps {
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
  style?: StyleProp<ViewStyle>;
}

export function DiscoverySearchInput({
  accessibilityLabel,
  placeholder,
  value,
  onChangeText,
  onClear,
  style,
}: DiscoverySearchInputProps) {
  const clearVisible = value.length > 0;

  return (
    <View style={[styles.container, style]}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="search"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        returnKeyType="search"
        style={[styles.input, clearVisible && styles.inputWithClear]}
        value={value}
      />
      {clearVisible ? (
        <Pressable
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          onPress={onClear}
          style={({pressed}) => [styles.clearButton, pressed && styles.clearPressed]}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  input: {
    minHeight: touchTarget.comfortable,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
  },
  inputWithClear: {
    paddingRight: 68,
  },
  clearButton: {
    position: 'absolute',
    right: 2,
    top: 2,
    bottom: 2,
    minWidth: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  clearPressed: {
    backgroundColor: colors.white,
  },
  clearText: {
    color: colors.flameRedAccessible,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
});
