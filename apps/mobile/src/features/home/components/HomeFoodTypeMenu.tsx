import React, {useRef, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {colors, fontWeight, radius, spacing, touchTarget, typography} from '../../../design/tokens';
import {VegMark} from '../../chefShell/components/ui/VegMark';
import type {DiscoveryDietOption} from '../../discoveryFilters/state/discoveryFilterSlice';

type Frame = {x: number; y: number; width: number; height: number};

const OPTIONS: readonly {diet: DiscoveryDietOption | null; label: string; short: string}[] = [
  {diet: null, label: 'All food', short: 'All'},
  {diet: 'VEG', label: 'Veg only', short: 'Veg'},
  {diet: 'EGG', label: 'Egg', short: 'Egg'},
  {diet: 'NON_VEG', label: 'Non-veg', short: 'Non-veg'},
];

const TONES: Record<DiscoveryDietOption, {text: string; soft: string; border: string}> = {
  VEG: {text: colors.successText, soft: colors.successSoft, border: colors.successText},
  EGG: {text: colors.warningText, soft: colors.warningSoft, border: colors.warning},
  NON_VEG: {text: colors.error, soft: colors.errorSoft, border: colors.error},
};

const MENU_WIDTH = 184;

/** Pill label for the current diets: one diet by name, several as "Veg +1" (set from Filter & sort). */
export function foodTypePillLabel(diets: readonly DiscoveryDietOption[]): string {
  const first = OPTIONS.find(option => option.diet === diets[0]);
  if (!first) return 'All';
  return diets.length > 1 ? `${first.short} +${diets.length - 1}` : first.short;
}

interface HomeFoodTypeMenuProps {
  diets: readonly DiscoveryDietOption[];
  onChange: (diets: DiscoveryDietOption[]) => void;
  style?: StyleProp<ViewStyle>;
}

export function HomeFoodTypeMenu({diets, onChange, style}: HomeFoodTypeMenuProps) {
  const pillRef = useRef<View>(null);
  const rootRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Frame | null>(null);
  const [root, setRoot] = useState<Frame | null>(null);
  const {width: windowWidth} = useWindowDimensions();
  const tone = diets[0] ? TONES[diets[0]] : null;
  const label = foodTypePillLabel(diets);
  const close = () => {
    setAnchor(null);
    setRoot(null);
  };
  const choose = (diet: DiscoveryDietOption | null) => {
    close();
    onChange(diet ? [diet] : []);
  };

  // The modal's own origin can differ from the window's (status bar), so place the menu relative to it.
  const menuTop = anchor && root ? anchor.y - root.y + anchor.height + spacing.xs : 0;
  const menuLeft = anchor && root
    ? Math.max(spacing.sm, Math.min(anchor.x - root.x + anchor.width - MENU_WIDTH, windowWidth - MENU_WIDTH - spacing.sm))
    : 0;

  return (
    <>
      <Pressable
        ref={pillRef}
        accessibilityRole="button"
        accessibilityLabel={`Food type, ${label === 'All' ? 'all food' : label}`}
        accessibilityHint="Opens veg, egg and non-veg choices"
        accessibilityState={{expanded: anchor !== null}}
        onPress={() => pillRef.current?.measureInWindow((x, y, width, height) => setAnchor({x, y, width, height}))}
        style={({pressed}) => [
          styles.pill,
          tone && {backgroundColor: tone.soft, borderColor: tone.border},
          pressed && styles.pillPressed,
          style,
        ]}
        testID="home-food-type-pill">
        {diets[0] ? (
          <VegMark type={diets[0]} />
        ) : (
          <MaterialDesignIcons name="silverware-fork-knife" size={16} color={colors.flameRedAccessible} />
        )}
        <Text numberOfLines={1} style={[styles.pillLabel, tone && {color: tone.text}]}>
          {label}
        </Text>
        <MaterialDesignIcons name="chevron-down" size={18} color={tone?.text ?? colors.textPrimary} />
      </Pressable>

      <Modal animationType="fade" onRequestClose={close} statusBarTranslucent transparent visible={anchor !== null}>
        <Pressable
          ref={rootRef}
          accessibilityLabel="Close food type choices"
          onLayout={() => rootRef.current?.measureInWindow((x, y, width, height) => setRoot({x, y, width, height}))}
          onPress={close}
          style={StyleSheet.absoluteFill}>
          {root ? (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Food type"
              style={[styles.menu, {top: menuTop, left: menuLeft}]}
              testID="home-food-type-menu">
              {OPTIONS.map(option => {
                const selected = option.diet === null ? diets.length === 0 : diets.length === 1 && diets[0] === option.diet;
                const optionTone = option.diet ? TONES[option.diet] : null;
                return (
                  <Pressable
                    key={option.label}
                    accessibilityRole="radio"
                    accessibilityState={{checked: selected}}
                    accessibilityLabel={option.label}
                    onPress={() => choose(option.diet)}
                    style={({pressed}) => [
                      styles.row,
                      selected && {backgroundColor: optionTone?.soft ?? colors.surfaceMuted},
                      pressed && styles.rowPressed,
                    ]}>
                    {option.diet ? (
                      <VegMark type={option.diet} />
                    ) : (
                      <MaterialDesignIcons name="silverware-fork-knife" size={14} color={colors.textSecondary} />
                    )}
                    <Text style={[styles.rowLabel, selected && {color: optionTone?.text ?? colors.textPrimary, fontWeight: fontWeight.bold}]}>
                      {option.label}
                    </Text>
                    {selected ? (
                      <MaterialDesignIcons name="check" size={18} color={optionTone?.text ?? colors.textPrimary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.iconSurface,
    backgroundColor: colors.iconSurface,
  },
  pillPressed: {opacity: 0.78, transform: [{scale: 0.96}]},
  pillLabel: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    padding: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
    shadowColor: colors.espressoBrown,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
    elevation: 12,
  },
  row: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowPressed: {opacity: 0.78},
  rowLabel: {flex: 1, color: colors.textPrimary, fontSize: typography.body},
});
