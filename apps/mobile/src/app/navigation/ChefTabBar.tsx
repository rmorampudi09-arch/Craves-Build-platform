import React from 'react';
import {Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import {CommonActions} from '@react-navigation/native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../design/tokens';
import {chefCounterBadgeLabel} from '../../features/chefShell/domain/chefOperationalCounters';
import {useChefOperationalState} from '../../features/chefShell/state/ChefOperationalProvider';
import {Icon} from '../../shared/components/Icon';
import {CHEF_TAB_ACTIVE_COLOR, CHEF_TAB_INACTIVE_COLOR, getChefTabDefinition} from './chefTabs';
import type {ChefTabRouteName} from './types';

const PILL_HEIGHT = 68;

// The Android window resizes for the keyboard, which would lift the bar above it.
function useKeyboardVisible() {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** Plain white floating pill with the five Chef tabs; the Orders tab carries the new-order count. */
export function ChefTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const {counters} = useChefOperationalState();
  const keyboardVisible = useKeyboardVisible();
  const focusedRoute = state.routes[state.index];

  if (keyboardVisible && descriptors[focusedRoute.key]?.options.tabBarHideOnKeyboard) {
    return null;
  }

  return (
    <View style={[styles.slot, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
      <View style={styles.pill} testID="chef-tab-bar">
        {state.routes.map((route, index) => {
          const tab = getChefTabDefinition(route.name as ChefTabRouteName);
          const focused = state.index === index;
          const pending = route.name === 'Orders' ? counters.pendingAcceptance : 0;
          const badge = chefCounterBadgeLabel(pending);
          const color = focused ? CHEF_TAB_ACTIVE_COLOR : CHEF_TAB_INACTIVE_COLOR;

          const onPress = () => {
            const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
            if (!focused && !event.defaultPrevented) {
              navigation.dispatch({...CommonActions.navigate(route.name, route.params), target: state.key});
            }
          };

          return (
            <Pressable
              accessibilityLabel={badge ? `${tab.label} tab, ${pending} new orders` : `${tab.label} tab`}
              accessibilityRole="tab"
              accessibilityState={{selected: focused}}
              key={route.key}
              onLongPress={() => navigation.emit({type: 'tabLongPress', target: route.key})}
              onPress={onPress}
              style={({pressed}) => [styles.tab, pressed && styles.pressed]}>
              <Icon color={color} name={tab.icon} size={iconSize.lg + 1} surface={false} />
              <Text
                allowFontScaling={textDefaults.allowFontScaling}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[styles.label, {color}]}>
                {tab.label}
              </Text>
              {badge ? (
                <View pointerEvents="none" style={styles.badge}>
                  <Text allowFontScaling={false} style={styles.badgeText}>
                    {badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Navigation invokes tabBar as a callback, not as a React component.
export function renderChefTabBar(props: BottomTabBarProps) {
  return <ChefTabBar {...props} />;
}

const styles = StyleSheet.create({
  slot: {paddingHorizontal: spacing.sm, paddingTop: spacing.xs, backgroundColor: colors.white},
  pill: {
    height: PILL_HEIGHT,
    flexDirection: 'row',
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    shadowColor: colors.espressoBrown,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 9},
    elevation: 9,
  },
  tab: {
    flex: 1,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.xxs,
  },
  pressed: {opacity: 0.6},
  label: {fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  badge: {
    position: 'absolute',
    top: spacing.xs,
    left: '50%',
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {color: colors.white, fontSize: typography.tiny, fontWeight: fontWeight.bold},
});
