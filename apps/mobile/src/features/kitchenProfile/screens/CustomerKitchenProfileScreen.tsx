import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
import type {CustomerKitchenMenuItemSummary} from '../api/kitchenProfileApi';
import {
  formatCustomerKitchenJoinedLabel,
  formatCustomerKitchenLocation,
  getCustomerKitchenInitials,
  getCustomerKitchenMenuImage,
  getCustomerKitchenMenuPreview,
} from '../kitchenProfilePresentation';
import {useCustomerKitchenProfileQuery} from '../query/kitchenProfileQueries';

type KitchenProfileRoute = RouteProp<
  CustomerDishDetailStackParamList,
  'CustomerKitchenProfile'
>;
type KitchenProfileNavigation = NavigationProp<
  CustomerDishDetailStackParamList,
  'CustomerKitchenProfile'
>;

const MENU_PREVIEW_LIMIT = 4;

function KitchenProfileSkeleton() {
  return (
    <View
      accessibilityLabel="Loading kitchen profile"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonHero} />
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

function foodTypeLabel(foodType: CustomerKitchenMenuItemSummary['foodType']): string {
  if (foodType === 'NON_VEG') {
    return 'Non-veg';
  }
  if (foodType === 'EGG') {
    return 'Egg';
  }
  return 'Veg';
}

interface MenuPreviewCardProps {
  item: CustomerKitchenMenuItemSummary;
  cartLine: CartLine | null;
  busy: boolean;
  onOpen: (menuItemId: string) => void;
  onIncrease: (item: CustomerKitchenMenuItemSummary) => void;
  onDecrease: (line: CartLine) => void;
}

function MenuPreviewCard({
  item,
  cartLine,
  busy,
  onOpen,
  onIncrease,
  onDecrease,
}: MenuPreviewCardProps) {
  const image = getCustomerKitchenMenuImage(item);
  const metadata = [
    foodTypeLabel(item.foodType),
    item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <View style={styles.menuCard}>
      <Pressable
        accessibilityLabel={`Open ${item.itemName}`}
        accessibilityRole="button"
        onPress={() => onOpen(item.id)}
        style={({pressed}) => [styles.menuOpenArea, pressed && styles.pressed]}>
        {image ? (
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel={`${item.itemName} image`}
            source={{uri: image.url}}
            resizeMode="cover"
            style={styles.menuImage}
          />
        ) : (
          <View style={styles.menuImageFallback}>
            <Text style={styles.menuImageFallbackText}>{item.category}</Text>
          </View>
        )}
        <View style={styles.menuCopy}>
          <Text numberOfLines={2} style={styles.menuTitle}>
            {item.itemName}
          </Text>
          <Text numberOfLines={1} style={styles.menuMeta}>
            {item.category} • {metadata}
          </Text>
          <Text style={styles.menuPrice}>
            {formatDishDetailPrice(item.price.amount, item.price.currency)}
          </Text>
        </View>
      </Pressable>

      {cartLine ? (
        <View style={styles.quantityControl}>
          <Pressable
            accessibilityLabel={`Decrease ${item.itemName} quantity`}
            accessibilityRole="button"
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
          <Text style={styles.addButtonText}>{busy ? 'Adding…' : 'Add'}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function CustomerKitchenProfileScreen() {
  const navigation = useNavigation<KitchenProfileNavigation>();
  const route = useRoute<KitchenProfileRoute>();
  const dispatch = useAppDispatch();
  const profileQuery = useCustomerKitchenProfileQuery(route.params.kitchenId);
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const cartMutations = useAppSelector(state => state.cart.mutations);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const [menuSectionY, setMenuSectionY] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const [revalidatingItemId, setRevalidatingItemId] = useState<string | null>(null);

  const profile = profileQuery.data;
  const queryError = profileQuery.error ? toAppApiError(profileQuery.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const cartCount =
    cartSnapshot?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0;
  const menuPreview = useMemo(
    () => getCustomerKitchenMenuPreview(profile?.menuItems ?? [], MENU_PREVIEW_LIMIT),
    [profile?.menuItems],
  );

  useFocusEffect(
    useCallback(() => {
      const offset = scrollOffsetRef.current;
      if (offset > 0) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({y: offset, animated: false});
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

  const handleCartOutcome = (outcome: CartMutationOutcome) => {
    if (outcome.status === 'FAILED') {
      setInteractionNotice(outcome.error.message);
      return;
    }
    if (outcome.status === 'APPLIED') {
      setInteractionNotice(null);
    }
  };

  const increaseOrAdd = async (item: CustomerKitchenMenuItemSummary) => {
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
  };

  const decreaseQuantity = async (line: CartLine) => {
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
  };

  const openDish = useCallback(
    (menuItemId: string) => {
      navigation.navigate('CustomerDishDetail', {menuItemId});
    },
    [navigation],
  );

  const openAllDishes = useCallback(() => {
    navigation.navigate('CustomerKitchenDishes', {
      kitchenId: route.params.kitchenId,
    });
  }, [navigation, route.params.kitchenId]);

  const scrollToMenu = () => {
    scrollRef.current?.scrollTo({y: Math.max(0, menuSectionY - spacing.sm), animated: true});
  };

  if (profileQuery.invalidKitchenId) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-kitchen-profile-invalid">
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
      <ScreenShell keyboardAvoiding={false} testID="customer-kitchen-profile-session-required">
        <TerminalState
          title="Sign in required"
          description="Your customer session is required to view this kitchen."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (profileQuery.isPending && !profile) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-kitchen-profile-loading">
        <KitchenProfileSkeleton />
      </ScreenShell>
    );
  }

  if (!profile) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-kitchen-profile-error">
        <TerminalState
          title={offline ? 'You appear to be offline' : 'Kitchen profile could not be loaded'}
          description={queryError?.message ?? 'Try again to load this kitchen.'}
          actionLabel="Try again"
          onAction={() => profileQuery.refetch()}
          secondaryActionLabel="Go back"
          onSecondaryAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  const kitchenName = profile.displayName ?? profile.kitchenName;
  const location = formatCustomerKitchenLocation(profile.location);
  const joinedLabel = formatCustomerKitchenJoinedLabel(profile.joinedAt);
  const initials = getCustomerKitchenInitials(profile);
  const showDescriptionToggle = (profile.biography?.length ?? 0) > 180;

  return (
    <ScreenShell
      edges={['top', 'bottom']}
      keyboardAvoiding={false}
      testID="customer-kitchen-profile">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.headerAction, pressed && styles.pressed]}>
            <Icon name="arrow-left" />
          </Pressable>
          <Text numberOfLines={1} style={styles.headerTitle}>
            Kitchen profile
          </Text>
          <View style={styles.headerCartSummary}>
            <Text style={styles.headerCartCount}>{cartCount}</Text>
            <Text style={styles.headerCartLabel}>in cart</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          onMomentumScrollEnd={saveScrollOffset}
          onScroll={saveScrollOffset}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              colors={[colors.flameRed]}
              onRefresh={() => profileQuery.refetch()}
              refreshing={profileQuery.isRefetching && revalidatingItemId === null}
              tintColor={colors.flameRed}
            />
          }
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroInitials}>{initials}</Text>
              <View style={styles.heroChefBadge}>
                <Icon name="chef" color={colors.flameRed} size={20} />
              </View>
            </View>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active kitchen</Text>
            </View>
            <Text accessibilityRole="header" style={styles.kitchenName}>
              {kitchenName}
            </Text>
            {profile.displayName && profile.displayName !== profile.kitchenName ? (
              <Text style={styles.legalKitchenName}>{profile.kitchenName}</Text>
            ) : null}
            {location ? <Text style={styles.location}>{location}</Text> : null}

            <View style={styles.heroActions}>
              <Pressable
                accessibilityHint="Scrolls to the currently available dishes on this profile"
                accessibilityLabel="Open menu preview"
                accessibilityRole="button"
                onPress={scrollToMenu}
                style={({pressed}) => [styles.primaryAction, pressed && styles.pressed]}>
                <Text style={styles.primaryActionText}>Menu</Text>
              </Pressable>
              <Pressable
                accessibilityHint="Saving kitchens is not available yet"
                accessibilityLabel="Save kitchen"
                accessibilityRole="button"
                onPress={() => setInteractionNotice('Saving kitchens is not available yet.')}
                style={({pressed}) => [styles.secondaryAction, pressed && styles.pressed]}>
                <Text style={styles.secondaryActionText}>Save</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.content}>
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

            <View style={styles.factRow}>
              <View style={styles.factCard}>
                <Text style={styles.factValue}>{profile.menuItems.length}</Text>
                <Text style={styles.factLabel}>
                  {profile.menuItems.length === 1 ? 'dish available' : 'dishes available'}
                </Text>
              </View>
              {joinedLabel ? (
                <View style={styles.factCard}>
                  <Text style={styles.factValue}>{joinedLabel.replace('On Craves since ', '')}</Text>
                  <Text style={styles.factLabel}>on Craves since</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About this kitchen</Text>
              {profile.biography ? (
                <>
                  <Text
                    numberOfLines={descriptionExpanded ? undefined : 4}
                    style={styles.bodyText}>
                    {profile.biography}
                  </Text>
                  {showDescriptionToggle ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setDescriptionExpanded(value => !value)}
                      style={({pressed}) => [styles.inlineAction, pressed && styles.pressed]}>
                      <Text style={styles.inlineActionText}>
                        {descriptionExpanded ? 'Show less' : 'Read more'}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <Text style={styles.bodyText}>
                  This kitchen has not added a public story yet.
                </Text>
              )}
            </View>

            <View style={styles.trustCard}>
              <Text style={styles.trustTitle}>What Craves can confirm</Text>
              <Text style={styles.trustBody}>
                This is an active public kitchen with the available menu shown below.
                Ratings, verification badges and delivery estimates are shown only when
                authoritative data is available.
              </Text>
            </View>

            <View
              onLayout={event => setMenuSectionY(event.nativeEvent.layout.y)}
              style={styles.section}>
              <View style={styles.menuSectionHeading}>
                <View style={styles.menuSectionCopy}>
                  <Text style={styles.sectionTitle}>Available dishes</Text>
                  <Text style={styles.sectionCaption}>
                    Current sellable dishes, kept in the kitchen's published order
                  </Text>
                </View>
                {profile.menuItems.length > 0 ? (
                  <Pressable
                    accessibilityLabel="View all dishes"
                    accessibilityRole="button"
                    onPress={openAllDishes}
                    style={({pressed}) => [
                      styles.previewPill,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.previewPillText}>View all</Text>
                  </Pressable>
                ) : null}
              </View>

              {menuPreview.length > 0 ? (
                <View style={styles.menuList}>
                  {menuPreview.map(item => {
                    const cartLine =
                      cartSnapshot?.lines.find(line => line.menuItemId === item.id) ?? null;
                    const menuMutationPending =
                      cartMutations[`menu:${item.id}`]?.status === 'PENDING';
                    const lineMutationPending = cartLine
                      ? cartMutations[`line:${cartLine.lineId}`]?.status === 'PENDING'
                      : false;
                    const busy =
                      revalidatingItemId === item.id ||
                      menuMutationPending ||
                      lineMutationPending;
                    return (
                      <MenuPreviewCard
                        key={item.id}
                        item={item}
                        cartLine={cartLine}
                        busy={busy}
                        onOpen={openDish}
                        onIncrease={increaseOrAdd}
                        onDecrease={decreaseQuantity}
                      />
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyMenuCard}>
                  <Text style={styles.emptyMenuTitle}>No dishes available right now</Text>
                  <Text style={styles.emptyMenuBody}>
                    Pull to refresh to check this kitchen again.
                  </Text>
                </View>
              )}

              {profile.menuItems.length > MENU_PREVIEW_LIMIT ? (
                <Text style={styles.previewFootnote}>
                  More dishes are available from this kitchen. Use View all to browse the
                  complete current menu.
                </Text>
              ) : null}
            </View>
          </View>
        </ScrollView>
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
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surfaceWarm,
  },
  heroAvatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarmStrong,
    borderWidth: 3,
    borderColor: colors.white,
    ...elevation.card,
  },
  heroInitials: {
    color: colors.flameRed,
    fontSize: typography.title,
    fontWeight: fontWeight.extrabold,
  },
  heroChefBadge: {
    position: 'absolute',
    right: -2,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeBadge: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  activeBadgeText: {
    color: colors.success,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  kitchenName: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
  },
  legalKitchenName: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  location: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  heroActions: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  primaryAction: {
    flex: 1,
    minHeight: touchTarget.comfortable,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    ...elevation.primaryAction,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  secondaryAction: {
    flex: 1,
    minHeight: touchTarget.comfortable,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  secondaryActionText: {
    color: colors.espressoBrown,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  notice: {
    marginTop: spacing.md,
  },
  factRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  factCard: {
    flex: 1,
    minHeight: 84,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  factValue: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  factLabel: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'center',
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  bodyText: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  inlineAction: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
  },
  inlineActionText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  trustCard: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trustTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  trustBody: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  menuSectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  menuSectionCopy: {
    flex: 1,
  },
  sectionCaption: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  previewPill: {
    minHeight: touchTarget.minimum,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPillText: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  menuList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  menuCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  menuOpenArea: {
    flexDirection: 'row',
  },
  menuImage: {
    width: 116,
    height: 116,
    backgroundColor: colors.surfaceMuted,
  },
  menuImageFallback: {
    width: 116,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surfaceWarmStrong,
  },
  menuImageFallbackText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  menuCopy: {
    flex: 1,
    padding: spacing.sm,
  },
  menuTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  menuMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  menuPrice: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  addButton: {
    minHeight: touchTarget.minimum,
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
  emptyMenuCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  emptyMenuTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  emptyMenuBody: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  previewFootnote: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.tiny,
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
  skeletonHero: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonTitle: {
    height: 24,
    width: '60%',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    height: 14,
    width: '82%',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCard: {
    height: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
