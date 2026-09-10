import React from 'react';
import {StyleSheet} from 'react-native';
import {spacing} from '../../../design/tokens';
import {
  Button,
  ButtonProps,
} from '../../../shared/components/Button';

/**
 * Auth compatibility wrapper. New feature code should use the shared Button
 * directly; keeping this export avoids changing P05 screen behavior in P06.
 */
export function PrimaryButton(props: ButtonProps) {
  return <Button {...props} style={[styles.authSpacing, props.style]} />;
}

const styles = StyleSheet.create({
  authSpacing: {marginTop: spacing.md},
});
