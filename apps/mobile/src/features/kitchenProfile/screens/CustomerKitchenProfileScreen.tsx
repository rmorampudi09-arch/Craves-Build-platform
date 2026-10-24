import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {askKitchenSwitch} from '../../cart/components/KitchenSwitchDialog';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {BlurTargetView} from 'expo-blur';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {
  CustomerDishDetailStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
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
import {Icon} from '../../../shared/components/Icon';
import {LiquidGlassSurface} from '../../../shared/components/LiquidGlassSurface';
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
  switchCartKitchen,
  type CartMutationOutcome,
} from '../../cart/state/cartMutations';
import {formatDishDetailPrice} from '../../dishDetail/dishDetailPurchase';
import {CustomerChefFace} from '../../customerShell/components/CustomerChefFace';
import {KitchenImageCarousel} from '../../home/components/KitchenImageCarousel';
import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';
import {
  isFavoriteMenuItem,
  useCustomerFavoritesQuery,
  useToggleCustomerFavorite,
} from '../../favorites/query/customerFavoritesQueries';
import {
  useFavoriteKitchensQuery,
  useToggleFavoriteKitchen,
} from '../../favorites/query/homeFavoriteQueries';
import {
  PUBLIC_KITCHEN_REVIEWS_AVAILABLE,
  publicKitchenReviewsApi,
  type PublicKitchenReview,
  type PublicKitchenReviewSummary,
} from '../../reviews/api/publicKitchenReviewsApi';
import type {CustomerKitchenMenuItemSummary} from '../api/kitchenProfileApi';
import {CustomerKitchenMenuCard} from '../components/CustomerKitchenMenuCard';
import {
  formatCustomerKitchenJoinedLabel,
  formatCustomerKitchenLocation,
  formatCustomerKitchenPrepRange,
  getActiveMenuSectionIndex,
  getCustomerKitchenFoodMixLabel,
  getCustomerKitchenInitials,
  groupCustomerKitchenMenu,
} from '../kitchenProfilePresentation';
import {
  useCustomerKitchenAvailabilityQuery,
  useCustomerKitchenProfileQuery,
} from '../query/kitchenProfileQueries';
import {menuCategoryLabel} from '../../../shared/catalog/menuCategories';

type KitchenProfileRoute = RouteProp<
  CustomerDishDetailStackParamList,
  'CustomerKitchenProfile'
>;
type KitchenProfileNavigation = NavigationProp<
  CustomerDishDetailStackParamList,
  'CustomerKitchenProfile'
>;

const REVIEW_PREVIEW_LIMIT = 3;
/** Kitchen photos are 4:3; they play whole at full width from the top of the screen. */
const PHOTO_ASPECT = 3 / 4;
const AVATAR_SIZE = 92;

function formatReviewPublishedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

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

