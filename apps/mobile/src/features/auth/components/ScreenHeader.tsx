import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Icon} from '../../../shared/components/Icon';
import {colors, spacing, typography} from '../../../design/tokens';

export function ScreenHeader({title, onBack}: {title: string; onBack?: () => void}) {
  return (
    <View style={styles.row}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={onBack}><Icon name="arrow-left"/></Pressable> : <View style={styles.spacer}/>} 
      <Text style={styles.title}>{title}</Text><View style={styles.spacer}/>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl},
  spacer: {width: 24},
  title: {fontSize: typography.heading, fontWeight: '700', color: colors.ink},
});
