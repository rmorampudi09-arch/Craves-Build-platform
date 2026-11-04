import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useAppDispatch} from '../../../app/store/hooks';
import {colors, fontWeight, spacing, textDefaults, typography} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {authActions} from '../../auth/state/authSlice';
import {deletionCopy} from '../domain/deletionCopy';
import {formatDeletionDate} from '../domain/deletionModel';
import {useAccountDeletion} from '../state/AccountDeletionProvider';

const {keepIt: copy} = deletionCopy;

/** "Keep it?", asked once right after a sign-in that found an open delete request (board KeepIt). */
export function KeepItScreen() {
  const dispatch = useAppDispatch();
  const {pending, keep, keeping} = useAccountDeletion();
  const dismiss = () => dispatch(authActions.keepItDismissed());
  // A failed keep says so in the strip, which shows once this screen is gone.
  const keepAccount = async () => {
    await keep();
    dismiss();
  };

  const due = pending?.dueAt ? formatDeletionDate(pending.dueAt, 'short') : '';
  const title = pending && due ? copy.title[pending.scope](due) : copy.reviewTitle;

  return (
    <View style={styles.page}>
      <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
        {title}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.question}>
        {copy.question}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
        {copy.body}
      </Text>
      <View style={styles.actions}>
        <Button label={copy.keep} loading={keeping} onPress={keepAccount} />
        <Button label={copy.notNow} disabled={keeping} onPress={dismiss} variant="outline" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.white,
  },
  title: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  question: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold, textAlign: 'center'},
  body: {color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
  actions: {gap: spacing.sm, marginTop: spacing.lg},
});
