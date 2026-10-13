import React from 'react';
import {AppState, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type CompositeNavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {ChefProductStackParamList, ChefTabParamList} from '../../../app/navigation/types';
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
import {Icon} from '../../../shared/components/Icon';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefTopBar,
  ListGroup,
  ListRow,
  StatTile,
  useChefToast,
} from '../../chefShell/components/ui';
import {formatDayLabel, formatRupees} from '../../chefShell/domain/chefFormat';
import {useChefReviewPreview} from '../../reviews/query/useChefReviewPreview';
import {DateRangeSheet} from '../components/DateRangeSheet';
import {DayOrdersSheet} from '../components/DayOrdersSheet';
import {EarningsBalanceCard} from '../components/EarningsBalanceCard';
import {EarningsBanner} from '../components/EarningsBanner';
import {EarnedEachDayCard, OrdersSplitCard, TopDishesCard} from '../components/EarningsCards';
import {WithdrawSheet} from '../components/WithdrawSheet';
import {
  MAX_HISTORY_ORDERS,
  earningsPreviousBounds,
  earningsRangeBounds,
  ordersOnDay,
  summarizeEarnings,
  type EarningsRange,
} from '../domain/chefEarningsSummary';
import {
  MONTH_NAMES,
  bankSummaryLine,
  onHoldAmount,
  withdrawBlockedReason,
} from '../domain/chefPayoutPresentation';
import {useChefEarningsData} from '../state/useChefEarningsData';
import {useChefWithdrawal} from '../state/useChefWithdrawal';

type EarningsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<ChefTabParamList, 'Earnings'>,
  NativeStackNavigationProp<ChefProductStackParamList>
>;

const PRESETS = [
  {range: 'today', label: 'Today'},
  {range: 'week', label: 'This week'},
  {range: 'month', label: 'This month'},
] as const;

/** Words for the chosen period: the orders card title, the "no sales" line and what the % compares with. */
const PERIOD_WORDS = {
  today: {orders: 'Orders today', none: 'No sales today', previous: 'yesterday'},
  week: {orders: 'Orders this week', none: 'No sales this week', previous: 'last week'},
  month: {orders: 'Orders this month', none: 'No sales this month', previous: 'last month'},
  custom: {orders: 'Orders in this period', none: 'No sales in this period', previous: 'the days before'},
} as const;

