import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ChefHat from 'lucide-react-native/icons/chef-hat';
import UserRound from 'lucide-react-native/icons/user-round';
import Check from 'lucide-react-native/icons/check';
import { colors, spacing } from '../../../design/tokens';
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
}

export function AuthRoleCards({
  value,
  onChange,
  disabled = false,
  welcome = false,
  descriptions = true,
  compact = false,
}: Props) {
  return (
    <View style={styles.row}>
      {(['CUSTOMER', 'CHEF'] as const).map(role => {
        const selected = value === role;
        const ChefOrCustomer = role === 'CHEF' ? ChefHat : UserRound;
        const label = role === 'CHEF' ? 'Chef' : 'Customer';
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
              welcome && styles.welcomeCard,
              (compact || !descriptions) && styles.compactCard,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <AuthSurfaceFinish selected={selected} radius={16} />
            <View
              style={[
                styles.body,
                (compact || !descriptions) && styles.compactBody,
              ]}
            >
              <View
                style={[
                  styles.icon,
                  selected && styles.selectedIcon,
                  welcome && styles.welcomeIcon,
                  (compact || !descriptions) && styles.compactIcon,
                ]}
              >
                <AuthSurfaceFinish radius={30} selected={selected} />
                <ChefOrCustomer
                  size={welcome ? 29 : compact || !descriptions ? 25 : 27}
                  color={
                    role === 'CUSTOMER' || selected
                      ? loginColors.red
                      : loginColors.body
                  }
                  fill={role === 'CUSTOMER' ? loginColors.red : 'none'}
                  strokeWidth={role === 'CUSTOMER' ? 0 : 2}
                />
              </View>
              <View style={styles.copy}>
                <Text style={[styles.label, welcome && styles.welcomeLabel]}>
                  {label}
                </Text>
                {descriptions ? (
                  <Text
                    style={[
                      styles.description,
                      compact && styles.compactDescription,
                    ]}
                  >
                    {role === 'CUSTOMER'
                      ? 'Discover amazing food\nfrom home chefs'
                      : 'Share your passion\nand earn'}
                  </Text>
                ) : null}
              </View>
            </View>
            {selected ? (
              <View
                style={[
                  styles.check,
                  (compact || !descriptions) && styles.compactCheck,
                ]}
              >
                <Check color={colors.white} size={13} strokeWidth={3} />
              </View>
            ) : null}
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
    minHeight: 112,
    padding: 14,
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
  welcomeCard: { minHeight: 140, padding: 16 },
  compactCard: { minHeight: 68, padding: 10 },
  body: { gap: 6 },
  compactBody: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { flexShrink: 1, minWidth: 0 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIcon: { backgroundColor: 'rgba(255,255,255,0.5)' },
  welcomeIcon: { width: 54, height: 54, borderRadius: 27 },
  compactIcon: { width: 40, height: 40, borderRadius: 20 },
  label: { fontSize: 17, fontFamily: loginFonts.bold, color: loginColors.ink },
  welcomeLabel: { fontSize: 18 },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: loginColors.red,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: [
      { offsetX: 0, offsetY: 3, blurRadius: 8, color: 'rgba(246,46,24,0.22)' },
    ],
  },
  compactCheck: { top: 5, right: 5, width: 17, height: 17, borderRadius: 9 },
  description: {
    color: loginColors.body,
    fontFamily: loginFonts.regular,
    fontSize: 12,
    marginTop: 3,
  },
  compactDescription: { fontSize: 10.5 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.84 },
});
