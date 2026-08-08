import React, {useCallback, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {
  CustomerProfileStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import {CUSTOMER_FAVORITES_USER_BLOCKER_COPY} from '../domain/customerFavoritesContract';

type FavoritesNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerFavorites'
>;

type CustomerTabsNavigation = BottomTabNavigationProp<CustomerTabParamList>;

/**
 * P60 registers the Favorites destination and fails closed until an exact
 * server-backed Favorites contract exists. It intentionally does not render
 * fabricated saved dishes, fake category counts, or local-only heart state.
 */
export function CustomerFavoritesScreen() {
  const navigation = useNavigation<FavoritesNavigation>();
  const header = useCustomerHeaderState();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);

  const browseMeals = useCallback(() => {
    const tabs = navigation.getParent<CustomerTabsNavigation>();
    if (tabs) {
      tabs.navigate('Home');
      return;
    }
    navigation.goBack();
  }, [navigation]);

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-favorites">
      <View style={styles.root}>
        <CustomerHeader
          title="Favorites"
          onPressLocation={() => setLocationSelectorVisible(true)}
          onPressNotifications={header.refreshNotifications}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={bottomNavScroll.onScroll}
          scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.introCard}>
              <View style={styles.iconBadge}>
                <Icon name="heart" size={iconSize.lg} color={colors.flameRed} />
              </View>
              <View style={styles.introCopy}>
                <Text accessibilityRole="header" style={styles.title}>
                  Favorites
                </Text>
                <Text style={styles.subtitle}>
                  Saved dishes and kitchens will stay together here when the live account
                  Favorites service is available.
                </Text>
              </View>
            </View>

            <View style={styles.stateCard}>
              <TerminalState
                title="Favorites are not available yet"
                description={CUSTOMER_FAVORITES_USER_BLOCKER_COPY}
                actionLabel="Browse meals"
                onAction={browseMeals}
              />
            </View>

            <View style={styles.educationCard}>
              <Text style={styles.educationTitle}>What this route will support</Text>
              <Text style={styles.educationCopy}>
                Search and category filters, paginated saved dishes, synchronized heart
                removal, opening a dish, and Add to Cart without losing your place. Those
                actions stay disabled until the approved Favorites API contract exists.
              </Text>
            </View>
          </View>
        </ScrollView>
        <CustomerLocationSelector
          visible={locationSelectorVisible}
          onClose={() => setLocationSelectorVisible(false)}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceWarm,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.surfaceWarm,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  introCopy: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  stateCard: {
    minHeight: 320,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  educationCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.creamDeep,
    backgroundColor: colors.white,
  },
  educationTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  educationCopy: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
});
