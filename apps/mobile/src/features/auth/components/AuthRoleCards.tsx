import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ChefHat from 'lucide-react-native/icons/chef-hat';
import UserRound from 'lucide-react-native/icons/user-round';
import Check from 'lucide-react-native/icons/check';
import { colors, spacing } from '../../../design/tokens';
import type { AuthRole } from '../domain/types';

interface Props {
  value: AuthRole;
  onChange?: (role: AuthRole) => void;
  disabled?: boolean;
  welcome?: boolean;
  descriptions?: boolean;
}

export function AuthRoleCards({
  value,
  onChange,
  disabled = false,
  welcome = false,
  descriptions = true,
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
            style={[
              styles.card,
              selected && styles.selected,
              welcome && styles.welcomeCard,
              disabled && styles.disabled,
            ]}
          >
            <View style={styles.heading}>
              <View
                style={[
                  styles.icon,
                  selected && styles.selectedIcon,
                  welcome && styles.welcomeIcon,
                ]}
              >
                <ChefOrCustomer
                  size={welcome ? 17 : 23}
                  color={selected ? colors.flameRedAccessible : colors.ink}
                  strokeWidth={1.8}
                />
              </View>
              <Text style={[styles.label, welcome && styles.welcomeLabel]}>
                {label}
              </Text>
              {selected ? (
                <View style={styles.check}>
                  <Check color={colors.white} size={12} strokeWidth={3} />
                </View>
              ) : null}
            </View>
            {descriptions ? (
              <Text style={styles.description}>
                {role === 'CUSTOMER'
                  ? 'Discover amazing food\nfrom home chefs'
                  : 'Share your passion\nand earn'}
              </Text>
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
    minHeight: 52,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: '#E2E4E9',
    borderRadius: 12,
    backgroundColor: '#F8F9FB',
    justifyContent: 'center',
  },
  selected: { backgroundColor: '#FFF0EE', borderColor: colors.flameRedSoft },
  welcomeCard: { paddingHorizontal: 8, paddingVertical: 5, minHeight: 58 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIcon: { backgroundColor: '#FFE0DB' },
  welcomeIcon: { width: 22, height: 22, borderRadius: 11 },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  welcomeLabel: { fontSize: 13 },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.flameRedAccessible,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  description: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  disabled: { opacity: 0.6 },
});
