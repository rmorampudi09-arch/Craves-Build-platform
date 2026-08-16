import React from 'react';
import {
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {
  colors,
  elevation,
  radius,
  spacing,
  touchTarget,
} from '../../../design/tokens';

interface Props {
  favorite: boolean;
  pending?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  itemLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Clean floating favorite control used on customer dish cards. */
export function CustomerFavoriteHeartButton({
  favorite,
  pending = false,
  disabled = false,
  onToggle,
  itemLabel = 'dish',
  style,
}: Props) {
  const blocked = disabled || pending;
  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (!blocked) onToggle();
  };

  return (
    <Pressable
      accessibilityLabel={
        favorite ? `Remove ${itemLabel} from favorites` : `Save ${itemLabel} to favorites`
      }
      accessibilityRole="button"
      accessibilityState={{disabled: blocked, busy: pending, selected: favorite}}
      disabled={blocked}
      hitSlop={spacing.xs}
      onPress={handlePress}
      style={({pressed}) => [
        styles.button,
        favorite && styles.buttonFavorite,
        style,
        (pressed || pending) && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <MaterialDesignIcons
        name={favorite ? 'heart' : 'heart-outline'}
        size={22}
        color={favorite ? colors.flameRed : colors.espressoBrown}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  buttonFavorite: {
    borderColor: colors.flameRed,
  },
  pressed: {
    opacity: 0.78,
    transform: [{scale: 0.96}],
  },
  disabled: {opacity: 0.45},
});
