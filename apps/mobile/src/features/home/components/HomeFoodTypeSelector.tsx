import React, {useRef, useState} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import type {DiscoveryDietFilter} from '../../discoveryFilters/state/discoveryFilterSlice';

export type HomeFoodType = 'ALL' | DiscoveryDietFilter;

type FoodTypeOption = {
  value: HomeFoodType;
  label: string;
  color: string;
  tint: string;
};

const FOOD_TYPE_OPTIONS: readonly FoodTypeOption[] = [
  {
    value: 'ALL',
    label: 'All',
    color: '#42A5F5',
    tint: 'rgba(66, 165, 245, 0.10)',
  },
  {
    value: 'VEG',
    label: 'Veg',
    color: '#43A047',
    tint: 'rgba(67, 160, 71, 0.10)',
  },
  {
    value: 'NON_VEG',
    label: 'Non Veg',
    color: '#F04438',
    tint: 'rgba(240, 68, 56, 0.10)',
  },
  {
    value: 'EGG',
    label: 'Egg',
    color: '#F4B400',
    tint: 'rgba(244, 180, 0, 0.12)',
  },
];

interface HomeFoodTypeSelectorProps {
  value: HomeFoodType;
  onChange: (value: HomeFoodType) => void;
}

function FoodTypeGlyph({
  value,
  color,
  selected = false,
}: {
  value: HomeFoodType;
  color: string;
  selected?: boolean;
}) {
  if (value === 'EGG') {
    return (
      <View style={[styles.glyphRing, {borderColor: color}]}>
        <View
          style={[
            styles.eggGlyph,
            {borderColor: color, backgroundColor: selected ? color : colors.white},
          ]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.glyphRing, {borderColor: color}]}>
      <View
        style={[
          styles.glyphDot,
          {
            backgroundColor: color,
            width: selected ? 18 : 14,
            height: selected ? 18 : 14,
          },
        ]}
      />
    </View>
  );
}

export function HomeFoodTypeSelector({
  value,
  onChange,
}: HomeFoodTypeSelectorProps) {
  const [visible, setVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const selectedOption =
    FOOD_TYPE_OPTIONS.find(option => option.value === value) ?? FOOD_TYPE_OPTIONS[0];

  const open = () => {
    progress.stopAnimation();
    progress.setValue(0);
    setVisible(true);
    requestAnimationFrame(() => {
      Animated.spring(progress, {
        toValue: 1,
        damping: 18,
        stiffness: 220,
        mass: 0.7,
        useNativeDriver: true,
      }).start();
    });
  };

  const close = () => {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const select = (nextValue: HomeFoodType) => {
    onChange(nextValue);
    close();
  };

  const popupScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.84, 1],
  });
  const popupTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [72, 0],
  });
  const popupTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-72, 0],
  });

  return (
    <>
      <Pressable
        accessibilityHint="Choose All, Veg, Non Veg, or Egg"
        accessibilityLabel={`Food type: ${selectedOption.label}`}
        accessibilityRole="button"
        accessibilityState={{expanded: visible}}
        onPress={open}
        style={({pressed}) => [
          styles.trigger,
          {borderColor: selectedOption.color},
          pressed && styles.triggerPressed,
        ]}>
        <FoodTypeGlyph value={value} color={selectedOption.color} selected />
      </Pressable>

      <Modal
        animationType="none"
        onRequestClose={close}
        statusBarTranslucent
        transparent
        visible={visible}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close food type selector"
            accessibilityRole="button"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            accessibilityLabel="Food type options"
            style={[
              styles.popup,
              {
                opacity: progress,
                transform: [
                  {translateX: popupTranslateX},
                  {translateY: popupTranslateY},
                  {scale: popupScale},
                ],
              },
            ]}>
            <View style={styles.optionRow}>
              {FOOD_TYPE_OPTIONS.map(option => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityLabel={option.label}
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    onPress={() => select(option.value)}
                    style={({pressed}) => [
                      styles.option,
                      selected && {backgroundColor: option.tint},
                      pressed && styles.optionPressed,
                    ]}>
                    <FoodTypeGlyph
                      value={option.value}
                      color={option.color}
                      selected={selected}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.optionLabel,
                        {color: option.color},
                        selected && styles.optionLabelSelected,
                      ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.white,
  },
  triggerPressed: {
    backgroundColor: colors.surfaceMuted,
    transform: [{scale: 0.96}],
  },
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  popup: {
    width: '100%',
    maxWidth: 380,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    ...elevation.card,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  option: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  optionPressed: {
    opacity: 0.72,
  },
  glyphRing: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: colors.white,
  },
  glyphDot: {
    borderRadius: radius.pill,
  },
  eggGlyph: {
    width: 15,
    height: 20,
    borderWidth: 2,
    borderRadius: 10,
  },
  optionLabel: {
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  optionLabelSelected: {
    fontWeight: fontWeight.extrabold,
  },
});