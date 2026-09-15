import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon} from '../../../shared/components/Icon';
import {colors, spacing, typography} from '../../../design/tokens';

export function SecurityNote() {
  return (
    <View style={styles.wrap}>
      <Icon name="shield" size={21} color={colors.success}/>
      <Text style={styles.text}>Tokens are exchanged with Craves APIM and sensitive refresh credentials are protected by Android secure storage.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', marginTop: spacing.xl, gap: spacing.xs},
  text: {fontSize: typography.tiny, lineHeight: 16, color: colors.textSecondary, textAlign: 'center', maxWidth: 310},
});
