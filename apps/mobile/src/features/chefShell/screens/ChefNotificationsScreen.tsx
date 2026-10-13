import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import type {ChefOperationalNotice} from '../api/chefOperationalApi';
import {ChefActionButton, ChefCard, ChefScreen, ChefTopBar, useChefToast} from '../components/ui';
import {formatRelativeTime, formatTimeOfDay} from '../domain/chefFormat';
import {useChefOperationalState} from '../state/ChefOperationalProvider';

type Category = 'orders' | 'money' | 'reviews' | 'plans' | 'other';
type Filter = 'all' | 'orders' | 'money' | 'reviews';

const FILTERS: {id: Filter; label: string}[] = [
  {id: 'all', label: 'All'},
  {id: 'orders', label: 'Orders'},
  {id: 'money', label: 'Money'},
  {id: 'reviews', label: 'Reviews'},
];

const CATEGORY_ICON: Record<Category, {icon: IconName; background: string; foreground: string}> = {
  orders: {icon: 'orders', background: colors.errorSoft, foreground: colors.flameRedAccessible},
  money: {icon: 'wallet', background: colors.successSoft, foreground: colors.successText},
  reviews: {icon: 'star', background: colors.warningSoft, foreground: colors.warningText},
  plans: {icon: 'calendar-check', background: colors.infoSoft, foreground: colors.infoText},
  other: {icon: 'bell', background: colors.iconSurface, foreground: colors.textPrimary},
};

function categoryOf(notice: ChefOperationalNotice): Category {
  const kind = `${notice.noticeType ?? ''} ${notice.targetType ?? ''}`.toUpperCase();
  if (/REVIEW/.test(kind)) return 'reviews';
  if (/PAYOUT|WITHDRAW|EARNING|SETTLEMENT|PAYMENT/.test(kind)) return 'money';
  if (/SUBSCRIPTION|MEAL_PLAN|PLAN/.test(kind)) return 'plans';
  if (/ORDER/.test(kind)) return 'orders';
  return 'other';
}

const isToday = (iso: string, now: Date) => new Date(iso).toDateString() === now.toDateString();

function timeLabel(notice: ChefOperationalNotice, now: Date): string {
  const minutes = (now.getTime() - Date.parse(notice.createdAt)) / 60_000;
  return isToday(notice.createdAt, now) && minutes >= 60
    ? formatTimeOfDay(new Date(notice.createdAt))
    : formatRelativeTime(notice.createdAt, now);
}

const MARK_ALL_FAILED = "We couldn't mark your notifications as read. Try again.";
const MARK_ALL_PARTIAL = 'Some notifications could not be marked as read.';

