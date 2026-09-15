import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import type {AuthRole} from '../domain/types';
import {colors, spacing, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';

interface Props { role: AuthRole; compact?: boolean; }

export function AuthHero({role, compact = false}: Props) {
  const customer = role === 'CUSTOMER';
  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View style={styles.copy}>
        <Text style={styles.kicker}>{customer ? 'Hello,' : 'Welcome back,'}</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{customer ? 'Foodie' : 'Chef'}</Text>
          <Icon name={customer ? 'account' : 'chef'} size={32} color={colors.ink}/>
        </View>
        <Text style={styles.subtitle}>
          {customer
            ? 'Order homemade food from trusted local chefs.'
            : 'Access your approved chef account and manage your kitchen with ease.'}
        </Text>
      </View>
      <Image
        source={customer ? require('../../../assets/images/customer-auth-illustration.jpg') : require('../../../assets/images/chef-auth-illustration.jpg')}
        style={[styles.image, compact && styles.compactImage]}
        resizeMode="contain"
        accessibilityLabel={customer ? 'Customer ordering homemade food illustration' : 'Home chef illustration'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {minHeight: 190, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, flexDirection: 'row', alignItems: 'center'},
  compact: {minHeight: 145, paddingTop: spacing.sm},
  copy: {flex: 1, paddingRight: spacing.sm},
  kicker: {fontSize: typography.hero, color: colors.ink, fontWeight: '500'},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2},
  title: {fontSize: typography.title, color: colors.flameRed, fontWeight: '800'},
  subtitle: {fontSize: typography.body, lineHeight: 21, color: colors.textSecondary, marginTop: spacing.sm, maxWidth: 220},
  image: {width: 190, height: 170},
  compactImage: {width: 145, height: 130},
});
