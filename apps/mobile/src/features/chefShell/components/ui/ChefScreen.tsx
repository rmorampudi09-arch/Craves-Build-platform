import React from 'react';
import {RefreshControl, ScrollView, StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {borderWidth, colors, spacing} from '../../../../design/tokens';
import {getBottomActionPadding} from '../../../../design/responsive';

/** Height of the floating tab bar the Chef navigator reserves at the bottom of the layout. */
export const CHEF_TAB_BAR_HEIGHT = 80;

export interface ChefScreenProps {
  children?: React.ReactNode;
  header?: React.ReactNode;
  /** Sticky white dock under the content, for the screen's main buttons. */
  footer?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** false when the child is its own list (FlatList) and must fill the screen. */
  scroll?: boolean;
  /** Adds breathing room so the last card never sits flush on the tab bar. */
  withTabBar?: boolean;
  testID?: string;
}

/** White screen: header, scrolling content, optional sticky footer. Never grey. */
export function ChefScreen({
  children,
  header,
  footer,
  refreshing = false,
  onRefresh,
  scroll = true,
  withTabBar = false,
  testID,
}: ChefScreenProps) {
  const insets = useSafeAreaInsets();
  // The tab bar slot already clears the gesture inset; without it the screen must.
  const bottomInset = withTabBar ? 0 : insets.bottom;

  return (
    <SafeAreaView edges={['top']} style={styles.screen} testID={testID}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingBottom: withTabBar ? spacing.xxl : spacing.lg + (footer ? 0 : bottomInset)},
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                colors={[colors.flameRed]}
                onRefresh={onRefresh}
                refreshing={refreshing}
              />
            ) : undefined
          }
          showsVerticalScrollIndicator={false}
          style={styles.flex}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
      {footer ? (
        <View style={[styles.dock, {paddingBottom: getBottomActionPadding(bottomInset)}]}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  flex: {flex: 1, backgroundColor: colors.white},
  content: {
    flexGrow: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  dock: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
});