export function ChefNotificationsScreen() {
  const navigation = useNavigation<NavigationProp<ChefProductStackParamList>>();
  const toast = useChefToast();
  const state = useChefOperationalState();
  const [filter, setFilter] = React.useState<Filter>('all');
  const now = new Date();

  const notices = React.useMemo(
    () => [...state.notices].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [state.notices],
  );
  const unread = notices.filter(notice => notice.readAt === null);
  const unreadBy = (category: Filter) =>
    unread.filter(notice => category === 'all' || categoryOf(notice) === category).length;
  const visible = notices.filter(notice => filter === 'all' || categoryOf(notice) === filter);
  const filterLabel = FILTERS.find(candidate => candidate.id === filter)?.label ?? 'All';
  const groups = [
    {title: 'Today', rows: visible.filter(notice => isToday(notice.createdAt, now))},
    {title: 'Earlier', rows: visible.filter(notice => !isToday(notice.createdAt, now))},
  ].filter(group => group.rows.length > 0);

  const open = (notice: ChefOperationalNotice) => {
    if (notice.readAt === null) {
      state.markNotificationRead(notice.id);
    }
    const category = categoryOf(notice);
    if (category === 'orders' && notice.targetId) {
      navigation.navigate('ChefOrderDetail', {orderId: notice.targetId});
    } else if (category === 'money') {
      navigation.navigate('ChefTabs', {screen: 'Profile', params: {screen: 'ChefPayoutHistory', initial: false}});
    } else if (category === 'reviews') {
      navigation.navigate('ChefTabs', {screen: 'Profile', params: {screen: 'ChefReviews', initial: false}});
    } else if (category === 'plans') {
      navigation.navigate('ChefTabs', {screen: 'Menu', params: {segment: 'plans'}});
    }
  };

  const markAll = () => {
    state
      .markAllNotificationsRead()
      .then(all => {
        if (!all) toast.show(MARK_ALL_PARTIAL);
      })
      .catch(() => toast.show(MARK_ALL_FAILED));
  };

  const refresh = () => {
    state.refresh().catch(() => undefined);
  };

  return (
    <ChefScreen
      header={
        <ChefTopBar
          onBack={() => navigation.goBack()}
          right={
            unread.length > 0 ? (
              <ChefActionButton
                busy={state.markingAllNotificationsRead}
                compact
                label="Mark all read"
                onPress={markAll}
                tone="ghost"
              />
            ) : undefined
          }
          showBell={false}
          title="Notifications"
        />
      }
      onRefresh={refresh}
      refreshing={state.isRefreshing}>
      <View accessibilityRole="tablist" style={styles.filters}>
        {FILTERS.map(({id, label}) => {
          const count = id === 'all' ? 0 : unreadBy(id);
          const selected = filter === id;
          return (
            <Pressable
              accessibilityLabel={count > 0 ? `${label}, ${count} unread` : label}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              key={id}
              onPress={() => setFilter(id)}
              style={[styles.filter, selected && styles.filterOn]}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.filterText, selected && styles.filterTextOn]}>
                {label}
              </Text>
              {count > 0 ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.filterCount, selected && styles.filterTextOn]}>
                  {count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {state.notificationsStatus === 'pending' && notices.length === 0 ? (
        <LoadingIndicator label="Loading notifications" />
      ) : null}

      {state.notificationsStatus === 'error' && notices.length === 0 ? (
        <ChefCard>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.emptyTitle}>
            We couldn't load your notifications
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.emptyMessage}>
            Check your connection and try again.
          </Text>
          <ChefActionButton label="Try again" onPress={refresh} style={styles.retry} tone="neutral" />
        </ChefCard>
      ) : null}

      {state.notificationsStatus === 'success' && visible.length === 0 ? (
        <ChefCard>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.emptyTitle}>
            {filter === 'all' ? 'No notifications yet' : `No ${filterLabel} notifications`}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.emptyMessage}>
            {filter === 'all' ? 'New orders, payouts and reviews will show up here.' : 'Try the All tab to see everything else.'}
          </Text>
        </ChefCard>
      ) : null}

      {groups.map(group => (
        <View key={group.title} style={styles.group}>
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.groupTitle}>
            {group.title}
          </Text>
          <View style={styles.list}>
            {group.rows.map((notice, index) => {
              const tone = CATEGORY_ICON[categoryOf(notice)];
              const unreadRow = notice.readAt === null;
              const time = timeLabel(notice, now);
              return (
                <Pressable
                  accessibilityLabel={`${notice.title}. ${notice.body}. ${time}${unreadRow ? '. Unread' : ''}`}
                  accessibilityRole="button"
                  key={notice.id}
                  onPress={() => open(notice)}
                  style={({pressed}) => [
                    styles.row,
                    index > 0 && styles.rowDivider,
                    unreadRow && styles.rowUnread,
                    pressed && styles.pressed,
                  ]}>
                  <View style={[styles.tile, {backgroundColor: tone.background}]}>
                    <Icon color={tone.foreground} name={tone.icon} size={iconSize.md} surface={false} />
                  </View>
                  <View style={styles.rowText}>
                    <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.rowTitle}>
                      {notice.title}
                    </Text>
                    <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.rowBody}>
                      {notice.body}
                    </Text>
                    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.rowTime}>
                      {time}
                    </Text>
                  </View>
                  {unreadRow ? <View style={styles.dot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  filters: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  filter: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.errorSoft},
  filterText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  filterTextOn: {color: colors.flameRedAccessible},
  filterCount: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.bold},
  group: {gap: spacing.xs},
  groupTitle: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.bold},
  list: {
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.white,
  },
  rowDivider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  rowUnread: {backgroundColor: colors.errorSoft},
  pressed: {opacity: 0.7},
  tile: {width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center'},
  rowText: {flex: 1, minWidth: 0},
  rowTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  rowBody: {color: colors.textSecondary, fontSize: typography.small},
  rowTime: {marginTop: 2, color: colors.textSecondary, fontSize: typography.tiny},
  dot: {width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.flameRedAccessible},
  emptyTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  emptyMessage: {color: colors.textSecondary, fontSize: typography.small},
  retry: {alignSelf: 'stretch', marginTop: spacing.sm},
});
