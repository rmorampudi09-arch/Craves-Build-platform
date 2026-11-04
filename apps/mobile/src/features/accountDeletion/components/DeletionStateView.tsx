import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefActionButton} from '../../chefShell/components/ui';
import {deletionCopy} from '../domain/deletionCopy';
import {formatDeletionDate, type EntryState} from '../domain/deletionModel';
import type {DeletionScope} from '../domain/deletionTypes';
import type {DeleteAccountScaffoldProps} from '../screens/DeleteAccountScreen';
import {useAccountDeletion} from '../state/AccountDeletionProvider';

const {state: copy} = deletionCopy;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type StepStatus = 'done' | 'current' | 'todo';
interface Step {
  title: string;
  body: string;
  status: StepStatus;
}
interface Content {
  tag?: string;
  title: string;
  body?: string;
  steps?: Step[];
  /** What Craves wrote when it declined. */
  reason?: string | null;
  lines?: readonly string[];
}

interface Props {
  state: Exclude<EntryState, {kind: 'start'}>;
  /** Decides whether "Keep my account" says the kitchen reopens. */
  roles: readonly string[];
  /** The page around the content, with the screen's title; the buttons go in its footer. */
  Scaffold: React.ComponentType<DeleteAccountScaffoldProps>;
  title: string;
  /** Declined only: the screen shows the start flow. */
  onAskAgain: () => void;
  onContactSupport: () => void;
  /** Keep my account went through (or deletion had already started): the screen asks the server again. */
  onKept: () => void;
}

/** A scope the app does not know reads as the whole account. */
function byScope<T>(map: Record<DeletionScope, T>, scope: DeletionScope): T {
  return map[scope] ?? map.ALL;
}

function formatted(iso: string | null, style: 'short' | 'long', shiftMs = 0): string {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? '' : formatDeletionDate(new Date(ms + shiftMs).toISOString(), style);
}

function contentFor({kind, view}: Props['state']): Content {
  const {scope} = view;
  switch (kind) {
    case 'inReview': {
      const last = byScope({CHEF: copy.inReviewLastSide, CUSTOMER: copy.stepDeleted.CUSTOMER, ALL: copy.inReviewLastAll}, scope);
      const titles = [...copy.inReviewSteps, last];
      return {
        tag: copy.inReviewTag,
        title: copy.inReviewTitle,
        body: copy.inReviewBody,
        steps: titles.map((title, index) => ({
          title,
          body: index === 0 ? formatted(view.requestedAt, 'short') : (copy.inReviewStepBodies[index] ?? ''),
          status: index === 0 ? 'done' : index === 1 ? 'current' : 'todo',
        })),
      };
    }
    case 'scheduled': {
      const reminder = formatted(view.dueAt, 'short', -WEEK_MS);
      return {
        tag: copy.scheduledTag,
        title: byScope(copy.scheduledTitle, scope)(formatted(view.dueAt, 'long')),
        body: byScope(copy.scheduledBody, scope),
        steps: [
          {title: copy.stepAsked, body: formatted(view.requestedAt, 'short'), status: 'done'},
          {title: copy.stepReminder, body: reminder ? copy.stepReminderBody(reminder) : '', status: 'current'},
          {title: byScope(copy.stepDeleted, scope), body: formatted(view.dueAt, 'short'), status: 'todo'},
        ],
      };
    }
    case 'waiting':
      return {tag: copy.waitingTag, title: copy.waitingTitle, body: copy.waitingBody};
    case 'erasing':
      return {title: byScope(copy.erasingTitle, scope), body: copy.erasingBody};
    case 'declined':
      return {tag: copy.declinedTag, title: byScope(copy.declinedTitle, scope), reason: view.reviewNote, lines: copy.declinedLines};
  }
}

function Tag({text, declined}: {text: string; declined: boolean}) {
  return (
    <View style={[styles.tag, declined ? styles.tagDeclined : styles.tagOpen]}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.tagText, declined ? styles.tagTextDeclined : styles.tagTextOpen]}>
        {text}
      </Text>
    </View>
  );
}

