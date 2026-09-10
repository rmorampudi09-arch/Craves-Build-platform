import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {CustomerOrdersStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {reorderCart} from '../../cart/state/cartMutations';
import {useFavoriteHomeFeedQuery, useFavoriteKitchensQuery} from '../../favorites/query/homeFavoriteQueries';
import type {RepeatOrderCandidate} from '../api/repeatOrdersApi';
import {
  familiarityLabel,
  previousOrderTotalLabel,
  rankRepeatOrderCandidates,
  repeatOrderBasketSummary,
} from '../presentation/repeatOrderPresentation';
import {useRepeatOrderCandidatesQuery} from '../query/repeatOrderQueries';

function Icon({
  name,
  size = 20,
  color = colors.flameRedAccessible,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return <MaterialDesignIcons name={name as never} size={size} color={color} />;
}

function orderedDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {day: 'numeric', month: 'short'}).format(new Date(value));
  } catch {
    return 'Previous order';
  }
}

export function CustomerYourUsualSection() {
  const navigation = useNavigation<NativeStackNavigationProp<CustomerOrdersStackParamList, 'CustomerOrdersRoot'>>();
  const dispatch = useAppDispatch();
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const repeatOrders = useRepeatOrderCandidatesQuery();
  const favoriteKitchens = useFavoriteKitchensQuery();
  const favoriteKitchenIds = React.useMemo(
    () => favoriteKitchens.items.map(item => item.kitchenId),
    [favoriteKitchens.items],
  );
  const favoriteHome = useFavoriteHomeFeedQuery([], favoriteKitchenIds);
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);
  const [failedCandidate, setFailedCandidate] = React.useState<RepeatOrderCandidate | null>(null);
  const [failureMessage, setFailureMessage] = React.useState<string | null>(null);

  const ranked = React.useMemo(
    () => rankRepeatOrderCandidates(repeatOrders.items, {
      favoriteKitchenIds: new Set(favoriteKitchenIds),
      homeFeed: favoriteHome.data ?? [],
    }),
    [favoriteHome.data, favoriteKitchenIds, repeatOrders.items],
  );

  const runReorder = React.useCallback(async (candidate: RepeatOrderCandidate) => {
    if (pendingOrderId) return;
    setFailureMessage(null);
    setFailedCandidate(null);
    setPendingOrderId(candidate.orderId);
    try {
      const outcome = await dispatch(reorderCart({orderId: candidate.orderId}));
      if (outcome.status === 'FAILED') {
        setFailedCandidate(candidate);
        setFailureMessage(outcome.error.message);
        return;
      }
      if (outcome.status === 'APPLIED') {
        navigation.navigate('CustomerCart');
      }
    } catch (error) {
      setFailedCandidate(candidate);
      setFailureMessage(toAppApiError(error).message);
    } finally {
      setPendingOrderId(null);
    }
  }, [dispatch, navigation, pendingOrderId]);

  const confirm = React.useCallback((candidate: RepeatOrderCandidate) => {
    const proceed = () => runReorder(candidate).catch(() => undefined);
    if (cartSnapshot?.lines.length) {
      Alert.alert(
        'Replace current cart?',
        'Craves will verify every dish against the current catalog first. If validation fails, your current cart stays unchanged.',
        [
          {text: 'Keep cart', style: 'cancel'},
          {text: 'Verify & replace', style: 'destructive', onPress: proceed},
        ],
      );
      return;
    }
    proceed();
  }, [cartSnapshot?.lines.length, runReorder]);

  if (repeatOrders.sessionRequired || (!repeatOrders.isPending && ranked.length === 0)) {
    return null;
  }

  if (repeatOrders.isPending) {
    return (
      <View style={styles.loadingCard} accessibilityRole="progressbar">
        <ActivityIndicator size="small" color={colors.flameRed} />
        <Text style={styles.loadingText}>Checking your familiar meals…</Text>
      </View>
    );
  }

  if (repeatOrders.isError) {
    return (
      <View style={styles.errorCard}>
        <Text style={styles.errorTitle}>Your usual meals could not be refreshed</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => repeatOrders.refetch().catch(() => undefined)}
          style={({pressed}) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Icon name="history" size={22} /></View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Your usual</Text>
          <Text style={styles.subtitle}>Order like last time, then review today's cart before checkout.</Text>
        </View>
      </View>

      {failureMessage && failedCandidate ? (
        <View accessibilityLiveRegion="polite" style={styles.failureCard}>
          <Text style={styles.failureTitle}>That previous basket cannot be rebuilt exactly right now</Text>
          <Text style={styles.failureText}>{failureMessage}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('CustomerKitchenDishes', {kitchenId: failedCandidate.kitchenId})}
            style={({pressed}) => [styles.recoveryButton, pressed && styles.pressed]}>
            <Text style={styles.recoveryText}>View today's menu from this kitchen</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cards}
        accessibilityLabel="Order Like Last Time suggestions">
        {ranked.slice(0, 6).map(candidate => {
          const pending = pendingOrderId === candidate.orderId;
          const favorite = favoriteKitchenIds.includes(candidate.kitchenId);
          const home = (favoriteHome.data ?? []).find(item => item.kitchenId === candidate.kitchenId);
          const cookingCopy = home?.cookingState === 'COOKING_NOW'
            ? 'Favorite kitchen · cooking now'
            : home?.cookingState === 'COOKING_LATER_TODAY'
              ? 'Favorite kitchen · cooking later today'
              : favorite
                ? 'Favorite kitchen'
                : null;
          return (
            <View key={candidate.orderId} style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text numberOfLines={2} style={styles.kitchen}>{candidate.kitchenName}</Text>
                <Text style={styles.date}>{orderedDate(candidate.lastOrderedAt)}</Text>
              </View>
              {cookingCopy ? <Text style={styles.relationshipSignal}>{cookingCopy}</Text> : null}
              <Text numberOfLines={2} style={styles.basket}>{repeatOrderBasketSummary(candidate)}</Text>
              <Text style={styles.familiarity}>{familiarityLabel(candidate)}</Text>
              <Text style={styles.previousTotal}>{previousOrderTotalLabel(candidate)}</Text>
              <Text numberOfLines={2} style={styles.truthCopy}>{candidate.currentValidationNotice}</Text>
              {!candidate.preferenceRecallSupported ? (
                <Text style={styles.preferenceCopy}>Previous customizations are not silently assumed.</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{busy: pending}}
                disabled={Boolean(pendingOrderId)}
                onPress={() => confirm(candidate)}
                style={({pressed}) => [styles.orderButton, pressed && styles.pressed]}>
                {pending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Icon name="restore" size={18} color={colors.white} />
                )}
                <Text style={styles.orderButtonText}>Order like last time</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {repeatOrders.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{busy: repeatOrders.isFetchingNextPage}}
          disabled={repeatOrders.isFetchingNextPage}
          onPress={() => repeatOrders.fetchNextPage().catch(() => undefined)}
          style={({pressed}) => [styles.moreButton, pressed && styles.pressed]}>
          <Text style={styles.moreText}>Show more familiar orders</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, backgroundColor: colors.white},
  header: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm},
  headerIcon: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.iconSurface},
  headerCopy: {minWidth: 0, flex: 1},
  title: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  subtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  cards: {gap: spacing.sm, paddingRight: spacing.md},
  card: {width: 286, gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, ...elevation.card},
  cardTopRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs},
  kitchen: {minWidth: 0, flex: 1, color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  date: {color: colors.textSecondary, fontSize: typography.tiny},
  relationshipSignal: {alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.successSoft, color: colors.successText, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  basket: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  familiarity: {color: colors.textSecondary, fontSize: typography.tiny},
  previousTotal: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  truthCopy: {color: colors.textSecondary, fontSize: typography.tiny},
  preferenceCopy: {color: colors.warningText, fontSize: typography.tiny},
  orderButton: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.flameRedAccessible},
  orderButtonText: {color: colors.white, fontSize: typography.small, fontWeight: fontWeight.bold},
  failureCard: {gap: spacing.xs, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft},
  failureTitle: {color: colors.warningText, fontSize: typography.small, fontWeight: fontWeight.bold},
  failureText: {color: colors.textSecondary, fontSize: typography.tiny},
  recoveryButton: {alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.white},
  recoveryText: {color: colors.flameRedAccessible, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  moreButton: {minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.borderStrong, backgroundColor: colors.white},
  moreText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  loadingCard: {minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  loadingText: {color: colors.textSecondary, fontSize: typography.small},
  errorCard: {gap: spacing.xs, marginHorizontal: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.errorSoft},
  errorTitle: {color: colors.error, fontSize: typography.small, fontWeight: fontWeight.bold},
  retryButton: {alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.white},
  retryText: {color: colors.flameRedAccessible, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  pressed: {opacity: 0.72},
});
