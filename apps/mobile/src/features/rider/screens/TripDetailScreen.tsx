import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import type {PayLine, SupportCategory, SupportIssue} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {ChoiceChip, ChoiceRow} from '../components/Choices';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, ProblemCard} from '../components/StateCard';
import {StatusBadge} from '../components/StatusBadge';
import {Card, Money, RateRow, RiderScreen, riderStyles} from '../components/ui';
import {formatClock, formatDay, formatKm, formatRupees} from '../domain/format';
import {riderMessage} from '../domain/problem';
import type {RiderScreenProps} from '../navigation';
import {useTripEarning} from '../state/riderQueries';
import {en} from '../strings/en';
import {useStrings, type AppLanguage} from '../strings/StringsProvider';

const TRIP_CATEGORIES: SupportCategory[] = ['MISSING_PAY', 'WRONG_DISTANCE', 'WRONG_DEDUCTION', 'APP_PROBLEM', 'OTHER'];

/** A load that failed, in the rider theme (StateCard): offline, Craves not answering, not on yet, or refused; with a retry. */
export function LoadFailed({error, onRetry}: {error: unknown; onRetry: () => unknown}) {
  return <ProblemCard error={error} onRetry={onRetry} testID="rider-load-failed" />;
}

// Trip-pay lines from GET /earnings/trips/{id} carry only the server's label, which is FleetPay.FINAL_LABELS (en.pay.final).
const COMPONENT_BY_LABEL = Object.fromEntries(Object.entries(en.pay.final).map(([component, label]) => [label, component]));

/** A pay line in the rider's language when the app knows what it is for; otherwise the server's own words (TDS, adjustments). */
export function payLabel(line: PayLine, table: Record<string, string>, language: AppLanguage): string {
  const component = line.component ?? COMPONENT_BY_LABEL[line.label];
  return language !== 'en' && component ? table[component] ?? line.label : line.label;
}

/**
 * "Report a problem": pick a category and send. On Trip pay it is a full-width outline button;
 * `inCard` (a payout card) makes it a red text link and drops the form's own card, since cards never nest.
 */
export function ReportProblem({
  issue,
  categories,
  inCard,
}: {
  issue: Omit<SupportIssue, 'category'>;
  categories: SupportCategory[];
  inCard?: boolean;
}) {
  const {strings, language} = useStrings();
  const e = strings.earnings;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [result, setResult] = useState<'sent' | {failed: string} | null>(null);

  if (result === 'sent') {
    return <Banner tone="success" text={e.reportSent} inset={inCard} testID="rider-report-sent" />;
  }
  if (!open) {
    return (
      <BottomAction
        label={e.report}
        variant={inCard ? 'ghost' : 'outline'}
        size={inCard ? 'compact' : undefined}
        onPress={() => setOpen(true)}
        style={inCard && styles.link}
        testID="rider-report"
      />
    );
  }
  const Wrapper = inCard ? View : Card;
  return (
    <Wrapper style={riderStyles.gap}>
      <Text accessibilityRole="header" style={styles.formTitle}>
        {e.reportTitle}
      </Text>
      <ChoiceRow label={e.reportTitle}>
        {categories.map(c => (
          <ChoiceChip key={c} label={e.categories[c]} selected={category === c} onPress={() => setCategory(c)} testID={`rider-report-${c}`} />
        ))}
      </ChoiceRow>
      {result ? <Banner tone="warning" text={result.failed} inset /> : null}
      <BottomAction
        label={e.send}
        variant={inCard ? 'outline' : 'primary'}
        size={inCard ? 'compact' : undefined}
        disabled={!category}
        testID="rider-report-send"
        onPress={async () => {
          try {
            await riderApi.reportIssue({...issue, category: category as SupportCategory});
            setResult('sent');
          } catch (error) {
            setResult({failed: riderMessage(error, strings, language)});
          }
        }}
      />
      <BottomAction label={strings.common.cancel} variant="ghost" onPress={() => setOpen(false)} />
    </Wrapper>
  );
}

export function TripDetailScreen({route}: RiderScreenProps<'TripDetail'>) {
  const {strings, language} = useStrings();
  const e = strings.earnings;
  const trip = useTripEarning(route.params.tripId);
  const data = trip.data;
  const withWeekday = (value: string) => `${e.weekdays[new Date(value).getDay()]} ${formatDay(value)}`;

  return (
    <RiderScreen header={<RiderHeader title={e.detailTitle} back />} testID="rider-trip-detail">
      {data ? (
        <>
          <View style={styles.summary}>
            <Text accessibilityRole="header" style={styles.route}>
              {e.route(data.kitchenArea, data.customerLocality)}
            </Text>
            <Text style={styles.meta}>{e.completed(`${withWeekday(data.completedAt)}, ${formatClock(data.completedAt)}`)}</Text>
            <View style={styles.amountRow}>
              <Money paise={data.amountPaise} testID="rider-trip-amount" />
              <StatusBadge status={data.status} label={e.status[data.status]} />
            </View>
          </View>
          {data.status === 'HELD' ? (
            <Banner
              tone="warning"
              icon={null}
              title={e.holdReason}
              text={data.holdReason}
              closing={data.releaseOn ? e.decisionBy(withWeekday(data.releaseOn)) : e.holdLimit}
              testID="rider-hold"
            />
          ) : null}
          <Card>
            {/* Labels can repeat (two adjustments with one reason, TDS on each), so rows are keyed by place too. */}
            {data.lines.map((line, index) => (
              <RateRow
                key={`${index}-${line.label}`}
                label={payLabel(line, strings.pay.final, language)}
                value={formatRupees(line.amountPaise)}
              />
            ))}
            {/* The server's total, never a sum made on the phone. */}
            <RateRow label={e.total} value={formatRupees(data.amountPaise)} total />
          </Card>
          <Card>
            <RateRow label={e.toKitchen} value={formatKm(data.pickupDistanceM)} />
            <RateRow label={e.toCustomer} value={e.byRoad(formatKm(data.dropDistanceM))} />
            <Text style={styles.meta}>{e.rateCard(data.rateCardVersion)}</Text>
          </Card>
          <ReportProblem issue={{tripId: data.tripId}} categories={TRIP_CATEGORIES} />
          <Text style={[styles.meta, styles.centred]}>{e.supportTimes}</Text>
        </>
      ) : trip.isError ? (
        <LoadFailed error={trip.error} onRetry={trip.refetch} />
      ) : (
        <CardsSkeleton cards={3} testID="rider-trip-loading" />
      )}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  summary: {gap: spacing.xxs},
  route: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  meta: {fontSize: typography.small, color: colors.textSecondary},
  centred: {textAlign: 'center'},
  amountRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs},
  formTitle: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  // Text links line up with the card text: the 8 dp ghost padding hangs outside it.
  link: {alignSelf: 'flex-start', marginLeft: -spacing.xs},
});
