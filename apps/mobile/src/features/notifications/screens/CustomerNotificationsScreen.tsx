import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import {
  inboundRouteDedupe,
  type InboundRouteDestination,
} from '../../../app/navigation/inboundRouting';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {unreadNoticeCount, type CustomerNotice} from '../../customerShell/api/customerShellApi';
import {
  CUSTOMER_NOTIFICATION_CATEGORIES,
  buildCustomerNotificationCategoryCounts,
  filterCustomerNotifications,
  formatCustomerNotificationTimestamp,
  groupCustomerNotifications,
  resolveCustomerNotificationCategory,
  resolveCustomerNotificationDestination,
  type CustomerNotificationCategory,
} from '../domain/customerNotificationsModel';
import {
  CUSTOMER_NOTIFICATION_LIMIT,
  useCustomerNotificationsListQuery,
  useMarkCustomerNotificationRead,
} from '../query/customerNotificationQueries';

type NotificationsNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerNotifications'
>;

type NotificationSection = {
  title: 'Today' | 'Earlier';
  data: CustomerNotice[];
};

function NotificationSkeleton() {
  return (
    <View accessibilityLabel="Loading notifications" accessibilityRole="progressbar" style={styles.skeletonWrap}>
      <View style={styles.skeletonHeader} />
      <View style={styles.skeletonRow} />
      <View style={styles.skeletonRow} />
      <View style={styles.skeletonRow} />
    </View>
  );
}

function iconForNotice(notice: CustomerNotice): IconName {
  switch (resolveCustomerNotificationCategory(notice)) {
    case 'ORDERS':
      return 'orders';
    case 'OFFERS':
      return 'heart';
    case 'UPDATES':
      return 'bell';
    case 'OTHER':
      return 'mail';
  }
}

function NotificationRow({notice, onPress}: {notice: CustomerNotice; onPress: () => void}) {
  const unread = notice.readAt === null;
  return (
    <Pressable
      accessibilityHint="Marks this notification read, then opens a validated destination when one is available"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${notice.title}. ${notice.body}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.noticeRow,
        unread && styles.noticeRowUnread,
        pressed && styles.noticeRowPressed,
      ]}>
      <View style={styles.noticeIcon}>
        <Icon name={iconForNotice(notice)} size={iconSize.sm} color={colors.flameRed} />
      </View>
      <View style={styles.noticeCopy}>
        <View style={styles.noticeTitleRow}>
          <Text numberOfLines={2} style={[styles.noticeTitle, unread && styles.noticeTitleUnread]}>
            {notice.title}
          </Text>
          {unread ? <View accessibilityElementsHidden style={styles.unreadDot} /> : null}
        </View>
        <Text numberOfLines={3} style={styles.noticeBody}>
          {notice.body}
        </Text>
        <Text style={styles.noticeTime}>{formatCustomerNotificationTimestamp(notice.createdAt)}</Text>
      </View>
      <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} />
    </Pressable>
  );
}

/**
 * P62 implements the empty-cart Notifications reference. It intentionally does
 * not mount SharedViewCartOverlay; P63 owns the active-cart variant.
 */
