import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {CustomerDishDetailStackParamList} from '../../../app/navigation/types';
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
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {
  formatCustomerDishIngredientsBlockerMessage,
  getCustomerDishIngredientsCapabilityState,
} from '../dishIngredientsCapability';
import {useCustomerDishDetailQuery} from '../query/dishDetailQueries';

type DishIngredientsRoute = RouteProp<
  CustomerDishDetailStackParamList,
  'CustomerDishIngredients'
>;

type DishIngredientsNavigation = NavigationProp<
  CustomerDishDetailStackParamList,
  'CustomerDishIngredients'
>;

interface IngredientsHeaderProps {
  onBack: () => void;
}

function IngredientsHeader({onBack}: IngredientsHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Back to dish details"
        accessibilityRole="button"
        onPress={onBack}
        style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
        <Icon name="arrow-left" />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>
        Ingredients
      </Text>
      <View style={styles.headerBalance} />
    </View>
  );
}

function IngredientsSkeleton() {
  return (
    <View
      accessibilityLabel="Loading dish ingredients"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonTitle} />
      {[0, 1, 2, 3].map(index => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonIcon} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonName} />
            <View style={styles.skeletonLine} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function CustomerDishIngredientsScreen() {
  const navigation = useNavigation<DishIngredientsNavigation>();
  const route = useRoute<DishIngredientsRoute>();
  const detail = useCustomerDishDetailQuery(route.params.menuItemId);
  const dish = detail.data;
  const queryError = detail.error ? toAppApiError(detail.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';

  if (detail.invalidMenuItemId) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-dish-ingredients-invalid">
        <IngredientsHeader onBack={() => navigation.goBack()} />
        <TerminalState
          title="Dish unavailable"
          description="This ingredient link is invalid."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (detail.sessionRequired) {
    return (
      <ScreenShell
        keyboardAvoiding={false}
        testID="customer-dish-ingredients-session-required">
        <IngredientsHeader onBack={() => navigation.goBack()} />
        <TerminalState
          title="Sign in required"
          description="Your customer session is required to view dish ingredients."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (detail.isPending && !dish) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-dish-ingredients-loading">
        <IngredientsHeader onBack={() => navigation.goBack()} />
        <IngredientsSkeleton />
      </ScreenShell>
    );
  }

  if (!dish) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-dish-ingredients-error">
        <IngredientsHeader onBack={() => navigation.goBack()} />
        <TerminalState
          title={offline ? 'You appear to be offline' : 'Ingredients could not be loaded'}
          description={queryError?.message ?? 'Try again to load this dish.'}
          actionLabel="Try again"
          onAction={() => detail.refetch()}
          secondaryActionLabel="Go back"
          onSecondaryAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  const capability = getCustomerDishIngredientsCapabilityState(dish.contractGaps);
  const blockerMessage = formatCustomerDishIngredientsBlockerMessage(capability);

  return (
    <ScreenShell
      edges={['top', 'bottom']}
      keyboardAvoiding={false}
      testID="customer-dish-ingredients">
      <View style={styles.screen}>
        <IngredientsHeader onBack={() => navigation.goBack()} />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[colors.flameRed]}
              onRefresh={() => detail.refetch()}
              refreshing={detail.isRefetching}
              tintColor={colors.flameRed}
            />
          }
          showsVerticalScrollIndicator={false}>
          {queryError ? (
            offline ? (
              <OfflineNotice
                message={queryError.message}
                onRetry={() => detail.refetch()}
                style={styles.notice}
              />
            ) : (
              <RecoverableErrorBanner
                message={queryError.message}
                onRetry={() => detail.refetch()}
                style={styles.notice}
              />
            )
          ) : null}

          <View style={styles.dishHeading}>
            <Text style={styles.eyebrow}>{dish.category}</Text>
            <Text style={styles.dishTitle}>{dish.itemName}</Text>
            <Text style={styles.subtitle}>What goes into this dish</Text>
          </View>

          <View style={styles.contractCard}>
            <View style={styles.contractIcon}>
              <Icon name="shield" color={colors.flameRed} />
            </View>
            <View style={styles.contractCopy}>
              <Text style={styles.contractLabel}>Authoritative data required</Text>
              <Text style={styles.contractTitle}>
                {capability.available
                  ? 'Ingredient details are not mapped yet'
                  : 'Ingredient details are unavailable'}
              </Text>
              <Text style={styles.contractBody}>
                {capability.available
                  ? 'The current customer-safe mobile model does not yet map an ingredient list for this dish.'
                  : blockerMessage}
              </Text>
              <Text style={styles.contractBody}>
                Craves will not infer ingredients, allergens, or dietary warnings from the dish name,
                description, or images.
              </Text>
            </View>
          </View>

          <View style={styles.guidanceCard}>
            <Text style={styles.guidanceTitle}>Allergen and dietary information</Text>
            <Text style={styles.guidanceBody}>
              This section will show only backend-provided warnings when the approved ingredient and
              allergen capability is available.
            </Text>
            <Pressable
              accessibilityLabel="Refresh ingredient availability"
              accessibilityRole="button"
              accessibilityState={{busy: detail.isRefetching}}
              disabled={detail.isRefetching}
              onPress={() => detail.refetch()}
              style={({pressed}) => [
                styles.refreshButton,
                detail.isRefetching && styles.disabled,
                pressed && !detail.isRefetching && styles.pressed,
              ]}>
              <Text style={styles.refreshLabel}>
                {detail.isRefetching ? 'Checking…' : 'Check again'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surfaceBase},
  header: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  headerTitle: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  headerBalance: {width: touchTarget.minimum, height: touchTarget.minimum},
  content: {padding: spacing.md, paddingBottom: spacing.xxl},
  notice: {marginBottom: spacing.md},
  dishHeading: {paddingTop: spacing.sm, paddingBottom: spacing.lg},
  eyebrow: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  dishTitle: {
    marginTop: spacing.xs,
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  contractCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  contractIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  contractCopy: {flex: 1, minWidth: 0},
  contractLabel: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  contractTitle: {
    marginTop: spacing.xs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  contractBody: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 22,
  },
  guidanceCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  guidanceTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  guidanceBody: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
    backgroundColor: colors.white,
  },
  refreshLabel: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.45},
  skeletonWrap: {flex: 1, padding: spacing.md},
  skeletonTitle: {
    width: '58%',
    height: 28,
    marginVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  skeletonIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCopy: {flex: 1, gap: spacing.xs},
  skeletonName: {
    width: '52%',
    height: 18,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    width: '82%',
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});