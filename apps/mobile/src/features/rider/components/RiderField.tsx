import React from 'react';
import {Text, View} from 'react-native';
import {InputField, type InputFieldProps} from '../../../shared/components';
import {font, spacing, themedStyles, typography} from '../theme';

/**
 * The shared InputField with its label, error and helper line drawn in the rider's Day and Night colours (the shared
 * ones are the customer app's, dark on dark by night). The field box itself stays light in both themes.
 */
export function RiderField({label, error, helperText, accessibilityLabel, ...props}: InputFieldProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <InputField {...props} accessibilityLabel={accessibilityLabel ?? label} />
      {error ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : helperText ? (
        <Text style={styles.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(c => ({
  wrap: {gap: spacing.xs},
  label: {fontFamily: font.semibold, fontSize: typography.small, color: c.textPrimary},
  error: {fontFamily: font.semibold, fontSize: typography.small, color: c.redText},
  helper: {fontFamily: font.regular, fontSize: typography.small, color: c.textSecondary},
}));
