import { StyleSheet } from 'react-native';
import { colors } from '../../../design/tokens';
import { loginColors, loginFonts } from './loginVisuals';

export const loginStyles = StyleSheet.create({
  linkTouch: { minHeight: 48, justifyContent: 'center' },
  rightLinkTouch: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  destinationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  heading: { gap: 5, marginVertical: 3 },
  title: {
    fontSize: 27,
    fontFamily: loginFonts.bold,
    color: loginColors.ink,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    fontFamily: loginFonts.regular,
    color: loginColors.body,
    textAlign: 'center',
  },
  error: { fontSize: 13, color: colors.error, fontFamily: loginFonts.regular },
  link: {
    fontSize: 14,
    fontFamily: loginFonts.semibold,
    color: loginColors.textRed,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  disabled: { opacity: 0.56 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 3,
  },
  line: { height: 1, backgroundColor: loginColors.border, flex: 1 },
  dividerText: {
    fontSize: 14,
    color: loginColors.body,
    fontFamily: loginFonts.regular,
  },
  emphasis: { fontFamily: loginFonts.bold, color: loginColors.ink },
});
