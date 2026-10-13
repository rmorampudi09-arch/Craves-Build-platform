import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  useNavigation,
  useRoute,
  type CompositeNavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../design/tokens';
import {ChefMenuScreen} from '../../features/chefMenu/screens/ChefMenuScreen';
import {useChefMenuModel} from '../../features/chefMenu/state/useChefMenuModel';
import {ChefScreen, ChefTopBar} from '../../features/chefShell/components/ui';
import {useChefMealPlansQuery} from '../../features/chefSubscription/query/chefMealPlanQueries';
import {ChefMealPlansScreen} from '../../features/chefSubscription/screens/ChefMealPlansScreen';
import {Icon} from '../../shared/components/Icon';
import type {ChefProductStackParamList, ChefTabParamList} from './types';

type ChefMenuNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<ChefTabParamList, 'Menu'>,
  NativeStackNavigationProp<ChefProductStackParamList>
>;

type MenuSegment = 'dishes' | 'plans';

/** `Dishes · 16`; just `Dishes` until the number is known. */
const withCount = (label: string, count: number | undefined) => (count === undefined ? label : `${label} · ${count}`);

/**
 * The Menu tab. It owns the header (title and the "+ Add dish" / "+ New plan" button) and the
 * Dishes / Meal plans toggle, and shows one list under them. The choice lasts while the tab is open.
 */
export function ChefMenuTabScreen() {
  const navigation = useNavigation<ChefMenuNavigation>();
  const {params} = useRoute<RouteProp<ChefTabParamList, 'Menu'>>();
  const [segment, setSegment] = React.useState<MenuSegment>(params?.segment === 'plans' ? 'plans' : 'dishes');
  // Opened for the plans (a meal-plan notification): every new params object moves the toggle, even after the chef chose Dishes.
  const firstParams = React.useRef(params);
  React.useEffect(() => {
    if (params !== firstParams.current && params?.segment === 'plans') setSegment('plans');
  }, [params]);
  const dishes = useChefMenuModel();
  const plans = useChefMealPlansQuery();
  const dishCount = dishes.status === 'success' || dishes.items.length > 0 ? dishes.items.length : undefined;
  const options = [
    {value: 'dishes', label: withCount('Dishes', dishCount)},
    {value: 'plans', label: withCount('Meal plans', plans.data?.length)},
  ] as const;
  const adding = segment === 'dishes' ? 'Add dish' : 'New plan';

  return (
    <ChefScreen
      header={
        <>
          <ChefTopBar
            right={
              <Pressable
                accessibilityLabel={adding}
                accessibilityRole="button"
                hitSlop={{top: 4, bottom: 4}}
                onPress={() =>
                  segment === 'dishes' ? navigation.navigate('ChefAddMenuItem') : navigation.navigate('ChefMealPlanEditor', {})
                }
                style={({pressed}) => [styles.addButton, pressed && styles.pressed]}>
                <Icon color={colors.white} name="plus" size={iconSize.sm} surface={false} />
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.addText}>
                  {adding}
                </Text>
              </Pressable>
            }
            showBell={false}
            title="Menu"
          />
          <View accessibilityRole="tablist" style={styles.toggle}>
            {options.map(option => {
              const on = option.value === segment;
              return (
                <Pressable
                  accessibilityLabel={option.label}
                  accessibilityRole="tab"
                  accessibilityState={{selected: on}}
                  hitSlop={{top: 4, bottom: 4}}
                  key={option.value}
                  onPress={() => setSegment(option.value)}
                  style={[styles.segment, on && styles.segmentOn]}>
                  <Text
                    allowFontScaling={textDefaults.allowFontScaling}
                    numberOfLines={1}
                    style={[styles.segmentText, on && styles.segmentTextOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      }
      scroll={false}
      withTabBar>
      {segment === 'dishes' ? <ChefMenuScreen /> : <ChefMealPlansScreen hideHeader />}
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  addButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.flameRedAccessible,
  },
  addText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.bold},
  pressed: {opacity: 0.85},
  // The track is a control, not a page: a soft tile colour, with the chosen side lifted in white.
  toggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.xxs,
    borderRadius: radius.md - 2,
    backgroundColor: colors.iconSurface,
  },
  segment: {flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs, borderRadius: radius.sm - 1},
  segmentOn: {backgroundColor: colors.white, borderWidth: borderWidth.standard, borderColor: colors.border},
  segmentText: {color: colors.textSecondary, fontSize: typography.body, fontWeight: fontWeight.bold},
  segmentTextOn: {color: colors.textPrimary},
});
