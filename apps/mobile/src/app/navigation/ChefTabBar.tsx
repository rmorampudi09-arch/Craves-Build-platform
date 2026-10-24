import React from 'react';
import {Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import {CommonActions} from '@react-navigation/native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  borderWidth,
  bottomMenu,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../design/tokens';
import {chefCounterBadgeLabel} from '../../features/chefShell/domain/chefOperationalCounters';
import {useChefOperationalState} from '../../features/chefShell/state/ChefOperationalProvider';
import {BottomMenuIcon} from '../../shared/components/BottomMenuIcon';
import {CHEF_TAB_ACTIVE_COLOR, CHEF_TAB_INACTIVE_COLOR, getChefTabDefinition} from './chefTabs';
import type {ChefTabRouteName} from './types';

type MenuIconName = React.ComponentProps<typeof BottomMenuIcon>['name'];

const PILL_HEIGHT = 80;

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

/** White floating pill with the five Chef tabs, drawn like the customer menu bar; the Orders tab carries the new-order count. */
export function ChefTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const {counters} = useChefOperationalState();
  const keyboardVisible = useKeyboardVisible();
  const focusedRoute = state.routes[state.index];

  // Profile's sub-pages (forms, Bank account, Payout history) are full pages: no menu bar under their buttons.
  const profileSubPage = focusedRoute.name === 'Profile' && (focusedRoute.state?.index ?? 0) > 0;
  if (profileSubPage || (keyboardVisible && descriptors[focusedRoute.key]?.options.tabBarHideOnKeyboard)) {
    return null;
  }

  return (
    <View style={[styles.slot, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
      <View accessibilityRole="tablist" style={styles.pill} testID="chef-tab-bar">
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
              <BottomMenuIcon color={color} glow={focused} name={tab.icon as MenuIconName} size={28} />
              <Text
                allowFontScaling={textDefaults.allowFontScaling}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[styles.label, {color}, focused && styles.glow]}>
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
  label: {fontSize: typography.small, fontWeight: fontWeight.regular, marginTop: 2},
  glow: {
    textShadowColor: bottomMenu.glowTextShadow,
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: bottomMenu.glowTextRadius,
  },
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
