import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {colors, fontWeight, textDefaults, typography} from '../../../design/tokens';
import {deletionCopy} from '../domain/deletionCopy';
import {formatDeletionDate, type EntryState} from '../domain/deletionModel';

const {state} = deletionCopy;

/** What the screen says for a request already on record. Placeholder: the full state views replace it. */
export function DeletionStateHeading({entry}: {entry: Exclude<EntryState, {kind: 'start'}>}) {
  const {view} = entry;
  const long = view.dueAt ? formatDeletionDate(view.dueAt, 'long') : '';
  const title =
    entry.kind === 'inReview'
      ? state.inReviewTitle
      : entry.kind === 'scheduled'
        ? state.scheduledTitle[view.scope](long)
        : entry.kind === 'waiting'
          ? state.waitingTitle
          : entry.kind === 'erasing'
            ? state.erasingTitle[view.scope]
            : state.declinedTitle[view.scope];
  return (
    <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
});
