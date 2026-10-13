import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../../design/tokens';
import {CHEF_TAB_BAR_HEIGHT} from './ChefScreen';

export const CHEF_TOAST_DURATION_MS = 2600;
/** A toast with a button (Undo) stays a little longer so there is time to reach it. */
export const CHEF_TOAST_ACTION_DURATION_MS = 4000;

export interface ChefToastAction {
  label: string;
  onPress: () => void;
}

export interface ChefToastApi {
  show: (message: string, action?: ChefToastAction) => void;
}

// Without a provider (a screen under test, a standalone route) toasts are silently dropped, never a crash.
const ChefToastContext = React.createContext<ChefToastApi>({show: () => undefined});

export function useChefToast(): ChefToastApi {
  return React.useContext(ChefToastContext);
}

/** Shows one toast at a time above the tab bar; a new message replaces the old one and restarts the timer. */
export function ChefToastProvider({children}: {children?: React.ReactNode}) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = React.useState<{message: string; action?: ChefToastAction} | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = React.useCallback((message: string, action?: ChefToastAction) => {
    clearTimeout(timer.current);
    setToast({message, action});
    timer.current = setTimeout(
      () => setToast(null),
      action ? CHEF_TOAST_ACTION_DURATION_MS : CHEF_TOAST_DURATION_MS,
    );
  }, []);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const api = React.useMemo(() => ({show}), [show]);
  const runAction = () => {
    const action = toast?.action;
    clearTimeout(timer.current);
    setToast(null);
    action?.onPress();
  };

  return (
    <ChefToastContext.Provider value={api}>
      {children}
      {toast ? (
        <View
          // Only a toast with a button takes touches; the rest never block the screen under them.
          pointerEvents={toast.action ? 'box-none' : 'none'}
          style={[styles.host, {bottom: CHEF_TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.md) + spacing.md}]}>
          <View accessibilityLiveRegion="polite" style={styles.toast}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.text}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                accessibilityLabel={toast.action.label}
                accessibilityRole="button"
                hitSlop={spacing.xxs}
                onPress={runAction}
                style={styles.action}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.actionText}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.espresso,
  },
  text: {flexShrink: 1, color: colors.white, fontSize: typography.body, fontWeight: fontWeight.semibold, textAlign: 'center'},
  action: {minHeight: touchTarget.minimum, justifyContent: 'center', marginVertical: -spacing.sm},
  actionText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.extrabold, textDecorationLine: 'underline'},
});
