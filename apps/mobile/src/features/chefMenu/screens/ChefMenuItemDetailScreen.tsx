import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
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
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {
  chefMenuStatusLabel,
  formatChefMenuPrice,
  getChefMenuDisplayState,
  getChefMenuPrimaryImageUrl,
} from '../domain/chefMenuPresentation';
import {useChefMenuModel} from '../state/useChefMenuModel';

type Props = NativeStackScreenProps<
  ChefProductStackParamList,
  'ChefMenuItemDetail'
>;

function DetailRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function ChefMenuItemDetailScreen({navigation, route}: Props) {
  const menu = useChefMenuModel();
  const item = menu.items.find(candidate => candidate.id === route.params.menuItemId);

  if (menu.status === 'pending' && !item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="Back to Chef menu"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.iconButton}>
            <Icon color={colors.espressoBrown} name="arrow-left" size={22} />
          </Pressable>
          <Text style={styles.topBarTitle}>Menu item</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.loadingContent}>
          <SkeletonBlock borderRadius={radius.lg} height={240} width="100%" />
          <SkeletonBlock height={26} width="68%" />
          <SkeletonBlock height={18} width="42%" />
          <SkeletonBlock borderRadius={radius.lg} height={180} width="100%" />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="Back to Chef menu"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.iconButton}>
            <Icon color={colors.espressoBrown} name="arrow-left" size={22} />
          </Pressable>
          <Text style={styles.topBarTitle}>Menu item</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.centerState}>
          <Icon
            color={menu.status === 'error' ? colors.error : colors.textSecondary}
            name={menu.status === 'error' ? 'wifi-off' : 'chef'}
            size={34}
          />
          <Text style={styles.stateTitle}>
            {menu.status === 'error' ? 'Menu item unavailable' : 'Menu item not found'}
          </Text>
          <Text style={styles.stateMessage}>
            {menu.status === 'error'
              ? 'Refresh the Chef menu and try opening this item again.'
              : 'This item is no longer present in your current Chef menu response.'}
          </Text>
          {menu.status === 'error' ? (
            <Pressable
              accessibilityLabel="Retry Chef menu item"
              accessibilityRole="button"
              disabled={menu.isRefreshing}
              onPress={() => menu.refresh().catch(() => undefined)}
              style={({pressed}) => [
                styles.primaryButton,
                (pressed || menu.isRefreshing) && styles.pressed,
              ]}>
              <Text style={styles.primaryButtonText}>
                {menu.isRefreshing ? 'Refreshing…' : 'Try again'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const imageUrl = getChefMenuPrimaryImageUrl(item);
  const displayState = getChefMenuDisplayState(item);
  const busy = Boolean(menu.availabilityStateByItem[item.id]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Back to Chef menu"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}>
          <Icon color={colors.espressoBrown} name="arrow-left" size={22} />
        </Pressable>
        <Text numberOfLines={1} style={styles.topBarTitle}>
          Menu item
        </Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {imageUrl ? (
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel={`${item.itemName} image`}
            resizeMode="cover"
            source={{uri: imageUrl}}
            style={styles.heroImage}
          />
        ) : (
          <View style={styles.heroFallback}>
            <Icon color={colors.flameRed} name="chef" size={44} />
          </View>
        )}

        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={styles.title}>
              {item.itemName}
            </Text>
            <Text style={styles.price}>{formatChefMenuPrice(item)}</Text>
          </View>
          <View style={styles.statePill}>
            <Text style={styles.statePillText}>{chefMenuStatusLabel(displayState)}</Text>
          </View>
        </View>

        {item.description ? (
          <Text style={styles.description}>{item.description}</Text>
        ) : null}

        {menu.feedback ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.feedback,
              menu.feedback.kind === 'success'
                ? styles.feedbackSuccess
                : styles.feedbackError,
            ]}>
            <Text style={styles.feedbackText}>{menu.feedback.message}</Text>
          </View>
        ) : null}

        <View style={styles.availabilityCard}>
          <View style={styles.availabilityCopy}>
            <Text style={styles.availabilityTitle}>Available for sale</Text>
            <Text style={styles.availabilityMessage}>
              Customer-live requires both Active status and availability on.
            </Text>
          </View>
          {busy ? <ActivityIndicator color={colors.flameRed} size="small" /> : null}
          <Switch
            accessibilityLabel={`${item.itemName} availability`}
            accessibilityState={{busy, checked: item.available}}
            disabled={busy}
            onValueChange={available => {
              menu.updateAvailability(item.id, available).catch(() => undefined);
            }}
            thumbColor={colors.white}
            trackColor={{false: colors.borderStrong, true: colors.flameRed}}
            value={item.available}
          />
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Item details</Text>
          <DetailRow label="Category" value={item.category} />
          <DetailRow label="Food type" value={item.foodType.replace('_', ' ')} />
          <DetailRow
            label="Serves"
            value={item.servesCount ? String(item.servesCount) : 'Not provided'}
          />
          <DetailRow
            label="Preparation"
            value={
              item.preparationTimeMinutes
                ? `${item.preparationTimeMinutes} min`
                : 'Not provided'
            }
          />
          <DetailRow label="Spice" value={item.spiceLevel ?? 'Not provided'} />
          <DetailRow label="Package weight" value={`${item.unitPackageWeightGrams} g`} />
          <DetailRow
            label="Thermobox"
            value={item.thermoboxRequired ? 'Required' : 'Not required'}
          />
          <DetailRow label="Backend status" value={item.status} />
        </View>

        <Pressable
          accessibilityLabel={`Edit ${item.itemName}`}
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate('ChefEditMenuItem', {menuItemId: item.id})
          }
          style={({pressed}) => [styles.editAction, pressed && styles.pressed]}>
          <Text style={styles.editActionText}>Edit item</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {backgroundColor: colors.surfaceMuted, flex: 1},
  topBar: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    height: touchTarget.minimum,
    justifyContent: 'center',
    width: touchTarget.minimum,
  },
  topBarTitle: {
    color: colors.espressoBrown,
    flex: 1,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  content: {padding: spacing.md, paddingBottom: spacing.xxxl},
  loadingContent: {gap: spacing.md, padding: spacing.md},
  heroImage: {borderRadius: radius.lg, height: 240, width: '100%'},
  heroFallback: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    height: 240,
    justifyContent: 'center',
    width: '100%',
  },
  headingRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  headingCopy: {flex: 1},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  price: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xxs,
  },
  statePill: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statePillText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.body,
    marginTop: spacing.sm,
  },
  feedback: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  feedbackSuccess: {backgroundColor: colors.successSoft, borderColor: colors.success},
  feedbackError: {backgroundColor: colors.errorSoft, borderColor: colors.error},
  feedbackText: {color: colors.textPrimary, fontSize: typography.small},
  availabilityCard: {
    ...elevation.card,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  availabilityCopy: {flex: 1},
  availabilityTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  availabilityMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  detailCard: {
    ...elevation.card,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  detailRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: touchTarget.minimum,
    paddingVertical: spacing.sm,
  },
  detailLabel: {color: colors.textSecondary, flex: 1, fontSize: typography.small},
  detailValue: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    textAlign: 'right',
  },
  editAction: {
    ...elevation.primaryAction,
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.lg,
  },
  editActionText: {
    color: colors.white,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  stateMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  pressed: {opacity: 0.65},
});
