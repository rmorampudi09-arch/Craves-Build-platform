import React from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import {borderWidth, colors, iconSize, radius, spacing} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {CHEF_AVATARS} from '../domain/chefAvatars';

export interface ChefAvatarGridProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

/** The 18 drawn faces, three to a row (no list: there are only 18). The picked face gets a red ring and a tick. */
export function ChefAvatarGrid({selectedId, onSelect, disabled = false}: ChefAvatarGridProps) {
  return (
    <View accessibilityRole="radiogroup" style={styles.grid}>
      {CHEF_AVATARS.map((avatar, index) => {
        const selected = avatar.id === selectedId;
        return (
          <Pressable
            accessibilityLabel={`Picture ${index + 1}`}
            accessibilityRole="radio"
            accessibilityState={{selected, disabled}}
            disabled={disabled}
            key={avatar.id}
            onPress={() => onSelect(avatar.id)}
            style={[styles.cell, disabled && styles.dimmed]}>
            <View style={[styles.ring, selected && styles.ringOn]}>
              <Image accessibilityIgnoresInvertColors resizeMode="cover" source={avatar.image} style={styles.face} />
              {selected ? (
                <View style={styles.tick}>
                  <Icon color={colors.white} name="check" size={iconSize.xs} surface={false} />
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const TICK_SIZE = iconSize.lg;

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {width: '33.3333%', padding: spacing.xs},
  dimmed: {opacity: 0.5},
  ring: {
    width: '100%',
    aspectRatio: 1,
    padding: spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    borderColor: 'transparent',
  },
  ringOn: {borderColor: colors.flameRedAccessible},
  face: {width: '100%', height: '100%', borderRadius: radius.pill, backgroundColor: colors.muted},
  tick: {
    position: 'absolute',
    right: -spacing.xxs,
    bottom: -spacing.xxs,
    width: TICK_SIZE,
    height: TICK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    borderColor: colors.white,
    backgroundColor: colors.flameRedAccessible,
  },
});
