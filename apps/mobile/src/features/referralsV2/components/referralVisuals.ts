import { colors, spacing } from '../../../design/tokens';

// Scoped to the four supplied referral references, not an app-wide theme change.
export const referralColors = {
  ink: '#0B0D12',
  muted: '#6B707B',
  border: '#E5E6E9',
  fill: '#F2F3F5',
  white: colors.white,
  red: colors.flameRed,
  green: '#22C55E',
} as const;

export const referralFonts = {
  regular: 'CravesReferralRegular',
  semibold: 'CravesReferralSemibold',
  bold: 'CravesReferralBold',
} as const;

export const referralFontAssets = {
  [referralFonts.regular]: require('../../../assets/auth/fonts/Inter-Regular.ttf'),
  [referralFonts.semibold]: require('../../../assets/auth/fonts/Inter-SemiBold.ttf'),
  [referralFonts.bold]: require('../../../assets/auth/fonts/Inter-Bold.ttf'),
};

export const referralLayout = {
  inset: spacing.md,
  sectionGap: spacing.sm,
  sectionRadius: 8,
} as const;
