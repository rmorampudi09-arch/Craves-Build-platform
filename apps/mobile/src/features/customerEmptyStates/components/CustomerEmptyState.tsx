import React, {useEffect, useRef} from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import type {
  CustomerConnectivity,
  CustomerEmptyStateActionId,
  CustomerEmptyStateModel,
} from '../domain/customerEmptyStateModel';
import {shouldNotifyConnectivityRecovery} from '../domain/customerEmptyStateModel';

export interface CustomerEmptyStateProps {
  model: CustomerEmptyStateModel;
  onAction: (action: CustomerEmptyStateActionId) => void;
  connectivity?: CustomerConnectivity;
  onConnectivityRecovered?: () => void;
  actionPending?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * P78 shared customer no-data presentation. The model owns context/copy/action
 * semantics while host routes own navigation, permissions and retry endpoints.
 */
export function CustomerEmptyState({
  model,
  onAction,
  connectivity = 'UNKNOWN',
  onConnectivityRecovered,
  actionPending = false,
  style,
  testID,
}: CustomerEmptyStateProps) {
  const previousConnectivity = useRef<CustomerConnectivity>(connectivity);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then(reduceMotion => {
        if (!mounted) {
          return;
        }
        if (reduceMotion) {
          opacity.setValue(1);
          scale.setValue(1);
          return;
        }
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start();
      });

    return () => {
      mounted = false;
    };
  }, [opacity, scale]);

  useEffect(() => {
    const previous = previousConnectivity.current;
    previousConnectivity.current = connectivity;

    if (
      model.type === 'NO_INTERNET' &&
      shouldNotifyConnectivityRecovery(previous, connectivity)
    ) {
      onConnectivityRecovered?.();
    }
  }, [connectivity, model.type, onConnectivityRecovered]);

  return (
    <Animated.View
      accessibilityLabel={model.title}
      testID={testID}
      style={[
        styles.root,
        style,
        {opacity, transform: [{scale}]},
      ]}>
      <View accessibilityElementsHidden style={styles.illustration}>
        <View style={styles.illustrationRing}>
          <Icon
            color={colors.flameRed}
            name={model.illustration}
            size={iconSize.xl}
          />
        </View>
      </View>

      <Text
        accessibilityRole="header"
        allowFontScaling={textDefaults.allowFontScaling}
        style={styles.title}>
        {model.title}
      </Text>

      {model.preservedSearchQuery !== undefined ? (
        <View
          accessibilityLabel={`Search query ${model.preservedSearchQuery}`}
          style={styles.queryPill}>
          <Icon name="search" color={colors.espressoBrown} size={iconSize.xs} />
          <Text
            allowFontScaling={textDefaults.allowFontScaling}
            numberOfLines={2}
            style={styles.queryText}>
            {model.preservedSearchQuery || 'Empty search'}
          </Text>
        </View>
      ) : null}

      <Text
        allowFontScaling={textDefaults.allowFontScaling}
        style={styles.description}>
        {model.description}
      </Text>

      <View style={styles.actions}>
        <Button
          disabled={actionPending}
          label={model.primaryAction.label}
          loading={actionPending}
          onPress={() => onAction(model.primaryAction.id)}
          style={styles.action}
        />
        {model.secondaryAction ? (
          <Button
            disabled={actionPending}
            label={model.secondaryAction.label}
            onPress={() => onAction(model.secondaryAction!.id)}
            style={styles.action}
            variant="outline"
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  illustration: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    marginBottom: spacing.lg,
  },
  illustrationRing: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.creamDeep,
    backgroundColor: colors.white,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  queryPill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  queryText: {
    flexShrink: 1,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.body,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  action: {
    alignSelf: 'stretch',
  },
});
