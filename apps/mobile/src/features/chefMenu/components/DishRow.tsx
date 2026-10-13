import React from 'react';
import {Image, Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import {
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefActionButton, StatusChip, VegMark} from '../../chefShell/components/ui';
import {formatRupeesExact} from '../../chefShell/domain/chefFormat';
import type {ChefMenuItem} from '../api/chefMenuApi';
import {
  chefMenuCategoryLabel,
  chefMenuRowNote,
  getChefMenuDisplayState,
  getChefMenuPrimaryImageUrl,
} from '../domain/chefMenuPresentation';

export interface DishRowProps {
  item: ChefMenuItem;
  /** A change to this dish is being saved: its switch or Publish button waits. */
  busy: boolean;
  onOpen: () => void;
  onSwitch: (on: boolean) => void;
  onPublish: () => void;
}

const PHOTO = 64;

/** One dish in the Menu list: photo, name with its veg mark, category and time, price, and the switch (or Publish for a draft). */
export function DishRow({item, busy, onOpen, onSwitch, onPublish}: DishRowProps) {
  const state = getChefMenuDisplayState(item);
  const note = chefMenuRowNote(item);
  const category = chefMenuCategoryLabel(item.category);
  const photo = getChefMenuPrimaryImageUrl(item);
  const price = formatRupeesExact(item.price);
  const off = state === 'UNAVAILABLE' || state === 'INACTIVE';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`${item.itemName}, ${note ? `${category} · ${note.text}` : 'Draft'}, ${price}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({pressed}) => [styles.open, pressed && styles.pressed]}>
        {photo ? (
          <Image accessibilityIgnoresInvertColors source={{uri: photo}} style={[styles.photo, off && styles.photoOff]} />
        ) : (
          <View style={[styles.photo, styles.noPhoto]}>
            <Icon color={colors.borderStrong} name="camera-plus" size={iconSize.xl} surface={false} />
          </View>
        )}
        <View style={styles.text}>
          <View style={styles.nameLine}>
            <VegMark type={item.foodType} />
            <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.name}>
              {item.itemName}
            </Text>
          </View>
          {note ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={styles.meta}>
              {category} · <Text style={note.off ? styles.metaOff : undefined}>{note.text}</Text>
            </Text>
          ) : (
            <View style={styles.chip}>
              <StatusChip label="Draft" tone="draft" />
            </View>
          )}
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.price}>
            {price}
          </Text>
        </View>
      </Pressable>
      {state === 'DRAFT' ? (
        <ChefActionButton
          accessibilityLabel={`Publish ${item.itemName}`}
          busy={busy}
          compact
          label="Publish"
          onPress={onPublish}
        />
      ) : state === 'INACTIVE' ? null : (
        <Switch
          accessibilityLabel={`${item.itemName} availability`}
          accessibilityState={{busy, checked: item.available}}
          disabled={busy}
          onValueChange={onSwitch}
          thumbColor={colors.white}
          trackColor={{false: colors.borderStrong, true: colors.success}}
          value={item.available}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  open: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  pressed: {opacity: 0.6},
  photo: {width: PHOTO, height: PHOTO, borderRadius: radius.md - 2},
  photoOff: {opacity: 0.5},
  noPhoto: {alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border},
  text: {flex: 1, minWidth: 0, gap: 2},
  nameLine: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  name: {flexShrink: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  meta: {color: colors.textSecondary, fontSize: typography.small},
  metaOff: {color: colors.flameRedAccessible},
  chip: {alignSelf: 'flex-start'},
  price: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
});
