import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefTabParamList, ChefTabRouteName} from '../../../app/navigation/types';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {chefCounterBadgeLabel} from '../domain/chefOperationalCounters';
import {useChefOperationalState} from '../state/ChefOperationalProvider';
import type {ChefOperationalNotice} from '../api/chefOperationalApi';

const CHEF_MENU_ITEMS: readonly {routeName: ChefTabRouteName; label: string}[] = [
  {routeName: 'Dashboard', label: 'Dashboard'},
  {routeName: 'Orders', label: 'Orders'},
  {routeName: 'Menu', label: 'Menu'},
  {routeName: 'Analytics', label: 'Analytics'},
  {routeName: 'Profile', label: 'Profile'},
];

interface Props {
  title: string;
}

export function ChefHeader({title}: Props) {
  const navigation = useNavigation<NavigationProp<ChefTabParamList>>();
  const {
    counters,
    notices,
    notificationsStatus,
    isRefreshing,
    markingNoticeId,
    refresh,
    markNotificationRead,
  } = useChefOperationalState();
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [notificationsVisible, setNotificationsVisible] = React.useState(false);
  const notificationBadge = chefCounterBadgeLabel(counters.unreadNotifications);

  const navigateTo = React.useCallback(
    (routeName: ChefTabRouteName) => {
      setMenuVisible(false);
      navigation.navigate(routeName);
    },
    [navigation],
  );

  const openPayoutHistory = React.useCallback(() => {
    setMenuVisible(false);
    navigation.navigate('Profile', {screen: 'ChefPayoutHistory'});
  }, [navigation]);

  return (
    <>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Chef menu"
          hitSlop={spacing.xs}
          onPress={() => setMenuVisible(true)}
          style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}>
          <View accessibilityElementsHidden style={styles.menuGlyph}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </View>
        </Pressable>

        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            notificationBadge
              ? `Open Chef notifications, ${notificationBadge} unread`
              : 'Open Chef notifications'
          }
          hitSlop={spacing.xs}
          onPress={() => setNotificationsVisible(true)}
          style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}>
          <Icon name="bell" size={22} color={colors.espressoBrown} />
          {notificationBadge ? (
            <View accessibilityElementsHidden style={styles.badge}>
              <Text style={styles.badgeText}>{notificationBadge}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
        transparent
        visible={menuVisible}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Chef menu"
          onPress={() => setMenuVisible(false)}
          style={styles.backdrop}>
          <View style={styles.menuPanel}>
            <Text accessibilityRole="header" style={styles.panelTitle}>
              Chef workspace
            </Text>
            <Text style={styles.counterSummary}>
              {counters.pendingAcceptance} new · {counters.activeOrders} active · {counters.readyForPickup} ready
            </Text>
            {CHEF_MENU_ITEMS.map(item => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.label}`}
                key={item.routeName}
                onPress={() => navigateTo(item.routeName)}
                style={({pressed}) => [styles.menuRow, pressed && styles.pressed]}>
                <Text style={styles.menuRowText}>{item.label}</Text>
                <Icon name="chevron-right" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Payout history"
              onPress={openPayoutHistory}
              style={({pressed}) => [styles.menuRow, pressed && styles.pressed]}>
              <Text style={styles.menuRowText}>Payout history</Text>
              <Icon name="chevron-right" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setNotificationsVisible(false)}
        transparent
        visible={notificationsVisible}>
        <View style={styles.notificationBackdrop}>
          <View style={styles.notificationPanel}>
            <View style={styles.panelHeader}>
              <View style={styles.panelHeaderCopy}>
                <Text accessibilityRole="header" style={styles.panelTitle}>
                  Notifications
                </Text>
                <Text style={styles.panelSubtitle}>
                  {counters.unreadNotifications} unread
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Chef notifications"
                onPress={() => setNotificationsVisible(false)}
                style={({pressed}) => [styles.closeButton, pressed && styles.pressed]}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            {notificationsStatus === 'pending' && notices.length === 0 ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={colors.flameRed} />
                <Text style={styles.stateText}>Loading notifications…</Text>
              </View>
            ) : notificationsStatus === 'error' && notices.length === 0 ? (
              <View style={styles.centerState}>
                <Text style={styles.stateTitle}>Notifications unavailable</Text>
                <Text style={styles.stateText}>Try again when your connection is available.</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry Chef notifications"
                  disabled={isRefreshing}
                  onPress={() => {
                    refresh().catch(() => undefined);
                  }}
                  style={({pressed}) => [
                    styles.retryButton,
                    (pressed || isRefreshing) && styles.pressed,
                  ]}>
                  <Text style={styles.retryText}>{isRefreshing ? 'Refreshing…' : 'Try again'}</Text>
                </Pressable>
              </View>
            ) : notices.length === 0 ? (
              <View style={styles.centerState}>
                <Text style={styles.stateTitle}>No notifications yet</Text>
                <Text style={styles.stateText}>New Chef updates will appear here.</Text>
              </View>
            ) : (
              <FlatList
                contentContainerStyle={styles.notificationList}
                data={notices}
                keyExtractor={notice => notice.id}
                renderItem={({item}) => (
                  <NotificationRow
                    notice={item}
                    marking={markingNoticeId === item.id}
                    onMarkRead={markNotificationRead}
                  />
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function NotificationRow({
  notice,
  marking,
  onMarkRead,
}: {
  notice: ChefOperationalNotice;
  marking: boolean;
  onMarkRead: (noticeId: string) => void;
}) {
  const unread = notice.readAt === null;
  return (
    <View style={[styles.notificationRow, unread && styles.notificationRowUnread]}>
      <View style={styles.notificationCopy}>
        <Text style={styles.notificationTitle}>{notice.title}</Text>
        <Text style={styles.notificationBody}>{notice.body}</Text>
      </View>
      {unread ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mark ${notice.title} as read`}
          disabled={marking}
          onPress={() => onMarkRead(notice.id)}
          style={({pressed}) => [styles.readButton, (pressed || marking) && styles.pressed]}>
          <Text style={styles.readButtonText}>{marking ? 'Saving…' : 'Mark read'}</Text>
        </Pressable>
      ) : (
        <Text accessibilityLabel={`${notice.title} read`} style={styles.readLabel}>
          Read
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGlyph: {width: 22, gap: 4},
  menuLine: {height: 2, borderRadius: radius.pill, backgroundColor: colors.espressoBrown},
  title: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.6},
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {color: colors.white, fontSize: 9, fontWeight: fontWeight.bold},
  backdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(38,26,21,0.32)',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  menuPanel: {
    width: '82%',
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  panelTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  counterSummary: {marginTop: spacing.xs, marginBottom: spacing.sm, color: colors.textSecondary, fontSize: typography.small},
  menuRow: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  menuRowText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  notificationBackdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(38,26,21,0.32)'},
  notificationPanel: {
    maxHeight: '78%',
    minHeight: 320,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    paddingTop: spacing.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panelHeaderCopy: {flex: 1},
  panelSubtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  closeButton: {minHeight: touchTarget.minimum, justifyContent: 'center', paddingHorizontal: spacing.sm},
  closeText: {color: colors.flameRed, fontSize: typography.body, fontWeight: fontWeight.semibold},
  centerState: {minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: spacing.xl},
  stateTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold, textAlign: 'center'},
  stateText: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  retryButton: {minHeight: touchTarget.minimum, marginTop: spacing.md, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.flameRed, paddingHorizontal: spacing.lg},
  retryText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.semibold},
  notificationList: {padding: spacing.md, gap: spacing.sm},
  notificationRow: {borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.white},
  notificationRowUnread: {backgroundColor: colors.surfaceWarm},
  notificationCopy: {minWidth: 0},
  notificationTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  notificationBody: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small},
  readButton: {alignSelf: 'flex-start', minHeight: touchTarget.minimum, justifyContent: 'center', marginTop: spacing.xs, paddingRight: spacing.sm},
  readButtonText: {color: colors.flameRed, fontSize: typography.small, fontWeight: fontWeight.semibold},
  readLabel: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small},
});
