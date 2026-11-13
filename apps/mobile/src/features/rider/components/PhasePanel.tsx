import React, {type PropsWithChildren} from 'react';
import {Text, View} from 'react-native';
import {Icon} from '../../../shared/components';
import {colors, font, iconSize, spacing, themedStyles, typography} from '../theme';

export type Phase = 'kitchen' | 'customer';

/**
 * Where to go, on the phase's own colour (DESIGN.md "Phase panels"): peach for the kitchen, mint for the customer by
 * day; dark brown and deep green with white text by night. A chef or house mark repeats the phase for anyone who
 * can't tell the colours apart. `verb` names the step ("Pick up from"), then the name, the address lines and an
 * optional quieter `note` (the landmark); children go last (the distance).
 */
export function PhasePanel({
  phase,
  verb,
  name,
  lines,
  note,
  children,
  testID,
}: PropsWithChildren<{phase: Phase; verb: string; name: string; lines?: (string | null | undefined)[]; note?: string | null; testID?: string}>) {
  const kitchen = phase === 'kitchen';
  const ink = kitchen ? styles.kitchenInk : styles.dropInk;
  const sub = kitchen ? styles.kitchenSub : styles.dropSub;
  return (
    <View style={[styles.panel, kitchen ? styles.kitchen : styles.drop]} testID={testID}>
      <View style={styles.verbRow}>
        <Icon name={kitchen ? 'chef' : 'home-outline'} size={iconSize.sm} color={kitchen ? colors.kitchenMark : colors.dropMark} surface={false} />
        <Text style={[styles.verb, sub]}>{verb}</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.name, ink]}>
        {name}
      </Text>
      {lines?.filter(Boolean).map(line => (
        <Text key={line} style={[styles.line, ink]}>
          {line}
        </Text>
      ))}
      {note ? <Text style={[styles.note, ink]}>{note}</Text> : null}
      {children}
    </View>
  );
}

/** Text that sits inside a panel's children in the panel's own ink. */
export function PanelText({phase, strong, children}: PropsWithChildren<{phase: Phase; strong?: boolean}>) {
  const kitchen = phase === 'kitchen';
  return <Text style={[styles.line, strong && styles.strong, kitchen ? styles.kitchenInk : styles.dropInk]}>{children}</Text>;
}

const styles = themedStyles(c => ({
  panel: {borderRadius: 24, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.xxs},
  kitchen: {backgroundColor: c.kitchen},
  drop: {backgroundColor: c.drop},
  verbRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2},
  verb: {flexShrink: 1, fontFamily: font.bold, fontSize: typography.body},
  name: {fontFamily: font.bold, fontSize: typography.hero},
  line: {fontFamily: font.regular, fontSize: typography.body},
  note: {fontFamily: font.semibold, fontSize: typography.body, marginTop: spacing.xxs},
  strong: {fontFamily: font.bold},
  kitchenInk: {color: c.kitchenInk},
  kitchenSub: {color: c.kitchenSub},
  dropInk: {color: c.dropInk},
  dropSub: {color: c.dropSub},
}));
