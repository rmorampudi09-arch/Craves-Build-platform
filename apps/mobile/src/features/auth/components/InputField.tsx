import React from 'react';
import {StyleSheet} from 'react-native';
import {spacing} from '../../../design/tokens';
import {
  InputField as SharedInputField,
  InputFieldProps,
} from '../../../shared/components/InputField';

/**
 * Auth compatibility wrapper. P06 moves the interaction and validation behavior
 * to the shared primitive while preserving P05's vertical field spacing.
 */
export function InputField(props: InputFieldProps) {
  return (
    <SharedInputField
      {...props}
      containerStyle={[styles.authSpacing, props.containerStyle]}
    />
  );
}

const styles = StyleSheet.create({
  authSpacing: {marginTop: spacing.sm},
});
