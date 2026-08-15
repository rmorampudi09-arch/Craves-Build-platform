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
import {Icon} from '../../../shared/components/Icon';

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
      <View pointerEvents="none" style={styles.searchIcon}>
        <Icon name="search" size={18} color={colors.textSecondary} />
      </View>
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
  searchIcon: {
    position: 'absolute',
    left: spacing.sm,
    top: 0,
    bottom: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: touchTarget.minimum,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    color: colors.textPrimary,
    fontSize: typography.small,
    paddingLeft: 40,
    paddingRight: spacing.md,
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
    backgroundColor: colors.surfaceMuted,
  },
  clearText: {
    color: colors.flameRedAccessible,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
});
