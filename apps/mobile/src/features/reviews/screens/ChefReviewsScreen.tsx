import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {OptionChip} from '../../chefMenu/components/DishFormField';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useChefRead} from '../../chefProfile/state/useChefRead';
import {ChefActionButton, ChefCard, ChefScreen, ChefTopBar, StatusChip} from '../../chefShell/components/ui';
import {formatRelativeTime} from '../../chefShell/domain/chefFormat';
import {humanizeCode} from '../../chefShell/domain/humanizeCode';
import {EmptyState} from '../../chefOrders/components/OrderCardParts';
import {chefReviewsApi} from '../api/chefReviewsApi';
import type {PublicKitchenReview} from '../api/publicKitchenReviewsApi';

const PAGE = 20;
type StarFilter = 'ALL' | 5 | 4 | 'LOW';
const FILTERS: readonly {key: StarFilter; label: string}[] = [
  {key: 'ALL', label: 'All'},
  {key: 5, label: '5★'},
  {key: 4, label: '4★'},
  {key: 'LOW', label: '3★ and below'},
];
const matches = (review: PublicKitchenReview, filter: StarFilter) =>
  filter === 'ALL' || (filter === 'LOW' ? review.overallRating <= 3 : review.overallRating === filter);

function Stars({rating}: {rating: number}) {
  return (
    <Text accessibilityLabel={`${rating} out of 5 stars`} allowFontScaling={textDefaults.allowFontScaling} style={styles.stars}>
      {'★'.repeat(rating)}
      <Text style={styles.starOff}>{'★'.repeat(5 - rating)}</Text>
    </Text>
  );
}

/** The star-by-star bars; only drawn when every review is loaded, so they never show a partial count. */
function Spread({reviews}: {reviews: PublicKitchenReview[]}) {
  return (
    <View style={styles.spread}>
      {[5, 4, 3, 2, 1].map(stars => {
        const share = (reviews.filter(review => review.overallRating === stars).length / reviews.length) * 100;
        return (
          <View key={stars} style={styles.spreadRow}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.spreadLabel}>
              {stars}
            </Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, {width: `${share}%`}]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Reviews: the kitchen's rating at a glance, then what customers wrote. */
export function ChefReviewsScreen() {
  const navigation = useNavigation();
  const list = useChefRead('chef-reviews', signal => chefReviewsApi.list({limit: PAGE, signal}));
  const [older, setOlder] = React.useState<{items: PublicKitchenReview[]; nextCursor: string | null; hasMore: boolean} | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [filter, setFilter] = React.useState<StarFilter>('ALL');

  const first = list.query.data;
  const reviews = [...(first?.items ?? []), ...(older?.items ?? [])];
  const hasMore = older ? older.hasMore : first?.hasMore ?? false;
  const cursor = older ? older.nextCursor : first?.nextCursor ?? null;
  const kitchenId = reviews[0]?.kitchenId;
  const summary = useChefRead('chef-review-summary', signal => chefReviewsApi.summary(kitchenId as string, signal), {
    entityId: kitchenId,
    enabled: Boolean(kitchenId),
  });

  const loadMore = async () => {
    if (loadingMore || !cursor) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await chefReviewsApi.list({limit: PAGE, cursor});
      setOlder(previous => ({items: [...(previous?.items ?? []), ...page.items], nextCursor: page.nextCursor, hasMore: page.hasMore}));
    } catch {
      // The reviews already shown stay; the button is still there to try again.
    } finally {
      setLoadingMore(false);
    }
  };

  // The server's average wins; while it is on its way the number stays blank rather than showing a different one.
  const waitingForSummary = Boolean(kitchenId) && summary.query.isPending;
  const average =
    summary.query.data?.overallAverage ??
    (waitingForSummary || hasMore || reviews.length === 0
      ? null
      : reviews.reduce((sum, review) => sum + review.overallRating, 0) / reviews.length);
  const count = summary.query.data?.reviewCount ?? reviews.length;
  const now = new Date(Date.now());
  const shown = reviews.filter(review => matches(review, filter));

  return (
    <ChefScreen
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Reviews" />}
      onRefresh={() => {
        setOlder(null);
        list.query.refetch().catch(() => undefined);
      }}
      refreshing={list.query.isRefetching}
      withTabBar>
      <ReadState
        comingSoon={{title: 'Reviews are on their way', message: 'What customers write about your food will show up here soon.'}}
        query={list.query}>
        {() =>
          reviews.length === 0 ? (
            <EmptyState icon="star" message="When customers rate your food, their reviews appear here." title="No reviews yet" />
          ) : (
            <>
              <ChefCard style={styles.summary}>
                <View style={styles.average}>
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.averageValue}>
                    {average === null ? '–' : average.toFixed(1)}
                  </Text>
                  {average === null ? null : <Stars rating={Math.round(average)} />}
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.count}>
                    {count === 1 ? '1 review' : `${count} reviews`}
                  </Text>
                </View>
                {hasMore ? null : <Spread reviews={reviews} />}
              </ChefCard>
              <View style={styles.filters}>
                {FILTERS.map(option => (
                  <OptionChip
                    key={option.label}
                    label={option.label}
                    onPress={() => setFilter(option.key)}
                    selected={filter === option.key}
                  />
                ))}
              </View>
              {shown.length === 0 ? (
                <View style={styles.noneBox}>
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.none}>
                    {hasMore ? 'No loaded reviews in this group' : 'No reviews in this group'}
                  </Text>
                  {hasMore ? (
                    <ChefActionButton busy={loadingMore} label="Load more" onPress={() => loadMore().catch(() => undefined)} tone="neutral" />
                  ) : null}
                </View>
              ) : (
                shown.map(review => (
                  <ChefCard key={review.reviewId}>
                    <View style={styles.cardTop}>
                      <Stars rating={review.overallRating} />
                      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.date}>
                        {formatRelativeTime(review.publishedAt, now)}
                      </Text>
                    </View>
                    {review.reviewText ? (
                      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.text}>
                        {review.reviewText}
                      </Text>
                    ) : null}
                    {review.tagCodes.length > 0 ? (
                      <View style={styles.tags}>
                        {review.tagCodes.map(code => (
                          <StatusChip key={code} label={humanizeCode(code)} tone="done" />
                        ))}
                      </View>
                    ) : null}
                  </ChefCard>
                ))
              )}
              {hasMore && shown.length > 0 ? (
                <ChefActionButton busy={loadingMore} label="Show more reviews" onPress={() => loadMore().catch(() => undefined)} tone="neutral" />
              ) : null}
            </>
          )
        }
      </ReadState>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  summary: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  average: {alignItems: 'center', gap: 2},
  averageValue: {color: colors.textPrimary, fontSize: typography.title, fontWeight: fontWeight.extrabold},
  count: {color: colors.textSecondary, fontSize: typography.tiny},
  stars: {color: colors.warning, fontSize: typography.body},
  starOff: {color: colors.border},
  spread: {flex: 1, gap: spacing.xxs},
  spreadRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  spreadLabel: {width: 12, color: colors.textSecondary, fontSize: typography.small},
  bar: {flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.border},
  barFill: {height: '100%', borderRadius: radius.pill, backgroundColor: colors.warning},
  filters: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  noneBox: {gap: spacing.sm, paddingVertical: spacing.md},
  none: {color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
  cardTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  date: {color: colors.textSecondary, fontSize: typography.small},
  text: {marginTop: spacing.xs, color: colors.textPrimary, fontSize: typography.body},
  tags: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs},
});
