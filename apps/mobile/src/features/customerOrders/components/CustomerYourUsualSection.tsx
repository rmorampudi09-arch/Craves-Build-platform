import React from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {useIsFocused, useNavigation} from '@react-navigation/native';
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
import {sessionManager} from '../../auth/api/sessionManager';
import {isDefinitiveCartRejection} from '../../cart/domain/cartWriteRejection';
import {refreshCartSnapshot} from '../../cart/state/cartRefresh';
import {reorderCart} from '../../cart/state/cartMutations';
import {useFavoriteHomeFeedQuery, useFavoriteKitchensQuery} from '../../favorites/query/homeFavoriteQueries';
import type {RepeatOrderCandidate} from '../api/repeatOrdersApi';
import {createCustomerOrderReorder} from '../domain/customerOrderReorder';
import {
  familiarityLabel,
  previousOrderTotalLabel,
  rankRepeatOrderCandidates,
  repeatOrderBasketSummary,
} from '../presentation/repeatOrderPresentation';
import {useRepeatOrderCandidatesQuery} from '../query/repeatOrderQueries';
import {useRepeatOrderCatalogPrecheck} from '../query/useRepeatOrderCatalogPrecheck';

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
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const focused = useIsFocused();
  const [appActive, setAppActive] = React.useState(AppState.currentState === 'active');
  const active = focused && appActive && Boolean(identityId);
  const mounted = React.useRef(true);
  const activity = React.useRef({
    active,
    identityId,
    generation: 0,
  });
  if (
    activity.current.active !== active ||
    activity.current.identityId !== identityId
  ) {
    activity.current = {
      active,
      identityId,
      generation: activity.current.generation + 1,
    };
  }
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
  const [uncertainReorder, setUncertainReorder] = React.useState(false);
  const [checkingCart, setCheckingCart] = React.useState(false);
  const reorderBusy = React.useRef(false);
  const cartCheckBusy = React.useRef(false);
  const uncertainRef = React.useRef(false);
  const confirmation = React.useRef<((confirmed: boolean) => void) | null>(null);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      confirmation.current?.(false);
    };
  }, []);

  React.useEffect(() => {
    return sessionManager.subscribeInvalidation(() => {
      confirmation.current?.(false);
      activity.current = {
        ...activity.current,
        active: false,
        generation: activity.current.generation + 1,
      };
    });
  }, []);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') confirmation.current?.(false);
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    confirmation.current?.(false);
    uncertainRef.current = false;
    setUncertainReorder(false);
    setFailureMessage(null);
    setFailedCandidate(null);
  }, [identityId]);

  const ranked = React.useMemo(
    () => rankRepeatOrderCandidates(repeatOrders.items, {
      favoriteKitchenIds: new Set(favoriteKitchenIds),
      homeFeed: favoriteHome.data ?? [],
    }),
    [favoriteHome.data, favoriteKitchenIds, repeatOrders.items],
  );
  const visibleCandidates = React.useMemo(() => ranked.slice(0, 6), [ranked]);
  const catalogPrecheck = useRepeatOrderCatalogPrecheck(visibleCandidates);

  const runReorder = React.useCallback(
    async (candidate: RepeatOrderCandidate) => {
      if (
        pendingOrderId ||
        reorderBusy.current ||
        uncertainRef.current ||
        !activity.current.active ||
        !identityId
      ) {
        return;
      }

      const generation = activity.current.generation;
      const requestIdentity = identityId;
      const isCurrent = () =>
        mounted.current &&
        activity.current.active &&
        activity.current.generation === generation &&
        activity.current.identityId === requestIdentity;

      reorderBusy.current = true;
      setFailureMessage(null);
      setFailedCandidate(null);
      setPendingOrderId(candidate.orderId);
      let rejectionMessage =
        'That previous basket cannot be rebuilt exactly right now.';

      try {
        const coordinator = createCustomerOrderReorder({
          isCurrent,
          readCart: async () => {
            const result = await dispatch(refreshCartSnapshot());
            return result.status === 'APPLIED' ? result.snapshot : null;
          },
          confirm: cart =>
            new Promise(resolve => {
              let settled = false;
              const finish = (value: boolean) => {
                if (settled) return;
                settled = true;
                confirmation.current = null;
                resolve(value);
              };
              confirmation.current = finish;
              Alert.alert(
                cart.lines.length
                  ? 'Replace current cart?'
                  : 'Order like last time?',
                cart.lines.length
                  ? 'Craves will recheck this exact cart before replacing it. The previous basket will then be rebuilt using today’s availability and prices.'
                  : 'Craves will recheck your cart before rebuilding this previous basket using today’s availability and prices.',
                [
                  {
                    text: cart.lines.length ? 'Keep cart' : 'Not now',
                    style: 'cancel',
                    onPress: () => finish(false),
                  },
                  {
                    text: cart.lines.length ? 'Verify & replace' : 'Verify & add',
                    onPress: () => finish(true),
                  },
                ],
                {cancelable: true, onDismiss: () => finish(false)},
              );
            }),
          replaceCart: async (orderId, expectedSnapshot, expectedKitchenId) => {
            uncertainRef.current = true;
            setUncertainReorder(true);
            const outcome = await dispatch(
              reorderCart({
                orderId,
                expectedSnapshot,
                expectedKitchenId,
              }),
            );
            if (
              outcome.status === 'FAILED' &&
              isDefinitiveCartRejection(outcome.error)
            ) {
              rejectionMessage = outcome.error.message;
              return 'REJECTED';
            }
            return outcome.status === 'APPLIED'
              ? 'APPLIED'
              : outcome.status === 'FAILED'
                ? 'FAILED'
                : 'STALE';
          },
        });

        const result = await coordinator.run({
          orderId: candidate.orderId,
          kitchenId: candidate.kitchenId,
          eligible: true,
        });

        if (!isCurrent()) return;

        if (result === 'APPLIED') {
          uncertainRef.current = false;
          setUncertainReorder(false);
          navigation.navigate('CustomerCart');
        } else if (result === 'REJECTED') {
          uncertainRef.current = false;
          setUncertainReorder(false);
          setFailedCandidate(candidate);
          setFailureMessage(rejectionMessage);
        } else if (result === 'STALE') {
          uncertainRef.current = false;
          setUncertainReorder(false);
        } else if (result === 'CART_CHANGED') {
          uncertainRef.current = false;
          setUncertainReorder(false);
          setFailedCandidate(candidate);
          setFailureMessage(
            'Your cart changed while you were reviewing it. Start again to review the latest cart.',
          );
        } else if (result === 'READ_FAILED') {
          uncertainRef.current = false;
          setUncertainReorder(false);
          setFailedCandidate(candidate);
          setFailureMessage(
            'Craves could not verify your current cart. Refresh it before trying again.',
          );
        } else if (result === 'UNCERTAIN') {
          uncertainRef.current = true;
          setUncertainReorder(true);
          setFailedCandidate(candidate);
          setFailureMessage(
            'The reorder result could not be confirmed. Check your cart before trying any previous basket again.',
          );
        }
      } catch (error) {
        if (!isCurrent()) return;
        uncertainRef.current = true;
        setUncertainReorder(true);
        setFailedCandidate(candidate);
        setFailureMessage(toAppApiError(error).message);
      } finally {
        reorderBusy.current = false;
        if (mounted.current) setPendingOrderId(null);
      }
    },
    [dispatch, identityId, navigation, pendingOrderId],
  );

  const checkCart = React.useCallback(async () => {
    if (!activity.current.active || reorderBusy.current || cartCheckBusy.current) {
      return;
    }
    const generation = activity.current.generation;
    cartCheckBusy.current = true;
    setCheckingCart(true);
    try {
      const result = await dispatch(refreshCartSnapshot());
      if (
        !mounted.current ||
        !activity.current.active ||
        activity.current.generation !== generation
      ) {
        return;
      }
      if (result.status === 'APPLIED') {
        uncertainRef.current = false;
        setUncertainReorder(false);
        setFailureMessage(null);
        setFailedCandidate(null);
        navigation.navigate('CustomerCart');
      } else {
        setFailureMessage(
          'Your cart could not be checked yet. Reconnect and try again before another reorder.',
        );
      }
    } finally {
      cartCheckBusy.current = false;
      if (mounted.current) setCheckingCart(false);
    }
  }, [dispatch, navigation]);

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
            accessibilityState={{busy: checkingCart}}
            disabled={checkingCart}
            onPress={() => {
              if (uncertainReorder) {
                void checkCart();
              } else {
                navigation.navigate('CustomerKitchenDishes', {
                  kitchenId: failedCandidate.kitchenId,
                });
              }
            }}
            style={({pressed}) => [styles.recoveryButton, pressed && styles.pressed]}>
            <Text style={styles.recoveryText}>
              {uncertainReorder
                ? checkingCart
                  ? 'Checking cart…'
                  : 'Check cart before retrying'
                : "View today's menu from this kitchen"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cards}
        accessibilityLabel="Order Like Last Time suggestions">
        {visibleCandidates.map(candidate => {
          const pending = pendingOrderId === candidate.orderId;
          const catalogStatus = catalogPrecheck.statusFor(candidate);
          const catalogChecking =
            catalogPrecheck.available && catalogPrecheck.isPending;
          const catalogReviewRequired =
            catalogStatus === 'REVIEW_REQUIRED';
          const truthCopy =
            catalogChecking
              ? "Checking today's menu availability…"
              : catalogStatus === 'CURRENTLY_AVAILABLE'
                ? 'Current Catalog pre-check passed. Final cart validation still applies.'
                : catalogReviewRequired
                  ? "One or more previous dishes are not currently available. Review today's kitchen menu."
                  : candidate.currentValidationNotice;
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
              <Text numberOfLines={2} style={styles.truthCopy}>{truthCopy}</Text>
              {!candidate.preferenceRecallSupported ? (
                <Text style={styles.preferenceCopy}>Previous customizations are not silently assumed.</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  busy: pending || catalogChecking,
                  disabled:
                    Boolean(pendingOrderId) ||
                    uncertainReorder ||
                    !active ||
                    catalogChecking,
                }}
                disabled={
                  Boolean(pendingOrderId) ||
                  uncertainReorder ||
                  !active ||
                  catalogChecking
                }
                onPress={() => {
                  if (catalogReviewRequired) {
                    navigation.navigate('CustomerKitchenDishes', {
                      kitchenId: candidate.kitchenId,
                    });
                    return;
                  }
                  runReorder(candidate).catch(() => undefined);
                }}
                style={({pressed}) => [styles.orderButton, pressed && styles.pressed]}>
                {pending || catalogChecking ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Icon
                    name={catalogReviewRequired ? 'silverware-fork-knife' : 'restore'}
                    size={18}
                    color={colors.white}
                  />
                )}
                <Text style={styles.orderButtonText}>
                  {catalogReviewRequired
                    ? "View today's menu"
                    : 'Order like last time'}
                </Text>
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
