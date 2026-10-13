import React from 'react';
import {Image, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
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
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {GroupLabel, OptionChip} from '../../chefMenu/components/DishFormField';
import {ChefActionButton, ChefSheet, StatusChip} from '../../chefShell/components/ui';

export interface PhotoTileProps {
  label: string;
  icon: IconName;
  /** undefined: the server does not offer photos yet. null: no photo chosen. A string: the photo. */
  url: string | null | undefined;
  busy?: boolean;
  onPress: () => void;
}

const TILE_HEIGHT = 92;

/** One of the two photo tiles ("Your photo", "Kitchen photo"). Opens its sheet on tap, once photos are offered. */
export function PhotoTile({label, icon, url, busy = false, onPress}: PhotoTileProps) {
  const body = (
    <>
      {url ? (
        <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{uri: url}} style={styles.photo} />
      ) : (
        <Icon color={colors.textSecondary} name={icon} size={iconSize.xl} surface={false} />
      )}
      <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={[styles.tileLabel, url ? styles.tileLabelOnPhoto : null]}>
        {label}
      </Text>
      {url === undefined ? <StatusChip label="Coming soon" tone="info" /> : null}
      {busy ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.saving}>
          Saving…
        </Text>
      ) : null}
    </>
  );
  if (url === undefined) {
    return <View style={styles.tile}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{busy}}
      disabled={busy}
      onPress={onPress}
      style={({pressed}) => [styles.tile, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

export interface ChipPickerProps {
  label: string;
  /** Choices to offer besides whatever is already chosen. */
  options: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** The "+ Add" chip's words, and the name of its text box. */
  addLabel: string;
  addFieldLabel: string;
  disabled?: boolean;
  max?: number;
  error?: string;
}

/** Chips to switch on and off, with "+ Add" for one of the chef's own (up to 40 characters, up to 10 in all). */
export function ChipPicker({label, options, selected, onChange, addLabel, addFieldLabel, disabled, max = 10, error}: ChipPickerProps) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const shown = [...new Set([...options, ...selected])];
  const toggle = (item: string) =>
    onChange(selected.includes(item) ? selected.filter(other => other !== item) : [...selected, item]);
  const add = () => {
    const word = draft.trim();
    if (word && !selected.some(item => item.toLowerCase() === word.toLowerCase())) {
      onChange([...selected, word]);
    }
    setDraft('');
    setAdding(false);
  };
  return (
    <View style={styles.picker}>
      <GroupLabel label={label} />
      <View style={styles.chips}>
        {shown.map(item => (
          <OptionChip
            disabled={disabled || (!selected.includes(item) && selected.length >= max)}
            key={item}
            label={item}
            onPress={() => toggle(item)}
            selected={selected.includes(item)}
          />
        ))}
        <OptionChip
          accessibilityRole="button"
          disabled={disabled || selected.length >= max}
          label={addLabel}
          onPress={() => setAdding(true)}
          selected={false}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" allowFontScaling={textDefaults.allowFontScaling} style={styles.error}>
          {error}
        </Text>
      ) : null}
      <ChefSheet onClose={() => setAdding(false)} title={addFieldLabel} visible={adding}>
        <View style={styles.addBox}>
          <TextInput
            accessibilityLabel={addFieldLabel}
            allowFontScaling={textDefaults.allowFontScaling}
            autoFocus
            maxLength={40}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholderTextColor={colors.placeholder}
            returnKeyType="done"
            style={styles.addInput}
            value={draft}
          />
        </View>
        <ChefActionButton disabled={!draft.trim()} label="Add" onPress={add} />
      </ChefSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  pressed: {opacity: 0.7},
  photo: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  tileLabel: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  tileLabelOnPhoto: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: spacing.xxs,
    textAlign: 'center',
    color: colors.textPrimary,
    backgroundColor: colors.white,
  },
  saving: {position: 'absolute', top: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  picker: {gap: spacing.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  error: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.semibold},
  addBox: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md - 2,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  addInput: {minHeight: touchTarget.minimum, paddingVertical: 0, color: colors.textPrimary, fontSize: typography.body},
});
