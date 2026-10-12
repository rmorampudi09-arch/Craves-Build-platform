import React from 'react';
import {InteractionManager, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, iconSize, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {KitchenStatusSheet} from '../../chefDashboard/components/KitchenStatusSheet';
import {useKitchenOpenState, type KitchenPauseDuration} from '../../chefProfile/state/useKitchenOpenState';
import {ChefActionButton, ChefCard, ConfirmDialog, useChefToast} from '../../chefShell/components/ui';
import {formatTimeOfDay} from '../../chefShell/domain/chefFormat';
import {useChefMenuPrepTimes} from '../state/useChefMenuPrepTimes';

const KITCHEN_UPDATE_FAILED = "We couldn't update your kitchen. Check your connection and try again.";

/** "Kitchen is open · 12 of 16 dishes available · Change", under the empty New list. Change opens the Kitchen status sheet. */
export function KitchenStatusCard({cookingCount, onChangeHours}: {cookingCount: number; onChangeHours: () => void}) {
  const kitchen = useKitchenOpenState();
  const menu = useChefMenuPrepTimes();
  const toast = useChefToast();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [confirmClose, setConfirmClose] = React.useState(false);

  // Two Modals swapping in one tick misbehave on Android: close the sheet first, then run what comes next once it is gone.
  const afterSheetClosed = React.useRef<(() => void) | null>(null);
  const closeSheetThen = (next: () => void) => {
    afterSheetClosed.current = next;
    setSheetOpen(false);
  };
  React.useEffect(() => {
    if (sheetOpen || !afterSheetClosed.current) {
      return undefined;
    }
    const next = afterSheetClosed.current;
    afterSheetClosed.current = null;
    const task = InteractionManager.runAfterInteractions(next);
    return () => task.cancel();
  }, [sheetOpen]);

  if (kitchen.status === 'unknown') {
    return null;
  }

  const change = async (action: () => Promise<boolean>, done: string) => {
    setSheetOpen(false);
    try {
      // false: another save was still running and this press did nothing, so there is nothing to announce.
      if (await action()) {
        toast.show(done);
      }
    } catch {
      toast.show(KITCHEN_UPDATE_FAILED);
    }
  };
  const closeKitchen = () => change(() => kitchen.setOpen(false), 'Your kitchen is closed');

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
            <ChefActionButton compact label="Change" onPress={() => setSheetOpen(true)} tone="ghost" />
          )}
        </View>
      </ChefCard>

      <KitchenStatusSheet
        busy={kitchen.saving}
        closedReason={kitchen.closedReason}
        hoursToday={kitchen.hoursToday}
        onChangeHours={() => closeSheetThen(onChangeHours)}
        onClose={() => setSheetOpen(false)}
        onCloseKitchen={() => (cookingCount > 0 ? closeSheetThen(() => setConfirmClose(true)) : closeKitchen().catch(() => undefined))}
        onOpen={() => change(() => kitchen.setOpen(true), 'Your kitchen is open').catch(() => undefined)}
        onPause={(duration: KitchenPauseDuration) => change(() => kitchen.pause(duration), 'New orders paused').catch(() => undefined)}
        onResume={() => change(() => kitchen.resume(), 'Taking orders again').catch(() => undefined)}
        opensAt={kitchen.opensAt}
        pauseAvailable={kitchen.pauseAvailable}
        pausedUntil={kitchen.pausedUntil}
        status={kitchen.status}
        visible={sheetOpen}
      />
      <ConfirmDialog
        cancelLabel="Keep open"
        confirmLabel="Close kitchen"
        message={`${cookingCount} ${cookingCount === 1 ? 'order is' : 'orders are'} still cooking. They carry on, but you won't get new orders until you open the kitchen again.`}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          closeKitchen().catch(() => undefined);
        }}
        title="Close your kitchen?"
        tone="danger"
        visible={confirmClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  text: {flex: 1, minWidth: 0},
  title: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  detail: {color: colors.textSecondary, fontSize: typography.small},
});
