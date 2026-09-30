import { StyleSheet } from 'react-native';
import { colors } from '../../../design/tokens';

export const loginStyles = StyleSheet.create({
  linkTouch: {minHeight: 48, justifyContent: 'center'},
  rightLinkTouch: {minHeight: 48, justifyContent: 'center', alignSelf: 'flex-end'},
  destinationRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12},
  heading: { gap: 4 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: { fontSize: 13, color: colors.error },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.flameRedAccessible,
    textAlign: 'center',
  },
  disabled: { opacity: 0.56 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { height: 1, backgroundColor: '#E7E9ED', flex: 1 },
  dividerText: { fontSize: 13, color: colors.textSecondary },
});
