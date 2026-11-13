import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Icon} from '../../../shared/components';
import {colors, font, iconSize, spacing, themedStyles, typography} from '../theme';
import {useStrings} from '../strings/StringsProvider';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

/**
 * The number pad the hand-over draws itself: 60 dp keys, so the system keyboard never covers the code boxes, the
 * customer's name or the escape routes. TalkBack reads each key; the last key deletes a digit.
 */
export function Keypad({onDigit, onDelete, disabled, testID}: {onDigit: (digit: string) => void; onDelete: () => void; disabled?: boolean; testID?: string}) {
  const t = useStrings().strings.trip;
  return (
    <View style={styles.grid} testID={testID}>
      {KEYS.map(key =>
        key === '' ? (
          <View key="blank" style={styles.key} />
        ) : (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key === 'back' ? t.deleteDigit : key}
            accessibilityState={{disabled}}
            disabled={disabled}
            onPress={() => (key === 'back' ? onDelete() : onDigit(key))}
            style={({pressed}) => [styles.key, styles.keyFace, pressed && styles.pressed]}
            testID={`${testID}-${key}`}>
            {key === 'back' ? (
              <Icon name="arrow-left" size={iconSize.lg} color={disabled ? colors.textSecondary : colors.textPrimary} surface={false} />
            ) : (
              <Text style={[styles.digit, disabled && styles.digitOff]}>{key}</Text>
            )}
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = themedStyles(c => ({
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  key: {flexGrow: 1, flexBasis: '30%', minHeight: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 16},
  keyFace: {backgroundColor: c.surface},
  pressed: {backgroundColor: c.border},
  digit: {fontFamily: font.displayBold, fontSize: typography.title, color: c.textPrimary, fontVariant: ['tabular-nums']},
  digitOff: {color: c.textSecondary},
}));
