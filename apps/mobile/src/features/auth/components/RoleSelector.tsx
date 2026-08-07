import React from 'react';
import {StyleSheet} from 'react-native';
import {spacing} from '../../../design/tokens';
import {SegmentedControl} from '../../../shared/components/SegmentedControl';
import type {AuthRole} from '../domain/types';

interface Props {
  value: AuthRole;
  onChange: (role: AuthRole) => void;
  disabled?: boolean;
}

const options = [
  {value: 'CUSTOMER', label: 'Customer'},
  {value: 'CHEF', label: 'Chef'},
] as const;

export function RoleSelector({value, onChange, disabled = false}: Props) {
  return (
    <SegmentedControl<AuthRole>
      accessibilityLabel="Account type"
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      style={styles.wrapper}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
});
