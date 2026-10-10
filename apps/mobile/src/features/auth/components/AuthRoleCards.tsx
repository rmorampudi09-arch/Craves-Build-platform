import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ChefHat from 'lucide-react-native/icons/chef-hat';
import UserRound from 'lucide-react-native/icons/user-round';
import { spacing } from '../../../design/tokens';
import type { AuthRole } from '../domain/types';
import { AuthSurfaceFinish } from './AuthSurfaceFinish';
import { loginColors, loginFonts } from './loginVisuals';

interface Props {
  value: AuthRole;
  onChange?: (role: AuthRole) => void;
  disabled?: boolean;
  welcome?: boolean;
  descriptions?: boolean;
  compact?: boolean;
  slim?: boolean;
}

export function AuthRoleCards({
  value,
  onChange,
  disabled = false,
  welcome = false,
  descriptions = true,
  compact = false,
  slim = false,
}: Props) {
  return (
    <View style={styles.row}>
      {(['CUSTOMER', 'CHEF'] as const).map(role => {
        const selected = value === role;
        const ChefOrCustomer = role === 'CHEF' ? ChefHat : UserRound;
        const label = role === 'CHEF' ? 'Chef' : 'Customer';
        // Compact tiles keep both lines beside the icon; full tiles put the description underneath.
        const side = compact || !descriptions;
        const title = <Text style={styles.label}>{label}</Text>;
        const description = descriptions ? (
          <Text
            style={[styles.description, compact && styles.compactDescription]}
          >
            {role === 'CUSTOMER'
              ? 'Discover amazing food\nfrom home chefs'
              : 'Share your passion\nand earn'}
          </Text>
        ) : null;
        return (
          <Pressable
            key={role}
            onPress={onChange ? () => onChange(role) : undefined}
            disabled={disabled || !onChange}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{
              checked: selected,
              disabled: disabled || !onChange,
            }}
            testID={`login-role-${role.toLowerCase()}`}
            style={({ pressed }) => [
              styles.card,
              selected && styles.selected,
              side && styles.compactCard,
              slim && styles.slimCard,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <AuthSurfaceFinish selected={selected} radius={16} />
            <View style={[styles.body, side && styles.compactBody]}>
              <View
                style={[
                  styles.icon,
                  selected && styles.selectedIcon,
                  side && styles.compactIcon,
                  slim && styles.slimIcon,
                ]}
              >
                <AuthSurfaceFinish radius={30} selected={selected} />
                <ChefOrCustomer
                  size={slim ? 21 : side ? 25 : welcome ? 22 : 21}
                  color={
                    role === 'CUSTOMER' || selected
                      ? loginColors.red
                      : loginColors.body
                  }
                  fill={role === 'CUSTOMER' ? loginColors.red : 'none'}
                  strokeWidth={role === 'CUSTOMER' ? 0 : 2}
                />
              </View>
              {side ? (
                <View style={styles.copy}>
                  {title}
                  {description}
                </View>
              ) : (
                title
              )}
            </View>
            {side ? null : description}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1,
    minWidth: 0,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E1E3E7',
    borderRadius: 16,
    backgroundColor: '#F6F7F9',
    boxShadow: [
      { offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(25,30,45,0.05)' },
    ],
  },
  selected: {
    backgroundColor: loginColors.selectedFill,
    borderColor: loginColors.selectedBorder,
    boxShadow: [
      { offsetX: 0, offsetY: 5, blurRadius: 18, color: 'rgba(246,46,24,0.17)' },
    ],
  },
  compactCard: { minHeight: 68, padding: 10 },
  slimCard: { minHeight: 48, paddingVertical: 6 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactBody: { gap: 8 },
  copy: { flexShrink: 1, minWidth: 0 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIcon: { backgroundColor: 'rgba(255,255,255,0.5)' },
  compactIcon: { width: 40, height: 40, borderRadius: 20 },
  slimIcon: { width: 34, height: 34, borderRadius: 17 },
  label: {
    flexShrink: 1,
    fontSize: 17,
    fontFamily: loginFonts.bold,
    color: loginColors.ink,
  },
  description: {
    color: loginColors.body,
    fontFamily: loginFonts.regular,
    fontSize: 12,
    marginTop: 6,
  },
  compactDescription: { fontSize: 10.5, marginTop: 3 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.84 },
});