export function CustomerNotificationsScreen() {
  const navigation = useNavigation<NotificationsNavigation>();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const notificationsQuery = useCustomerNotificationsListQuery();
  const markRead = useMarkCustomerNotificationRead();
  const pendingOpenIds = useRef(new Set<string>());
  const [selectedCategory, setSelectedCategory] = useState<CustomerNotificationCategory>('ALL');
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);

  const notices = useMemo(
    () => notificationsQuery.data ?? [],
    [notificationsQuery.data],
  );
  const counts = useMemo(() => buildCustomerNotificationCategoryCounts(notices), [notices]);
  const filtered = useMemo(
    () => filterCustomerNotifications(notices, selectedCategory),
    [notices, selectedCategory],
  );
  const groups = useMemo(() => groupCustomerNotifications(filtered), [filtered]);
  const sections = useMemo<NotificationSection[]>(
    () => groups.map(group => ({title: group.title, data: group.notices})),
    [groups],
  );
  const unreadCount = unreadNoticeCount(notices);

  const refresh = useCallback(() => {
    notificationsQuery.refetch().catch(() => undefined);
  }, [notificationsQuery]);

  const openNotice = useCallback(
    async (notice: CustomerNotice) => {
      if (pendingOpenIds.current.has(notice.id)) {
        return;
      }
      pendingOpenIds.current.add(notice.id);

      try {
        if (notice.readAt === null) {
          try {
            await markRead.mutateAsync(notice.id);
          } catch {
            Alert.alert(
              'Notification could not be marked read',
              'Please try again before opening this notification.',
            );
            return;
          }
        }

        const destination = resolveCustomerNotificationDestination(notice);
        if (!destination) {
          return;
        }

        let inboundDestination: InboundRouteDestination;
        if (destination.route === 'CustomerOrderTracking') {
          inboundDestination = {
            kind: 'CUSTOMER_ORDER_TRACKING',
            orderId: destination.orderId,
          };
        } else if (destination.route === 'CustomerKitchenProfile') {
          inboundDestination = {
            kind: 'CUSTOMER_KITCHEN_PROFILE',
            kitchenId: destination.kitchenId,
          };
        } else {
          inboundDestination = {
            kind: 'CUSTOMER_ORDER_DETAIL',
            orderId: destination.orderId,
          };
        }

        if (!inboundRouteDedupe.claim(inboundDestination)) {
          return;
        }

        try {
          if (destination.route === 'CustomerOrderTracking') {
            navigation.navigate('CustomerOrderTracking', {orderId: destination.orderId});
            return;
          }
          if (destination.route === 'CustomerKitchenProfile') {
            navigation.navigate('CustomerKitchenProfile', {kitchenId: destination.kitchenId});
            return;
          }
          navigation.navigate('CustomerOrderDetail', {orderId: destination.orderId});
        } catch {
          inboundRouteDedupe.release(inboundDestination);
        }
      } finally {
        pendingOpenIds.current.delete(notice.id);
      }
    },
    [markRead, navigation],
  );

  const listEmpty = (() => {
    if (notificationsQuery.sessionRequired) {
      return (
        <TerminalState
          title="Sign in required"
          description="Notifications are private to your customer account."
        />
      );
    }
    if (notificationsQuery.isPending) {
      return <NotificationSkeleton />;
    }
    if (notificationsQuery.isError) {
      return (
        <TerminalState
          title="Notifications could not be loaded"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={refresh}
        />
      );
    }
    if (notices.length === 0) {
      return (
        <TerminalState
          title="No notifications yet"
          description="Order, offer, kitchen and account updates will appear here when they arrive."
          actionLabel="Refresh"
          onAction={refresh}
        />
      );
    }
    if (filtered.length === 0) {
      return (
        <View style={styles.emptyCategoryCard}>
          <Text style={styles.emptyCategoryTitle}>Nothing in this category</Text>
          <Text style={styles.emptyCategoryCopy}>Try another notification category.</Text>
        </View>
      );
    }
    return null;
  })();

  const categoryChips = notices.length > 0 ? (
    <ScrollView
      contentContainerStyle={styles.chips}
      horizontal
      showsHorizontalScrollIndicator={false}>
      {CUSTOMER_NOTIFICATION_CATEGORIES.map(category => {
        const selected = selectedCategory === category.id;
        return (
          <Pressable
            accessibilityLabel={`${category.label}, ${counts[category.id]}`}
            accessibilityRole="button"
            accessibilityState={{selected}}
            key={category.id}
            onPress={() => setSelectedCategory(category.id)}
            style={[styles.chip, selected && styles.chipSelected]}>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {category.label} {counts[category.id]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  ) : null;

  const showLoadedNotifications =
    !notificationsQuery.sessionRequired &&
    !notificationsQuery.isPending &&
    !notificationsQuery.isError;

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-notifications">
      <View style={styles.root}>
        <CustomerHeader
          title="Notifications"
          onPressLocation={() => setLocationSelectorVisible(true)}
          onPressNotifications={refresh}
        />
        <View style={styles.toolbar}>
          <View>
            <Text accessibilityRole="header" style={styles.title}>Notifications</Text>
            <Text accessibilityLiveRegion="polite" style={styles.subtitle}>
              {unreadCount > 0 ? `${unreadCount} unread in the latest list` : 'You are caught up'}
            </Text>
          </View>
          <Pressable
            accessibilityHint="Temporarily unavailable because the server does not expose an aggregate mark-all-read operation"
            accessibilityLabel="Mark all as read"
            accessibilityRole="button"
            accessibilityState={{disabled: true}}
            disabled
            style={styles.markAllDisabled}>
            <Text style={styles.markAllDisabledText}>Mark all as read</Text>
          </Pressable>
        </View>
        {unreadCount > 0 ? (
          <Text style={styles.markAllReason}>Mark all is temporarily unavailable.</Text>
        ) : null}
        <SectionList
          contentContainerStyle={styles.listContent}
          initialNumToRender={12}
          keyExtractor={notice => notice.id}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={
            showLoadedNotifications && notices.length === CUSTOMER_NOTIFICATION_LIMIT ? (
              <Text style={styles.boundaryCopy}>Older notifications may not be shown yet.</Text>
            ) : null
          }
          ListHeaderComponent={showLoadedNotifications ? categoryChips : null}
          maxToRenderPerBatch={10}
          onScroll={bottomNavScroll.onScroll}
          refreshControl={
            notificationsQuery.sessionRequired ? undefined : (
              <RefreshControl
                colors={[colors.flameRed]}
                onRefresh={refresh}
                refreshing={notificationsQuery.isRefetching}
                tintColor={colors.flameRed}
              />
            )
          }
          renderItem={({item, index, section}) => {
            const first = index === 0;
            const last = index === section.data.length - 1;
            return (
              <View
                style={[
                  styles.noticeCell,
                  first && styles.noticeCellFirst,
                  last && styles.noticeCellLast,
                ]}>
                {!first ? <View style={styles.divider} /> : null}
                <NotificationRow notice={item} onPress={() => openNotice(item)} />
              </View>
            );
          }}
          renderSectionHeader={({section}) => (
            <Text style={styles.groupTitle}>{section.title}</Text>
          )}
          scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
          sections={showLoadedNotifications ? sections : []}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          windowSize={7}
        />
        <CustomerLocationSelector
          visible={locationSelectorVisible}
          onClose={() => setLocationSelectorVisible(false)}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.surfaceWarm},
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.surfaceWarm,
  },
  title: {color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.bold},
  subtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  markAllDisabled: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    opacity: 0.65,
  },
  markAllDisabledText: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  markAllReason: {paddingHorizontal: spacing.md, paddingTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny, backgroundColor: colors.surfaceWarm},
  listContent: {flexGrow: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl},
  chips: {gap: spacing.xs, paddingVertical: spacing.xs, marginBottom: spacing.sm},
  chip: {minHeight: touchTarget.minimum, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: borderWidth.standard, borderColor: colors.borderStrong, backgroundColor: colors.white},
  chipSelected: {borderColor: colors.flameRed, backgroundColor: colors.flameRed},
  chipText: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  chipTextSelected: {color: colors.white},
  groupTitle: {marginTop: spacing.sm, marginBottom: spacing.xs, color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  noticeCell: {borderLeftWidth: borderWidth.standard, borderRightWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, overflow: 'hidden'},
  noticeCellFirst: {borderTopWidth: borderWidth.standard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg},
  noticeCellLast: {marginBottom: spacing.sm, borderBottomWidth: borderWidth.standard, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg},
  noticeRow: {minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.white},
  noticeRowUnread: {backgroundColor: colors.surfaceWarm},
  noticeRowPressed: {backgroundColor: colors.surfaceMuted},
  noticeIcon: {width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: borderWidth.standard, borderColor: colors.creamDeep},
  noticeCopy: {minWidth: 0, flex: 1},
  noticeTitleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  noticeTitle: {minWidth: 0, flex: 1, color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.semibold},
  noticeTitleUnread: {fontWeight: fontWeight.bold},
  unreadDot: {width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.flameRed},
  noticeBody: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  noticeTime: {marginTop: spacing.xs, color: colors.placeholder, fontSize: typography.tiny},
  divider: {height: borderWidth.standard, marginLeft: 72, backgroundColor: colors.border},
  emptyCategoryCard: {minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  emptyCategoryTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  emptyCategoryCopy: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small},
  boundaryCopy: {marginTop: spacing.sm, textAlign: 'center', color: colors.textSecondary, fontSize: typography.tiny},
  skeletonWrap: {gap: spacing.sm},
  skeletonHeader: {height: 52, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted},
  skeletonRow: {height: 104, borderRadius: radius.lg, backgroundColor: colors.white},
});
