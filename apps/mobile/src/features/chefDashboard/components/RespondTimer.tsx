import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, iconSize, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';

function useNow(intervalMs: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** "Respond in 4:32" with a bar that empties towards the deadline. Shown only for an order that carries a deadline. */
export function RespondTimer({expiresAt, createdAt}: {expiresAt: string; createdAt?: string | null}) {
  const now = useNow(1000);
  const remaining = Math.max(0, Date.parse(expiresAt) - now);
  const total = createdAt ? Date.parse(expiresAt) - Date.parse(createdAt) : NaN;
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const tone = remaining < 5 * 60_000 ? colors.flameRedAccessible : remaining < 10 * 60_000 ? colors.warningText : colors.successText;
  const fill = total > 0 ? Math.min(1, remaining / total) : null;

  if (remaining === 0) {
    return (
      <View style={styles.row}>
        <Icon color={colors.flameRedAccessible} name="clock" size={iconSize.xs} surface={false} />
        <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.text, {color: colors.flameRedAccessible}]}>
          Time to respond has passed
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Icon color={tone} name="clock" size={iconSize.xs} surface={false} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.text, {color: tone}]}>
        {`Respond in ${minutes}:${String(seconds).padStart(2, '0')}`}
      </Text>
      {fill !== null ? (
        <View style={styles.bar}>
          <View style={[styles.fill, {width: `${Math.round(fill * 100)}%`, backgroundColor: tone}]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  text: {fontSize: typography.small, fontWeight: fontWeight.bold},
  bar: {flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.errorSoft, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: radius.pill},
});
