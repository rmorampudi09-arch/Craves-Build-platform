import { colors } from '../../../design/tokens';

export const loginColors = {
  ink: '#0B0D12',
  body: '#606673',
  placeholder: '#858A95',
  border: '#D4D7DE',
  selectedBorder: '#F58F84',
  selectedFill: '#FFE6E2',
  red: colors.flameRed,
  textRed: colors.flameRedAccessible,
} as const;

export const loginFonts = {
  regular: 'CravesLoginRegular',
  semibold: 'CravesLoginSemibold',
  bold: 'CravesLoginBold',
} as const;

export const loginFontAssets = {
  [loginFonts.regular]: require('../../../assets/auth/fonts/Outfit-Regular.ttf'),
  [loginFonts.semibold]: require('../../../assets/auth/fonts/Outfit-SemiBold.ttf'),
  [loginFonts.bold]: require('../../../assets/auth/fonts/Outfit-Bold.ttf'),
};

/** Share of the screen the white sign-in sheet takes; the video fills the rest. */
export const loginPanelFractions = {
  resting: 1 / 3,
  raised: 1 / 2,
  /** Typing needs the field and its button above the keyboard. */
  keyboard: 2 / 3,
} as const;
