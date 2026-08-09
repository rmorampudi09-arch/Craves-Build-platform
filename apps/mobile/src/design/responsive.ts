import {spacing} from './tokens';

/**
 * P114 audit buckets. These are layout guardrails, not new product breakpoints:
 * compact catches narrow Android phones, standard covers the common phone range,
 * and large protects large-phone/tablet proportions without introducing a new
 * multi-column product design.
 */
export const responsiveLayout = {
  compactMaxWidth: 359,
  largeMinWidth: 480,
  enlargedFontScale: 1.3,
  authContentMaxWidth: 560,
} as const;

export type ResponsiveWidthClass = 'compact' | 'standard' | 'large';

export function classifyResponsiveWidth(width: number): ResponsiveWidthClass {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;

  if (safeWidth <= responsiveLayout.compactMaxWidth) {
    return 'compact';
  }
  if (safeWidth >= responsiveLayout.largeMinWidth) {
    return 'large';
  }
  return 'standard';
}

/**
 * Critical bottom actions stack when horizontal space or scaled text makes a
 * two-column action row unsafe. Large screens keep the approved row layout.
 */
export function shouldStackCriticalActions(width: number, fontScale: number): boolean {
  const safeFontScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  return (
    classifyResponsiveWidth(width) === 'compact' ||
    safeFontScale >= responsiveLayout.enlargedFontScale
  );
}

/** Keep sticky actions clear of gesture/navigation insets without fixed bar heights. */
export function getBottomActionPadding(bottomInset: number): number {
  const safeInset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  return Math.max(spacing.sm, safeInset + spacing.xs);
}
