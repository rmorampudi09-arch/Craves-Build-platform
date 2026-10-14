export const colors = {
  black: '#000000',
  flameRed: '#F62E18',
  /**
   * Text-safe red for normal-sized action copy and text-bearing red surfaces.
   * Keep flameRed for exact brand accents where the 3:1 non-text target applies.
   */
  flameRedAccessible: '#D92714',
  flameRedSoft: '#FF5548',
  /** Shared icon-tile background across customer and Chef experiences. */
  iconSurface: '#FDEAE8',
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
  infoText: '#261A15',
  infoSoft: '#FDEAE8',
  muted: '#F7F5F3',
  surfaceBase: '#FFFFFF',
  surfaceWarm: '#FFFFFF',
  surfaceWarmStrong: '#FFFFFF',
  surfaceMuted: '#F7F5F3',
  overlay: 'rgba(38,26,21,0.08)',
} as const;

/** Foreground colors shared only by the bottom menus. */
export const bottomMenu = {
  activeColor: colors.flameRedAccessible,
  // Warm espresso reads over food photos through the glass, where neutral grey turns muddy.
  inactiveColor: '#3A2C25',
  iconStrokeWidth: 1.8,
  /** Soft halo on the active customer tab: faint, wider strokes behind the icon and a matching text glow. */
  glowColor: colors.flameRed,
  glowLayers: [
    { strokeWidth: 8, opacity: 0.08 },
    { strokeWidth: 6, opacity: 0.18 },
    { strokeWidth: 4.2, opacity: 0.32 },
  ],
  glowTextShadow: 'rgba(246,46,24,0.85)',
  glowTextRadius: 12,
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

/** Shared home optics; native iOS glass manages its own refraction and blur. */
export const homeLiquidGlass = {
  blurIntensity: 22,
  blurReductionFactor: 2.5,
  edgeDepth: 4,
  highlightOpacity: 0.62,
  edgeShadowOpacity: 0.24,
  topLightOpacity: 0.18,
  bottomLightOpacity: 0.08,
  /**
   * Clear Apple-style glass on Android 13+. Sources: kube.io (convex squircle bezel,
   * index 1.5, rim light 0.4-0.5), liquidGL presets (bezel 0.15-0.27, frost 0-2 px),
   * liquid-glass-react defaults (saturation 140%, aberration 2). Refraction runs 0-1,
   * where 0.5 is physical glass and 1 (used here) is the strongest bend at the borders.
   */
  capsuleOptics: {
    refraction: 1,
    blurRadius: 3,
    bezel: 0.22,
    thickness: 1.5,
    aberration: 2,
    saturation: 1.4,
    tint: [1, 1, 1, 0.05],
    specular: 0.45,
    edgeGlow: 0,
  },
  /** The menu carries labels, so it starts from kube.io's searchbox (refraction 0.7, some blur), tuned on device. */
  navigationOptics: {
    refraction: 1,
    blurRadius: 4,
    bezel: 0.18,
    thickness: 1,
    aberration: 2,
    saturation: 1.4,
    tint: [1, 1, 1, 0.1],
    specular: 0.3,
    edgeGlow: 0,
  },
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
// iPhone (Dynamic Type) sizes, one step per level so the app's hierarchy is unchanged:
// Large Title, Title 1, Title 3, Headline/buttons, Body, Subheadline, Caption 1.
export const typography = {
  title: 34,
  hero: 28,
  heading: 20,
  button: 17,
  body: 17,
  small: 15,
  tiny: 12,
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
