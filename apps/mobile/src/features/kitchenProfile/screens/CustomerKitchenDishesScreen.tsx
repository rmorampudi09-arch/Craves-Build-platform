import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {CustomerDishDetailStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import type {CartLine} from '../../cart/domain/cartTypes';
import {
  addCartItem,
  removeCartItem,
  setCartItemQuantity,
  type CartMutationOutcome,
} from '../../cart/state/cartMutations';
import {formatDishDetailPrice} from '../../dishDetail/dishDetailPurchase';
import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';
import {
  isFavoriteMenuItem,
  useCustomerFavoritesQuery,
  useToggleCustomerFavorite,
} from '../../favorites/query/customerFavoritesQueries';
import type {CustomerKitchenMenuItemSummary} from '../api/kitchenProfileApi';
import {
  ALL_KITCHEN_DISHES_CATEGORY,
  filterCustomerKitchenDishes,
  formatCustomerKitchenDishMetadata,
  getCustomerKitchenDishCategories,
} from '../kitchenDishesPresentation';
import {getCustomerKitchenMenuImage} from '../kitchenProfilePresentation';
import {useCustomerKitchenProfileQuery} from '../query/kitchenProfileQueries';

type KitchenDishesRoute = RouteProp<
  CustomerDishDetailStackParamList,
  'CustomerKitchenDishes'
>;
type KitchenDishesNavigation = NavigationProp<
  CustomerDishDetailStackParamList,
  'CustomerKitchenDishes'
>;

function KitchenDishesSkeleton() {
  return (
    <View
      accessibilityLabel="Loading all dishes"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonChipRow}>
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
      </View>
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

interface KitchenDishRowProps {
  item: CustomerKitchenMenuItemSummary;
  cartLine: CartLine | null;
  busy: boolean;
  favorite: boolean;
  favoritePending: boolean;
  favoriteDisabled: boolean;
  onFavoriteToggle: (menuItemId: string, favorite: boolean) => void;
  onOpen: (menuItemId: string) => void;
  onIncrease: (item: CustomerKitchenMenuItemSummary) => void;
  onDecrease: (line: CartLine) => void;
}

function KitchenDishRow({
  item,
  cartLine,
  busy,
  favorite,
  favoritePending,
  favoriteDisabled,
  onFavoriteToggle,
  onOpen,
  onIncrease,
  onDecrease,
}: KitchenDishRowProps) {
  const image = getCustomerKitchenMenuImage(item);
  const metadata = formatCustomerKitchenDishMetadata(item);

  return (
    <View style={styles.dishCard}>
      <Pressable
        accessibilityLabel={`Open ${item.itemName}`}
        accessibilityRole="button"
        onPress={() => onOpen(item.id)}
        style={({pressed}) => [styles.dishMain, pressed && styles.pressed]}>
        {image ? (
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel={`${item.itemName} image`}
            resizeMode="cover"
            source={{uri: image.url}}
            style={styles.dishImage}
          />
        ) : (
          <View style={styles.dishImageFallback}>
            <Text numberOfLines={2} style={styles.dishImageFallbackText}>
              {item.category}
            </Text>
          </View>
        )}

        <View style={styles.dishCopy}>
          <Text numberOfLines={2} style={styles.dishTitle}>
            {item.itemName}
          </Text>
          <Text numberOfLines={1} style={styles.dishCategory}>
            {item.category}
          </Text>
          {metadata ? (
            <Text numberOfLines={1} style={styles.dishMeta}>
              {metadata}
            </Text>
          ) : null}
          {item.description ? (
            <Text numberOfLines={2} style={styles.dishDescription}>
              {item.description}
            </Text>
          ) : null}
          <Text style={styles.dishPrice}>
            {formatDishDetailPrice(item.price.amount, item.price.currency)}
          </Text>
        </View>
      </Pressable>
      <CustomerFavoriteHeartButton
        favorite={favorite}
        pending={favoritePending}
        disabled={favoriteDisabled}
        itemLabel={item.itemName}
        onToggle={() => onFavoriteToggle(item.id, favorite)}
        style={styles.favoriteButton}
      />

      {cartLine ? (
        <View style={styles.quantityControl}>
          <Pressable
            accessibilityLabel={`Decrease ${item.itemName} quantity`}
            accessibilityRole="button"
            accessibilityState={{disabled: busy}}
            disabled={busy}
            onPress={() => onDecrease(cartLine)}
            style={({pressed}) => [
              styles.quantityButton,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}>
            <Text style={styles.quantityButtonText}>−</Text>
          </Pressable>
          <Text accessibilityLabel={`${cartLine.quantity} in cart`} style={styles.quantityText}>
            {cartLine.quantity}
          </Text>
          <Pressable
            accessibilityLabel={`Increase ${item.itemName} quantity`}
            accessibilityRole="button"
            accessibilityState={{busy, disabled: busy}}
            disabled={busy}
            onPress={() => onIncrease(item)}
            style={({pressed}) => [
              styles.quantityButton,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}>
            <Text style={styles.quantityButtonText}>+</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityLabel={`Add ${item.itemName} to cart`}
          accessibilityRole="button"
          accessibilityState={{busy, disabled: busy}}
          disabled={busy}
          onPress={() => onIncrease(item)}
          style={({pressed}) => [
            styles.addButton,
            busy && styles.disabled,
            pressed && !busy && styles.pressed,
          ]}>
          <Text style={styles.addButtonText}>{busy ? 'Updating…' : 'Add'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function DishSeparator() {
  return <View style={styles.separator} />;
}

export function CustomerKitchenDishesScreen() {
  const navigation = useNavigation<KitchenDishesNavigation>();
  const route = useRoute<KitchenDishesRoute>();
  const dispatch = useAppDispatch();
  const profileQuery = useCustomerKitchenProfileQuery(route.params.kitchenId);
  const favorites = useCustomerFavoritesQuery();
  const toggleFavorite = useToggleCustomerFavorite();
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const cartMutations = useAppSelector(state => state.cart.mutations);
  const listRef = useRef<FlatList<CustomerKitchenMenuItemSummary>>(null);
  const scrollOffsetRef = useRef(0);
  const [selectedCategory, setSelectedCategory] = useState(
    ALL_KITCHEN_DISHES_CATEGORY,
  );
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const [revalidatingItemId, setRevalidatingItemId] = useState<string | null>(null);

  const profile = profileQuery.data;
  const queryError = profileQuery.error ? toAppApiError(profileQuery.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const categories = useMemo(
    () => getCustomerKitchenDishCategories(profile?.menuItems ?? []),
    [profile?.menuItems],
  );
  const effectiveCategory =
    selectedCategory === ALL_KITCHEN_DISHES_CATEGORY ||
    categories.includes(selectedCategory)
      ? selectedCategory
      : ALL_KITCHEN_DISHES_CATEGORY;
  const dishes = useMemo(
    () =>
      filterCustomerKitchenDishes(
        profile?.menuItems ?? [],
        effectiveCategory,
      ),
    [effectiveCategory, profile?.menuItems],
  );
  const cartCount =
    cartSnapshot?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0;

  useFocusEffect(
    useCallback(() => {
      const offset = scrollOffsetRef.current;
      if (offset > 0) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({offset, animated: false});
        });
      }
      return undefined;
    }, []),
  );

  const saveScrollOffset = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  const handleCartOutcome = useCallback((outcome: CartMutationOutcome) => {
    if (outcome.status === 'FAILED') {
      setInteractionNotice(outcome.error.message);
      return;
    }
    if (outcome.status === 'APPLIED') {
      setInteractionNotice(null);
    }
  }, []);

  const increaseOrAdd = useCallback(
    async (item: CustomerKitchenMenuItemSummary) => {
      if (revalidatingItemId !== null) {
        return;
      }

      setInteractionNotice(null);
      setRevalidatingItemId(item.id);
      try {
        const refreshed = await profileQuery.refetch();
        if (refreshed.isError || !refreshed.data) {
          setInteractionNotice(toAppApiError(refreshed.error).message);
          return;
        }

        const latest = refreshed.data.menuItems.find(menuItem => menuItem.id === item.id);
        if (!latest) {
          setInteractionNotice('This dish is no longer available from this kitchen.');
          return;
        }
        if (
          latest.price.amount !== item.price.amount ||
          latest.price.currency !== item.price.currency
        ) {
          setInteractionNotice(
            `The price changed to ${formatDishDetailPrice(
              latest.price.amount,
              latest.price.currency,
            )}. Review the updated price and try again.`,
          );
          return;
        }

        const currentLine =
          cartSnapshot?.lines.find(line => line.menuItemId === item.id) ?? null;
        const outcome = currentLine
          ? await dispatch(
              setCartItemQuantity({
                lineId: currentLine.lineId,
                quantity: currentLine.quantity + 1,
              }),
            )
          : await dispatch(addCartItem({menuItemId: item.id, quantity: 1}));
        handleCartOutcome(outcome);
      } finally {
        setRevalidatingItemId(null);
      }
    },
    [
      cartSnapshot?.lines,
      dispatch,
      handleCartOutcome,
      profileQuery,
      revalidatingItemId,
    ],
  );

  const decreaseQuantity = useCallback(
    async (line: CartLine) => {
      setInteractionNotice(null);
      const outcome =
        line.quantity <= 1
          ? await dispatch(removeCartItem({lineId: line.lineId}))
          : await dispatch(
              setCartItemQuantity({
                lineId: line.lineId,
                quantity: line.quantity - 1,
              }),
            );
      handleCartOutcome(outcome);
    },
    [dispatch, handleCartOutcome],
  );

  const handleFavoriteToggle = useCallback(
    (menuItemId: string, favorite: boolean) => {
      if (favorites.sessionRequired || toggleFavorite.isPending) return;
      setInteractionNotice(null);
      toggleFavorite.mutate(
        {menuItemId, favorite},
        {onError: () => setInteractionNotice('Favorite could not be updated. Please try again.')},
      );
    },
    [favorites.sessionRequired, toggleFavorite],
  );

  const openDish = useCallback(
    (menuItemId: string) => {
      navigation.navigate('CustomerDishDetail', {menuItemId});
    },
    [navigation],
  );

  const chooseCategory = useCallback((category: string) => {
    setSelectedCategory(category);
    scrollOffsetRef.current = 0;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({offset: 0, animated: true});
    });
  }, []);

  const renderDish = useCallback(
    ({item}: ListRenderItemInfo<CustomerKitchenMenuItemSummary>) => {
      const cartLine =
        cartSnapshot?.lines.find(line => line.menuItemId === item.id) ?? null;
      const menuMutationPending =
        cartMutations[`menu:${item.id}`]?.status === 'PENDING';
      const lineMutationPending = cartLine
        ? cartMutations[`line:${cartLine.lineId}`]?.status === 'PENDING'
        : false;
      const busy =
        revalidatingItemId !== null || menuMutationPending || lineMutationPending;

      return (
        <KitchenDishRow
          item={item}
          cartLine={cartLine}
          busy={busy}
          favorite={isFavoriteMenuItem(favorites.data, item.id)}
          favoritePending={toggleFavorite.isPending}
          favoriteDisabled={favorites.sessionRequired}
          onFavoriteToggle={handleFavoriteToggle}
          onOpen={openDish}
          onIncrease={increaseOrAdd}
          onDecrease={decreaseQuantity}
        />
      );
    },
    [
      cartMutations,
      cartSnapshot?.lines,
      decreaseQuantity,
      increaseOrAdd,
      openDish,
      favorites.data,
      favorites.sessionRequired,
      handleFavoriteToggle,
      toggleFavorite.isPending,
      revalidatingItemId,
    ],
  );

  if (profileQuery.invalidKitchenId) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-kitchen-dishes-invalid">
        <TerminalState
          title="Kitchen unavailable"
          description="This kitchen link is invalid."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (profileQuery.sessionRequired) {
    return (
      <ScreenShell
        keyboardAvoiding={false}
        testID="customer-kitchen-dishes-session-required">
        <TerminalState
          title="Sign in required"
          description="Your customer session is required to view this menu."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (profileQuery.isPending && !profile) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-kitchen-dishes-loading">
        <KitchenDishesSkeleton />
      </ScreenShell>
    );
  }

  if (!profile) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-kitchen-dishes-error">
        <TerminalState
          title={offline ? 'You appear to be offline' : 'Menu could not be loaded'}
          description={queryError?.message ?? 'Try again to load this kitchen menu.'}
          actionLabel="Try again"
          onAction={() => profileQuery.refetch()}
          secondaryActionLabel="Go back"
          onSecondaryAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  const kitchenName = profile.displayName ?? profile.kitchenName;
  const listHeader = (
    <View style={styles.listHeader}>
      <Text accessibilityRole="header" style={styles.pageTitle}>
        All Dishes
      </Text>
      <Text numberOfLines={2} style={styles.kitchenName}>
        {kitchenName}
      </Text>
      <Text style={styles.menuSummary}>
        {profile.menuItems.length === 1
          ? '1 dish available now'
          : `${profile.menuItems.length} dishes available now`}
      </Text>

      {interactionNotice ? (
        <RecoverableErrorBanner message={interactionNotice} style={styles.notice} />
      ) : null}
      {queryError ? (
        offline ? (
          <OfflineNotice
            message={queryError.message}
            onRetry={() => profileQuery.refetch()}
            style={styles.notice}
          />
        ) : (
          <RecoverableErrorBanner
            message={queryError.message}
            onRetry={() => profileQuery.refetch()}
            style={styles.notice}
          />
        )
      ) : null}

      {categories.length > 1 ? (
        <ScrollView
          horizontal
          contentContainerStyle={styles.categoryRow}
          showsHorizontalScrollIndicator={false}>
          {[ALL_KITCHEN_DISHES_CATEGORY, ...categories].map(category => {
            const selected = effectiveCategory === category;
            const label =
              category === ALL_KITCHEN_DISHES_CATEGORY ? 'All' : category;
            return (
              <Pressable
                key={category}
                accessibilityLabel={`Show ${label} dishes`}
                accessibilityRole="button"
                accessibilityState={{selected}}
                onPress={() => chooseCategory(category)}
                style={({pressed}) => [
                  styles.categoryChip,
                  selected && styles.categoryChipSelected,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.categoryChipText,
                    selected && styles.categoryChipTextSelected,
                  ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <ScreenShell
      edges={['top', 'bottom']}
      keyboardAvoiding={false}
      testID="customer-kitchen-dishes">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to kitchen profile"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.headerAction, pressed && styles.pressed]}>
            <Icon name="arrow-left" />
          </Pressable>
          <Text numberOfLines={1} style={styles.headerTitle}>
            Menu
          </Text>
          <View accessibilityLabel={`${cartCount} items in cart`} style={styles.headerCartSummary}>
            <Text style={styles.headerCartCount}>{cartCount}</Text>
            <Text style={styles.headerCartLabel}>in cart</Text>
          </View>
        </View>

        <FlatList
          ref={listRef}
          contentContainerStyle={styles.listContent}
          data={dishes}
          initialNumToRender={8}
          ItemSeparatorComponent={DishSeparator}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {profile.menuItems.length === 0
                  ? 'No dishes available right now'
                  : 'No dishes in this category'}
              </Text>
              <Text style={styles.emptyBody}>
                {profile.menuItems.length === 0
                  ? 'Pull to refresh to check this kitchen again.'
                  : 'Choose another category to see the rest of this kitchen menu.'}
              </Text>
            </View>
          }
          ListHeaderComponent={listHeader}
          maxToRenderPerBatch={8}
          onMomentumScrollEnd={saveScrollOffset}
          onRefresh={() => profileQuery.refetch()}
          onScroll={saveScrollOffset}
          refreshing={profileQuery.isRefetching && revalidatingItemId === null}
          renderItem={renderDish}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          windowSize={7}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surfaceBase,
  },
  header: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  headerAction: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  headerCartSummary: {
    width: 64,
    alignItems: 'flex-end',
  },
  headerCartCount: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  headerCartLabel: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  pageTitle: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  kitchenName: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  menuSummary: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  notice: {
    marginTop: spacing.md,
  },
  categoryRow: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingRight: spacing.md,
  },
  categoryChip: {
    minHeight: touchTarget.minimum,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipSelected: {
    borderColor: colors.flameRed,
    backgroundColor: colors.flameRed,
  },
  categoryChipText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  categoryChipTextSelected: {
    color: colors.white,
  },
  separator: {
    height: spacing.sm,
  },
  favoriteButton: {position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 4},
  dishCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  dishMain: {
    flexDirection: 'row',
    minHeight: 132,
  },
  dishImage: {
    width: 124,
    minHeight: 132,
    backgroundColor: colors.surfaceMuted,
  },
  dishImageFallback: {
    width: 124,
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    backgroundColor: colors.white,
  },
  dishImageFallbackText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  dishCopy: {
    flex: 1,
    padding: spacing.sm,
  },
  dishTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  dishCategory: {
    marginTop: spacing.xxs,
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  dishMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  dishDescription: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  dishPrice: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  addButton: {
    minHeight: touchTarget.comfortable,
    margin: spacing.sm,
    marginTop: 0,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
  },
  addButtonText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  quantityControl: {
    minHeight: touchTarget.comfortable,
    margin: spacing.sm,
    marginTop: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  quantityText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  emptyCard: {
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.55,
  },
  skeletonWrap: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  skeletonTitle: {
    height: 32,
    width: '55%',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonChipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  skeletonChip: {
    width: 88,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCard: {
    height: 184,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