function StepRow({step, index}: {step: Step; index: number}) {
  return (
    <View style={styles.step}>
      <View style={[styles.marker, step.status === 'done' && styles.markerDone, step.status === 'current' && styles.markerCurrent]}>
        {step.status === 'done' ? (
          <Icon color={colors.white} name="check" size={14} surface={false} />
        ) : (
          <Text allowFontScaling={false} style={[styles.markerText, step.status === 'current' && styles.markerTextCurrent]}>
            {index + 1}
          </Text>
        )}
      </View>
      <View style={styles.stepCopy}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.strong, step.status === 'todo' && styles.muted]}>
          {step.title}
        </Text>
        {step.body ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
            {step.body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Where a delete request stands: in review, scheduled, waiting, being deleted or declined (spec, "One entry screen, five states"). */
export function DeletionStateView({state, roles, Scaffold, title, onAskAgain, onContactSupport, onKept}: Props) {
  const {keep, keeping} = useAccountDeletion();
  const {kind, view} = state;
  const content = contentFor(state);
  const keepsKitchen = view.scope === 'CHEF' || (view.scope === 'ALL' && roles.includes('CHEF'));

  const keepAccount = async () => {
    // A failed keep says so in the strip and leaves this state as it was.
    if ((await keep()) !== 'failed') {
      onKept();
    }
  };

  const keepButton = <ChefActionButton busy={keeping} label={deletionCopy.banner.keep} onPress={keepAccount} />;
  let footer: React.ReactNode;
  if (kind === 'inReview') {
    footer = (
      <View style={styles.footer}>
        {keepButton}
        {keepsKitchen ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.line, styles.centered]}>
            {copy.keepNoteKitchen}
          </Text>
        ) : null}
      </View>
    );
  } else if (kind === 'scheduled' || kind === 'waiting') {
    footer = keepButton;
  } else if (kind === 'declined') {
    footer = (
      <View style={styles.footer}>
        <ChefActionButton label={copy.askAgain} onPress={onAskAgain} />
        <ChefActionButton label={copy.contactSupport} onPress={onContactSupport} tone="neutral" />
      </View>
    );
  }

  return (
    <Scaffold footer={footer} title={title}>
      <View style={styles.root}>
        {content.tag ? <Tag declined={kind === 'declined'} text={content.tag} /> : null}
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
          {content.title}
        </Text>
        {content.body ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
            {content.body}
          </Text>
        ) : null}
        {content.steps ? (
          <View style={styles.card}>
            {content.steps.map((step, index) => (
              <StepRow index={index} key={step.title} step={step} />
            ))}
          </View>
        ) : null}
        {content.reason ? (
          <View style={styles.reason}>
            <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.reasonLabel}>
              {copy.reasonLabel}
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.strong}>
              {content.reason}
            </Text>
          </View>
        ) : null}
        {content.lines?.map(line => (
          <Text allowFontScaling={textDefaults.allowFontScaling} key={line} style={styles.body}>
            {line}
          </Text>
        ))}
      </View>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  root: {gap: spacing.md},
  footer: {gap: spacing.xs},
  tag: {alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill},
  tagOpen: {backgroundColor: colors.warningSoft},
  tagDeclined: {backgroundColor: colors.errorSoft},
  tagText: {fontSize: typography.tiny, fontWeight: fontWeight.bold, textTransform: 'uppercase'},
  tagTextOpen: {color: colors.warningText},
  tagTextDeclined: {color: colors.flameRedAccessible},
  title: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  body: {color: colors.textSecondary, fontSize: typography.body},
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  step: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  marker: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  markerDone: {backgroundColor: colors.successText},
  markerCurrent: {backgroundColor: colors.flameRedAccessible},
  markerText: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  markerTextCurrent: {color: colors.white},
  stepCopy: {flex: 1, gap: spacing.xxs},
  strong: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  muted: {color: colors.textSecondary},
  line: {color: colors.textSecondary, fontSize: typography.small},
  centered: {textAlign: 'center'},
  reason: {gap: spacing.xxs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.errorSoft},
  reasonLabel: {color: colors.flameRedAccessible, fontSize: typography.tiny, fontWeight: fontWeight.semibold, textTransform: 'uppercase'},
});