const dayText = (date: Date) => `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;

function Chip({label, selected, icon, onPress}: {label: string; selected: boolean; icon?: 'calendar'; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}>
      {icon ? (
        <Icon color={selected ? colors.flameRedAccessible : colors.textPrimary} name={icon} size={iconSize.xs} surface={false} />
      ) : null}
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.chipText, selected && styles.chipTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChefEarningsScreen() {
  const navigation = useNavigation<EarningsNavigation>();
  const route = useRoute<RouteProp<ChefTabParamList, 'Earnings'>>();
  const toast = useChefToast();
  const [range, setRange] = React.useState<EarningsRange>('week');
  const [sheet, setSheet] = React.useState<'withdraw' | 'dates' | 'day' | null>(null);
  const [dayIndex, setDayIndex] = React.useState(0);

  // The clock the page works from. It is read again when the screen comes back into view or the app is opened,
  // so "Today" and the week move on at midnight instead of staying on the day the page was first shown.
  const [now, setNow] = React.useState(() => new Date());
  useFocusEffect(
    React.useCallback(() => {
      setNow(new Date());
    }, []),
  );
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(new Date());
    });
    return () => subscription.remove();
  }, []);

  const bounds = earningsRangeBounds(range, now);
  // Orders are read back to the start of the period before the range too, so the order change has something to compare with.
  const data = useChefEarningsData({historyFrom: earningsPreviousBounds(range, now).from});
  const reviews = useChefReviewPreview();
  const withdrawal = useChefWithdrawal({onSettled: data.afterWithdrawal});
  const {balance, balanceStatus, bank} = data;
  const block = balance ? withdrawBlockedReason(balance, bank) : null;

  const {orders, ledger, ledgerLimit, historyIncomplete} = data;
  const summary = React.useMemo(
    () =>
      summarizeEarnings({
        orders,
        earnings: ledger,
        range,
        now,
        earningsLimit: ledgerLimit,
        ordersCutOff: historyIncomplete,
      }),
    [orders, ledger, ledgerLimit, historyIncomplete, range, now],
  );

  // Home's Withdraw lands here with openWithdraw: open the sheet once the balance is known, then forget the request.
  const openWithdraw = route.params?.openWithdraw;
  React.useEffect(() => {
    if (!openWithdraw || balanceStatus === 'pending') return;
    navigation.setParams({openWithdraw: undefined});
    if (balance && !withdrawBlockedReason(balance, bank)) setSheet('withdraw');
  }, [openWithdraw, balanceStatus, balance, bank, navigation]);

  // Whatever the answer was, the sheet has done its job; the result shows on the page.
  React.useEffect(() => {
    if (!withdrawal.busy && withdrawal.notice) setSheet(open => (open === 'withdraw' ? null : open));
  }, [withdrawal.busy, withdrawal.notice]);

  // Two Modals swapping in one tick misbehave on Android: close the sheet first, then go on to the next screen on the next frame.
  const afterSheet = React.useRef<(() => void) | null>(null);
  const openSheet = React.useRef(sheet);
  openSheet.current = sheet;
  const closeSheetThen = (next: () => void) => {
    // With no sheet open there is nothing to wait for. Left pending, it would fire when some later sheet closes.
    if (openSheet.current === null) {
      next();
      return;
    }
    afterSheet.current = next;
    setSheet(null);
  };
  React.useEffect(() => {
    if (sheet !== null || !afterSheet.current) return undefined;
    const next = afterSheet.current;
    afterSheet.current = null;
    const frame = requestAnimationFrame(next);
    return () => cancelAnimationFrame(frame);
  }, [sheet]);

  const openHistory = () =>
    navigation.navigate('Profile', {screen: 'ChefPayoutHistory', params: {from: 'earnings'}, initial: false});
  const openBank = () =>
    navigation.navigate('Profile', {screen: 'ChefBankAccount', params: {from: 'earnings'}, initial: false});

  const words = PERIOD_WORDS[typeof range === 'string' ? range : 'custom'];
  const lastDay = new Date(bounds.to.getFullYear(), bounds.to.getMonth(), bounds.to.getDate() - 1);
  const periodText = `${dayText(bounds.from)}${bounds.from.getTime() === lastDay.getTime() ? '' : ` – ${dayText(lastDay)}`}`;
  const notice = withdrawal.notice;
  const bankName = bank?.bankName ? `${bank.bankName} ` : '';

  const loading = data.ledgerStatus === 'pending' || data.ordersStatus === 'pending';
  // A failed refresh keeps the numbers already on screen; only a read that never worked is an error.
  const ledgerFailed = data.ledgerStatus === 'error' && data.ledger.length === 0;
  const ordersFailed = data.ordersStatus === 'error' && data.orders.length === 0;
  const failed = ledgerFailed || ordersFailed;
  const empty =
    summary.earned === 0 && summary.delivered === 0 && summary.split.cancelled + summary.split.rejected === 0;
  const accountEmpty = data.ledger.length === 0 && data.orders.length === 0;
  const oldestEntry = data.ledger.length > 0 ? Date.parse(data.ledger[data.ledger.length - 1].createdAt) : NaN;
  const cutOff = data.ledger.length >= data.ledgerLimit && oldestEntry > bounds.from.getTime();
  // The orders held are only the latest ones: counts from before the oldest of them may be understated.
  const latestOnly = data.orders.length > 0 && !data.historyLoading && !data.coversFrom(bounds.from);
  const dayOfBar = new Date(bounds.from.getFullYear(), bounds.from.getMonth(), bounds.from.getDate() + dayIndex);
  const dayLabel = formatDayLabel(dayOfBar, now, {weekday: true});

  const change = summary.changeVsPrevious;
  const trend =
    change === null || change === 0
      ? undefined
      : {
          text: `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}% vs ${words.previous}`,
          direction: change > 0 ? ('up' as const) : ('down' as const),
        };
  const moved = summary.deliveredChange;
  const deliveredTrend =
    moved === null || moved === 0
      ? undefined
      : {text: `${moved > 0 ? '▲' : '▼'} ${Math.abs(moved)}`, direction: moved > 0 ? ('up' as const) : ('down' as const)};
  const reviewCount = reviews.summary?.reviewCount ?? 0;
  const average = reviews.summary?.overallAverage;

  return (
    <>
      <ChefScreen
        header={<ChefTopBar title="Earnings" />}
        onRefresh={() => {
          withdrawal.dismiss();
          data.refresh().catch(() => undefined);
        }}
        refreshing={data.isRefreshing}
        withTabBar>
        <EarningsBalanceCard
          balance={balance}
          block={block}
          failed={balanceStatus === 'error'}
          locked={withdrawal.busy || withdrawal.uncertain}
          onAddBank={openBank}
          onHistory={openHistory}
          onWithdraw={() => setSheet('withdraw')}
          onHold={balance ? onHoldAmount(balance) : 0}
        />

        {notice?.kind === 'sent' ? (
          <EarningsBanner
            body={bank?.lastFour ? `Sent to ${bankName}••${bank.lastFour}. Track it in Payout history.` : 'Track it in Payout history.'}
            title={`${formatRupees(Number(notice.amount))} is on its way`}
            tone="success"
          />
        ) : null}
        {notice?.kind === 'failed' ? (
          <EarningsBanner body={notice.message} title="Your withdrawal didn't go through" tone="error" />
        ) : null}
        {notice?.kind === 'uncertain' ? (
          <EarningsBanner
            action={{label: 'Check withdrawal status', busy: withdrawal.busy, onPress: withdrawal.resolve}}
            body="Please don't ask again. Check its status first."
            title="We couldn't confirm your withdrawal"
            tone="warning"
          />
        ) : null}

        <ScrollView
          contentContainerStyle={styles.chips}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}>
          {PRESETS.map(preset => (
            <Chip key={preset.range} label={preset.label} onPress={() => setRange(preset.range)} selected={range === preset.range} />
          ))}
          <Chip
            icon="calendar"
            label={typeof range === 'object' ? periodText : 'Pick dates'}
            onPress={() => setSheet('dates')}
            selected={typeof range === 'object'}
          />
        </ScrollView>

        {loading ? (
          <LoadingIndicator label="Loading your earnings" />
        ) : failed ? (
          <ChefCard style={styles.gap}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
              {ledgerFailed ? "We couldn't load your earnings." : "We couldn't load your orders."}
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
              Check your connection and try again.
            </Text>
            <ChefActionButton
              label="Try again"
              onPress={() => {
                data.refresh().catch(() => undefined);
              }}
              tone="neutral"
            />
          </ChefCard>
        ) : (
          <>
            <View style={styles.row}>
              <StatTile label="You earned" trend={trend} value={formatRupees(summary.earned)} />
              <StatTile label="Orders delivered" trend={deliveredTrend} value={summary.delivered} />
            </View>
            <View style={styles.row}>
              <StatTile label="Average order" value={formatRupees(summary.averageOrder)} />
              {reviews.available && !reviews.isPending ? (
                <StatTile
                  label={reviewCount > 0 ? `Rating · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}` : 'No ratings yet'}
                  value={average != null ? `${average.toFixed(1)} ★` : '—'}
                />
              ) : (
                <View style={styles.spacer} />
              )}
            </View>
            {cutOff ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                {`Based on your latest ${data.ledgerLimit} earnings.`}
              </Text>
            ) : null}
            {data.historyFailed ? (
              <View style={styles.inline}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                  Couldn't load older orders.
                </Text>
                <Pressable accessibilityLabel="Try again" accessibilityRole="button" onPress={data.retryHistory} style={styles.link}>
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.linkText}>
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : data.historyCapped ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                {`Showing your latest ${MAX_HISTORY_ORDERS} orders.`}
              </Text>
            ) : latestOnly ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                Showing your latest orders only.
              </Text>
            ) : null}

            {empty ? (
              <ChefCard style={styles.gap}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
                  {accountEmpty ? 'No sales yet' : words.none}
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                  Your earnings, best sellers and daily sales show up here once orders are delivered.
                </Text>
                {accountEmpty ? (
                  <ChefActionButton label="Go to your menu" onPress={() => navigation.navigate('Menu')} tone="neutral" />
                ) : null}
              </ChefCard>
            ) : (
              <>
                {summary.byDay.length > 1 ? (
                  <EarnedEachDayCard
                    key={`${bounds.from.getTime()}-${bounds.to.getTime()}`}
                    byDay={summary.byDay}
                    caption={periodText}
                    onSelectDay={index => {
                      setDayIndex(index);
                      setSheet('day');
                    }}
                  />
                ) : null}
                {summary.topDishes.length > 0 ? <TopDishesCard dishes={summary.topDishes} photos={data.dishPhotos} /> : null}
                <OrdersSplitCard split={summary.split} title={words.orders} />
              </>
            )}
          </>
        )}

        <ListGroup>
          <ListRow icon="bank" onPress={openBank} subtitle={bankSummaryLine(bank)} title="Bank account" />
          <ListRow
            icon="document"
            onPress={() => toast.show('Monthly statements are coming soon.')}
            subtitle="Monthly PDF of earnings and payouts"
            title="Statements"
          />
        </ListGroup>
      </ChefScreen>

      {balance ? (
        <WithdrawSheet
          amount={balance.available}
          bank={bank}
          busy={withdrawal.busy}
          locked={withdrawal.uncertain}
          onAddBank={() => closeSheetThen(openBank)}
          onClose={() => setSheet(null)}
          onConfirm={() => withdrawal.start(balance.available)}
          visible={sheet === 'withdraw'}
        />
      ) : null}
      <DayOrdersSheet
        now={now}
        onClose={() => setSheet(null)}
        onOpenOrder={orderId =>
          closeSheetThen(() => navigation.navigate('ChefOrderDetail', {orderId}))
        }
        orders={ordersOnDay(data.orders, dayOfBar)}
        title={`Orders · ${dayLabel}`}
        visible={sheet === 'day'}
      />
      <DateRangeSheet
        now={now}
        onApply={picked => {
          setRange(picked);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
        visible={sheet === 'dates'}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chips: {gap: spacing.xs},
  chip: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.errorSoft},
  chipText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  chipTextOn: {color: colors.flameRedAccessible},
  row: {flexDirection: 'row', gap: spacing.sm},
  spacer: {flex: 1},
  gap: {gap: spacing.sm},
  cardTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  muted: {color: colors.textSecondary, fontSize: typography.small},
  inline: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.xs},
  link: {minHeight: touchTarget.minimum, justifyContent: 'center'},
  linkText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
});
