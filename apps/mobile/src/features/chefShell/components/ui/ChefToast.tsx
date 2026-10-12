import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, fontWeight, radius, spacing, textDefaults, typography} from '../../../../design/tokens';
import {CHEF_TAB_BAR_HEIGHT} from './ChefScreen';

export const CHEF_TOAST_DURATION_MS = 2600;

export interface ChefToastApi {
  show: (message: string) => void;
}

// Without a provider (a screen under test, a standalone route) toasts are silently dropped, never a crash.
const ChefToastContext = React.createContext<ChefToastApi>({show: () => undefined});

export function useChefToast(): ChefToastApi {
  return React.useContext(ChefToastContext);
}

/** Shows one toast at a time above the tab bar; a new message replaces the old one and restarts the timer. */
export function ChefToastProvider({children}: {children?: React.ReactNode}) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = React.useCallback((next: string) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), CHEF_TOAST_DURATION_MS);
  }, []);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const api = React.useMemo(() => ({show}), [show]);

  return (
    <ChefToastContext.Provider value={api}>
      {children}
      {message ? (
        <View
          pointerEvents="none"
          style={[styles.host, {bottom: CHEF_TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.md) + spacing.md}]}>
          <View accessibilityLiveRegion="polite" style={styles.toast}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.text}>
              {message}
            </Text>
          </View>
        </View>
      ) : null}
    </ChefToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center'},
  toast: {
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.espresso,
  },
  text: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.semibold, textAlign: 'center'},
});
