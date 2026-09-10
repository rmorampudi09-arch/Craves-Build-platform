export const colors = {
  flameRed: '#F62E18',
  /**
   * Text-safe red for normal-sized action copy and text-bearing red surfaces.
   * Keep flameRed for exact brand accents where the 3:1 non-text target applies.
   */
  flameRedAccessible: '#D92714',
  flameRedSoft: '#FF5548',
  /** Shared icon-tile background across customer and Chef experiences. */
  iconSurface: '#F1F5F9',
  espresso: '#261A15',
  espressoBrown: '#261A15',
  cream: '#FFF5E9',
  creamDeep: '#FBEBDD',
  white: '#FFFFFF',
  ink: '#1F1B19',
  textPrimary: '#261A15',
  textSecondary: '#706864',
  mutedText: '#706864',
  placeholder: '#7D7570',
  border: '#E3DDD8',
  borderStrong: '#D5CEC8',
  success: '#29B47B',
  successText: '#166B49',
  successSoft: '#E8F7F1',
  warning: '#D98C16',
  warningText: '#7A4A00',
  warningSoft: '#FFF4DF',
  error: '#C72C21',
  errorSoft: '#FDEAE8',
  info: '#2F6FED',
  infoText: '#1F4FAF',
  infoSoft: '#EAF0FF',
  muted: '#F7F5F3',
  surfaceBase: '#FFFFFF',
  surfaceWarm: '#FFFFFF',
  surfaceWarmStrong: '#FFFFFF',
  surfaceMuted: '#F7F5F3',
  overlay: 'rgba(38,26,21,0.08)',
} as const;

/**
 * CRAVES uses a 4 dp spacing rhythm. Existing names are retained so current
 * screens can migrate without introducing a parallel theme API.
 */
export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const borderWidth = {
  standard: 1,
  focus: 1.4,
  strong: 2,
} as const;

/**
 * Font sizes intentionally remain unitless React Native dp values. Text keeps
 * React Native font scaling enabled; fixed line heights are deliberately not
 * embedded here so scaled text is not clipped by a non-scaling line box.
 */
export const typography = {
  title: 30,
  hero: 24,
  heading: 19,
  button: 16,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const textDefaults = {
  allowFontScaling: true,
} as const;

export const iconSize = {
  xs: 16,
  sm: 20,
  md: 22,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

/** Android-first accessible interaction sizes. */
export const touchTarget = {
  minimum: 48,
  comfortable: 56,
} as const;

/**
 * These values are content clearances only. Runtime device insets must still
 * come from react-native-safe-area-context; never replace them with constants.
 */
export const safeArea = {
  contentPadding: spacing.md,
  contentBottomPadding: spacing.lg,
  floatingControlClearance: spacing.md,
} as const;

export const elevation = {
  none: {
    shadowOpacity: 0,
    elevation: 0,
  },
  card: {
    shadowColor: colors.espressoBrown,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 6},
    elevation: 4,
  },
  primaryAction: {
    shadowColor: colors.flameRed,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
    elevation: 3,
  },
} as const;
