import React from 'react';
import {Switch} from 'react-native';
import {colors} from '../../../design/tokens';

export interface ChefSwitchProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** A save is running: the switch waits and keeps showing the saved value. */
  busy?: boolean;
  disabled?: boolean;
}

/** The board's green switch. Its label is what a screen reader says, so it names the setting. */
export function ChefSwitch({label, value, onChange, busy = false, disabled = false}: ChefSwitchProps) {
  return (
    <Switch
      accessibilityLabel={label}
      accessibilityState={{busy, checked: value, disabled: disabled || busy}}
      disabled={disabled || busy}
      onValueChange={onChange}
      thumbColor={colors.white}
      trackColor={{false: colors.borderStrong, true: colors.success}}
      value={value}
    />
  );
}
