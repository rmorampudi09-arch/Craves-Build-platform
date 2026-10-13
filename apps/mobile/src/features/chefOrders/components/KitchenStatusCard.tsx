import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, iconSize, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {useKitchenStatusControl} from '../../chefDashboard/components/useKitchenStatusControl';
import {useKitchenOpenState} from '../../chefProfile/state/useKitchenOpenState';
import {ChefActionButton, ChefCard} from '../../chefShell/components/ui';
import {formatTimeOfDay} from '../../chefShell/domain/chefFormat';
import {useChefMenuPrepTimes} from '../state/useChefMenuPrepTimes';

/**
 * "Kitchen is open · 12 of 16 dishes available · Change", under the empty New list. Change opens the Kitchen status
 * sheet, the same one Home opens. `cookingCount` is the orders being cooked now (accepted and preparing).
 */
export function KitchenStatusCard({cookingCount, onChangeHours}: {cookingCount: number; onChangeHours: () => void}) {
  const kitchen = useKitchenOpenState();
  const menu = useChefMenuPrepTimes();
  const control = useKitchenStatusControl(kitchen, cookingCount, onChangeHours);

  if (kitchen.status === 'unknown') {
    return null;
  }

  const active = menu.filter(item => item.status === 'ACTIVE');
  const sellable = active.filter(item => item.available).length;
  const title =
    kitchen.status === 'open'
      ? 'Kitchen is open'
      : kitchen.status === 'paused'
        ? kitchen.pausedUntil
          ? `New orders paused until ${formatTimeOfDay(new Date(kitchen.pausedUntil))}`
          : 'New orders paused'
        : kitchen.status === 'suspended'
          ? 'Paused by Craves'
          : 'Kitchen is closed';
  const good = kitchen.status === 'open';

  return (
    <>
      <ChefCard>
        <View style={styles.row}>
          <Icon
            color={good ? colors.successText : colors.warningText}
            name="store"
            size={iconSize.lg}
            surface={false}
          />
          <View style={styles.text}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
              {title}
            </Text>
            {active.length > 0 ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.detail}>
                {`${sellable} of ${active.length} dishes available`}
              </Text>
            ) : null}
          </View>
          {kitchen.status === 'suspended' ? null : (
            <ChefActionButton compact label="Change" onPress={control.openSheet} tone="ghost" />
          )}
        </View>
      </ChefCard>
      {control.dialogs}
    </>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  text: {flex: 1, minWidth: 0},
  title: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  detail: {color: colors.textSecondary, fontSize: typography.small},
});