export function CustomerKitchenProfileScreen() {
  const navigation = useNavigation<KitchenProfileNavigation>();
  const route = useRoute<KitchenProfileRoute>();
  const dispatch = useAppDispatch();
  const profileQuery = useCustomerKitchenProfileQuery(route.params.kitchenId);
  const availabilityQuery = useCustomerKitchenAvailabilityQuery(
    route.params.kitchenId,
  );
  const favorites = useCustomerFavoritesQuery();
  const toggleFavorite = useToggleCustomerFavorite();
  const favoriteKitchens = useFavoriteKitchensQuery();
  const toggleFavoriteKitchen = useToggleFavoriteKitchen();
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const cartMutations = useAppSelector(state => state.cart.mutations);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const tabsScrollRef = useRef<ScrollView>(null);
  const tabsHeightRef = useRef(0);
  const tabXRef = useRef<number[]>([]);
  const menuTopRef = useRef(0);
  const sectionTopsRef = useRef<number[]>([]);
  const [headerTitleVisible, setHeaderTitleVisible] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const [revalidatingItemId, setRevalidatingItemId] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] =
    useState<PublicKitchenReviewSummary | null>(null);
  const [reviewPreview, setReviewPreview] = useState<PublicKitchenReview[]>([]);
  const [reviewLoadError, setReviewLoadError] = useState<string | null>(null);
  const {width: windowWidth} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screenFocused = useIsFocused();
  const photoTarget = useRef<View | null>(null);

  const profile = profileQuery.data;
  const hasPhotos = (profile?.kitchenPhotoUrls.length ?? 0) > 0;
  const headerHeight = insets.top + spacing.xxs + touchTarget.minimum + spacing.xs;
  // Without photos the avatar starts just under the header buttons.
  const photoHeight = hasPhotos
    ? Math.round(windowWidth * PHOTO_ASPECT)
    : headerHeight + AVATAR_SIZE / 2;
  /** The header turns white and shows the kitchen name once the avatar has scrolled under it. */
  const headerTitleOffset = photoHeight + AVATAR_SIZE / 2 - headerHeight;
  const queryError = profileQuery.error ? toAppApiError(profileQuery.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const sections = useMemo(
    () => groupCustomerKitchenMenu(profile?.menuItems ?? []),
    [profile?.menuItems],
  );
  // shortcut: only checks the loaded pages of saved kitchens; fine while lists are short.
  const kitchenFavorite = favoriteKitchens.items.some(
    item => item.kitchenId === route.params.kitchenId,
  );

  const loadPublicReviews = useCallback(async () => {
    if (!PUBLIC_KITCHEN_REVIEWS_AVAILABLE) {
      setReviewSummary(null);
      setReviewPreview([]);
      setReviewLoadError(null);
      return;
    }

    setReviewLoadError(null);
    try {
      const [summary, page] = await Promise.all([
        publicKitchenReviewsApi.summary(route.params.kitchenId),
        publicKitchenReviewsApi.list(route.params.kitchenId, {
          limit: REVIEW_PREVIEW_LIMIT,
        }),
      ]);
      setReviewSummary(summary);
      setReviewPreview(page.items);
    } catch (error) {
      setReviewLoadError(toAppApiError(error).message);
    }
  }, [route.params.kitchenId]);

  useEffect(() => {
    void loadPublicReviews();
  }, [loadPublicReviews]);

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

  // Keep the active category tab in view when the tabs overflow the screen.
  useEffect(() => {
    const x = tabXRef.current[activeSection];
    if (x !== undefined) {
      tabsScrollRef.current?.scrollTo({x: Math.max(0, x - spacing.md), animated: true});
    }
  }, [activeSection]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
      scrollOffsetRef.current = contentOffset.y;
      setHeaderTitleVisible(contentOffset.y > headerTitleOffset);
      if (sections.length === 0) return;
      // The last sections may be too short to reach the tabs, so the end of the page selects the last one.
      const atEnd =
        contentOffset.y + layoutMeasurement.height >= contentSize.height - spacing.xxs;
      const tops = sections.map(
        (_, index) => menuTopRef.current + (sectionTopsRef.current[index] ?? Infinity),
      );
      setActiveSection(
        atEnd
          ? sections.length - 1
          : getActiveMenuSectionIndex(tops, contentOffset.y + tabsHeightRef.current + 1),
      );
    },
    [headerTitleOffset, sections],
  );

  const scrollToSection = (index: number) => {
    setActiveSection(index);
    scrollRef.current?.scrollTo({
      y: Math.max(
        0,
        menuTopRef.current + (sectionTopsRef.current[index] ?? 0) - tabsHeightRef.current,
      ),
      animated: true,
    });
  };

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
      const otherKitchen =
        currentLine == null
          ? cartSnapshot?.lines.find(
              line => line.kitchenId !== route.params.kitchenId,
            ) ?? null
          : null;
      if (otherKitchen && cartSnapshot) {
        const expectedSnapshot = cartSnapshot;
        askKitchenSwitch({
          cartLines: expectedSnapshot.lines,
          newDish: {
            name: latest.itemName,
            kitchenName: refreshed.data.displayName ?? refreshed.data.kitchenName,
            priceLabel: formatDishDetailPrice(latest.price.amount, latest.price.currency),
            imageUrl: (latest.images.find(image => image.primary) ?? latest.images[0])?.url,
          },
          onReplace: () => {
            dispatch(
              switchCartKitchen({
                expectedSnapshot,
                menuItemId: latest.id,
                quantity: 1,
                expectedKitchenId: route.params.kitchenId,
              }),
            )
              .then(handleCartOutcome)
              .catch(() =>
                setInteractionNotice(
                  'We couldn’t confirm the cart change. Check your cart before trying again.',
                ),
              );
          },
        });
        return;
      }
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

  const handleKitchenFavorite = () => {
    if (!favoriteKitchens.identityId || toggleFavoriteKitchen.isPending) return;
    setInteractionNotice(null);
    toggleFavoriteKitchen.mutate(
      {kitchenId: route.params.kitchenId, favorite: kitchenFavorite},
      {onError: () => setInteractionNotice('Favorite could not be updated. Please try again.')},
    );
  };

  const openDish = useCallback(
    (menuItemId: string) => {
      navigation.navigate('CustomerDishDetail', {menuItemId});
    },
    [navigation],
  );

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
          illustration={offline ? 'offline' : 'loadError'}
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
  const dishCount = profile.menuItems.length;
  const facts = [
    `${dishCount} ${dishCount === 1 ? 'dish' : 'dishes'}`,
    getCustomerKitchenFoodMixLabel(profile.menuItems),
    formatCustomerKitchenPrepRange(profile.menuItems),
  ].filter(Boolean);
  const subtitle = [
    profile.displayName && profile.displayName !== profile.kitchenName ? profile.kitchenName : null,
    location,
    joinedLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  // Over the photo the buttons are glass with white icons; on the white header they are bare red icons.
  const onPhoto = hasPhotos && !headerTitleVisible;
  const headerControlStyle = styles.headerControl;
  const backButton = (
    <Pressable
      accessibilityLabel="Back"
      accessibilityRole="button"
      onPress={() => navigation.goBack()}
      style={({pressed}) => [headerControlStyle, pressed && styles.pressed]}>
      <Icon name="arrow-left" surface={false} color={onPhoto ? colors.white : colors.flameRed} />
    </Pressable>
  );
  const heartButton = (
    <CustomerFavoriteHeartButton
      favorite={kitchenFavorite}
      pending={toggleFavoriteKitchen.isPending}
      disabled={!favoriteKitchens.identityId}
      inactiveColor={onPhoto ? colors.white : colors.flameRed}
      itemLabel={kitchenName}
      onToggle={handleKitchenFavorite}
      style={headerControlStyle}
    />
  );

  return (
    <ScreenShell
      backgroundColor={colors.white}
      edges={['bottom']}
      keyboardAvoiding={false}
      statusBarStyle={onPhoto ? 'light-content' : 'dark-content'}
      testID="customer-kitchen-profile">
      <View style={styles.screen}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          onMomentumScrollEnd={handleScroll}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          stickyHeaderIndices={[1]}
          refreshControl={
            <RefreshControl
              colors={[colors.flameRed]}
              onRefresh={() => {
                void profileQuery.refetch();
                if (availabilityQuery.available) {
                  void availabilityQuery.refetch();
                }
                void loadPublicReviews();
              }}
              progressViewOffset={headerHeight}
              refreshing={profileQuery.isRefetching && revalidatingItemId === null}
              tintColor={colors.flameRed}
            />
          }
          showsVerticalScrollIndicator={false}>
          <View>
            <View style={{height: photoHeight}}>
              {hasPhotos ? (
                <>
                  <BlurTargetView ref={photoTarget} style={StyleSheet.absoluteFill}>
                    <KitchenImageCarousel
                      imageUrls={profile.kitchenPhotoUrls}
                      width={windowWidth}
                      height={photoHeight}
                      kitchenName={profile.kitchenName}
                      active={screenFocused}
                      onPress={() => undefined}
                      pager="glass-right"
                    />
                  </BlurTargetView>
                  {/* Keeps the white status bar readable on a bright photo. */}
                  <View pointerEvents="none" style={[styles.photoShade, {height: headerHeight}]}>
                    <Svg width="100%" height="100%">
                      <Defs>
                        <LinearGradient id="kitchenPhotoShade" x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor={colors.black} stopOpacity={0.3} />
                          <Stop offset="1" stopColor={colors.black} stopOpacity={0} />
                        </LinearGradient>
                      </Defs>
                      <Rect width="100%" height="100%" fill="url(#kitchenPhotoShade)" />
                    </Svg>
                  </View>
                </>
              ) : null}
            </View>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <CustomerChefFace
                  url={profile.chefPhotoUrl}
                  fallback={<Text style={styles.avatarInitials}>{initials}</Text>}
                />
              </View>
              {availabilityQuery.available && availabilityQuery.data ? (
                <View
                  style={[
                    styles.currentAvailabilityBadge,
                    availabilityQuery.data.availableNow
                      ? styles.currentAvailabilityOpen
                      : styles.currentAvailabilityClosed,
                  ]}>
                  <Text
                    style={[
                      styles.currentAvailabilityText,
                      availabilityQuery.data.availableNow
                        ? styles.currentAvailabilityOpenText
                        : styles.currentAvailabilityClosedText,
                    ]}>
                    {availabilityQuery.data.availableNow
                      ? 'Available now'
                      : availabilityQuery.data.paused
                        ? 'Paused'
                        : !availabilityQuery.data.acceptingOrders
                          ? 'Not accepting orders'
                          : 'Closed right now'}
                  </Text>
                </View>
              ) : null}
              <Text accessibilityRole="header" style={styles.kitchenName}>
                {kitchenName}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              {facts.length > 0 ? (
                <View style={styles.facts}>
                  {facts.map(fact => (
                    <View key={fact} style={styles.fact}>
                      <Text style={styles.factText}>{fact}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {profile.biography ? (
                <>
                  <Text
                    numberOfLines={descriptionExpanded ? undefined : 3}
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
              ) : null}
            </View>

            <View style={styles.content}>
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

              {PUBLIC_KITCHEN_REVIEWS_AVAILABLE && reviewSummary ? (
                <View style={styles.section}>
                  <View style={styles.reviewHeadingRow}>
                    <View>
                      <Text style={styles.sectionTitle}>Ratings & reviews</Text>
                      <Text style={styles.sectionCaption}>
                        Published customer feedback for this kitchen
                      </Text>
                    </View>
                    {reviewSummary.reviewCount > 0 &&
                    reviewSummary.overallAverage !== null ? (
                      <View style={styles.reviewScorePill}>
                        <Text style={styles.reviewScoreText}>
                          {reviewSummary.overallAverage.toFixed(1)} ★
                        </Text>
                        <Text style={styles.reviewCountText}>
                          {reviewSummary.reviewCount}{' '}
                          {reviewSummary.reviewCount === 1 ? 'review' : 'reviews'}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {reviewLoadError ? (
                    <RecoverableErrorBanner
                      message={reviewLoadError}
                      onRetry={() => { loadPublicReviews().catch(() => undefined); }}
                      style={styles.notice}
                    />
                  ) : reviewSummary.reviewCount === 0 ? (
                    <View style={styles.emptyReviewsCard}>
                      <Text style={styles.emptyReviewsText}>
                        No published reviews yet.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.reviewList}>
                      {reviewPreview.map(review => (
                        <View key={review.reviewId} style={styles.reviewCard}>
                          <View style={styles.reviewCardHeader}>
                            <Text style={styles.reviewRating}>
                              {review.overallRating} ★
                            </Text>
                            <Text style={styles.reviewDate}>
                              {formatReviewPublishedAt(review.publishedAt)}
                            </Text>
                          </View>
                          {review.reviewText ? (
                            <Text style={styles.reviewText}>{review.reviewText}</Text>
                          ) : null}
                          {review.tagCodes.length > 0 ? (
                            <View style={styles.reviewTags}>
                              {review.tagCodes.map(code => (
                                <View key={code} style={styles.reviewTag}>
                                  <Text style={styles.reviewTagText}>
                                    {code.replace(/_/g, ' ')}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          </View>

          {/* Sticky category tabs; must stay child index 1 of the ScrollView.
              The clear spacer above them (pulled up by the same height) makes them stop under the header. */}
          <View
            onLayout={event => {
              tabsHeightRef.current = event.nativeEvent.layout.height;
            }}
            pointerEvents="box-none"
            style={sections.length > 0 ? {marginTop: -headerHeight} : undefined}>
            {sections.length > 0 ? (
              <>
                <View pointerEvents="none" style={{height: headerHeight}} />
                <ScrollView
                  ref={tabsScrollRef}
                  contentContainerStyle={styles.tabsContent}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.tabsBar}>
                  {sections.map((section, index) => {
                    const selected = index === activeSection;
                    return (
                      <Pressable
                        key={section.category}
                        accessibilityRole="tab"
                        accessibilityState={{selected}}
                        onLayout={event => {
                          tabXRef.current[index] = event.nativeEvent.layout.x;
                        }}
                        onPress={() => scrollToSection(index)}
                        style={[styles.tab, selected && styles.tabSelected]}>
                        <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                          {menuCategoryLabel(section.category)}
                        </Text>
                        <Text style={styles.tabCount}>{section.items.length}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}
          </View>

          <View
            onLayout={event => {
              menuTopRef.current = event.nativeEvent.layout.y;
            }}
            style={styles.menu}>
            {sections.length > 0 ? (
              sections.map((section, sectionIndex) => (
                <View
                  key={section.category}
                  onLayout={event => {
                    sectionTopsRef.current[sectionIndex] = event.nativeEvent.layout.y;
                  }}>
                  <View style={styles.sectionHeading}>
                    <Text accessibilityRole="header" style={styles.sectionHeadingTitle}>
                      {menuCategoryLabel(section.category)}
                    </Text>
                    <Text style={styles.sectionHeadingCount}>
                      {section.items.length} {section.items.length === 1 ? 'dish' : 'dishes'}
                    </Text>
                  </View>
                  {section.items.map((item, itemIndex) => {
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
                      <View key={item.id} style={itemIndex > 0 && styles.rowDivider}>
                        <CustomerKitchenMenuCard
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
                      </View>
                    );
                  })}
                </View>
              ))
            ) : (
              <TerminalState
                illustration="kitchenNoDishes"
                title="No dishes right now"
                description={`${kitchenName} hasn't put up today's dishes yet. Save this kitchen to find it again, or see other home chefs.`}
                actionLabel="See other home chefs"
                onAction={() =>
                  navigation
                    .getParent<NavigationProp<CustomerTabParamList>>()
                    ?.navigate('Chefs', {screen: 'CustomerChefsRoot', pop: true})
                }
                secondaryActionLabel={
                  kitchenFavorite || !favoriteKitchens.identityId ? undefined : 'Save this kitchen'
                }
                onSecondaryAction={handleKitchenFavorite}
                style={styles.emptyMenu}
                testID="customer-kitchen-empty-menu"
              />
            )}
          </View>
        </ScrollView>

        <View pointerEvents="box-none" style={styles.headerOverlay}>
          <View
            pointerEvents={headerTitleVisible ? 'auto' : 'box-none'}
            style={[
              styles.header,
              {paddingTop: insets.top + spacing.xxs},
              headerTitleVisible && styles.headerSolid,
            ]}>
            {onPhoto ? (
              <LiquidGlassSurface appearance="home" blurTarget={photoTarget} style={styles.headerGlass}>
                {backButton}
              </LiquidGlassSurface>
            ) : (
              backButton
            )}
            <View pointerEvents="none" style={styles.headerTitleRow}>
              {headerTitleVisible ? (
                <>
                  <View style={styles.headerAvatar}>
                    <CustomerChefFace
                      url={profile.chefPhotoUrl}
                      fallback={<Text style={styles.headerAvatarText}>{initials}</Text>}
                    />
                  </View>
                  <Text numberOfLines={1} style={styles.headerTitle}>
                    {kitchenName}
                  </Text>
                </>
              ) : null}
            </View>
            {onPhoto ? (
              <LiquidGlassSurface appearance="home" blurTarget={photoTarget} style={styles.headerGlass}>
                {heartButton}
              </LiquidGlassSurface>
            ) : (
              heartButton
            )}
          </View>
          {interactionNotice ? (
            <RecoverableErrorBanner message={interactionNotice} style={styles.pinnedNotice} />
          ) : null}
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerSolid: {
    backgroundColor: colors.white,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  headerGlass: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  headerControl: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  headerTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.cream,
  },
  headerAvatarText: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.extrabold,
  },
  headerTitle: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  pinnedNotice: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  photoShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  identity: {
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    marginTop: -AVATAR_SIZE / 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.cream,
    ...elevation.card,
  },
  avatarInitials: {
    color: colors.flameRed,
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
  },
  currentAvailabilityBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  currentAvailabilityOpen: {backgroundColor: colors.successSoft},
  currentAvailabilityClosed: {backgroundColor: colors.warningSoft},
  currentAvailabilityText: {
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  currentAvailabilityOpenText: {color: colors.success},
  currentAvailabilityClosedText: {color: colors.warningText},
  kitchenName: {
    marginTop: spacing.xs,
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  fact: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  factText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  bodyText: {
    marginTop: spacing.xs,
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
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  notice: {
    marginTop: spacing.md,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  reviewHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reviewScorePill: {
    flexShrink: 0,
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  reviewScoreText: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  reviewCountText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  reviewList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  reviewCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reviewRating: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  reviewDate: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  reviewText: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  reviewTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  reviewTag: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  reviewTagText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.medium,
  },
  emptyReviewsCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  emptyReviewsText: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  tabsBar: {
    flexGrow: 0,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  tabsContent: {
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  tab: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabSelected: {
    borderBottomColor: colors.flameRedAccessible,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  tabTextSelected: {
    color: colors.espressoBrown,
    fontWeight: fontWeight.bold,
  },
  tabCount: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  menu: {
    paddingHorizontal: spacing.md,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    paddingTop: spacing.lg,
  },
  sectionHeadingTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  sectionHeadingCount: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  emptyMenu: {
    flex: 0,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.lg,
  },
  pressed: {
    opacity: 0.82,
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
