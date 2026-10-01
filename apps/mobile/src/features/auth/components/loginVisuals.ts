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
  [loginFonts.regular]: require('../../../assets/auth/fonts/Inter-Regular.ttf'),
  [loginFonts.semibold]: require('../../../assets/auth/fonts/Inter-SemiBold.ttf'),
  [loginFonts.bold]: require('../../../assets/auth/fonts/Inter-Bold.ttf'),
};

export const loginHeroFractions = {
  welcome: 0.465,
  phone: 0.45,
  otp: 0.465,
  email: 0.425,
} as const;

export type LoginLayout = keyof typeof loginHeroFractions;

export function authHeroFraction(route: string) {
  switch (route) {
    case 'RoleSelection':
      return loginHeroFractions.welcome;
    case 'OtpVerification':
      return loginHeroFractions.otp;
    case 'EmailSignIn':
      return loginHeroFractions.email;
    default:
      return loginHeroFractions.phone;
  }
}
