import React from 'react';
import {Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, radius, spacing, typography, iconSize} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon, type IconName} from '../../../shared/components/Icon';
import type {ChefApplicationSummary, ChefEvidence} from '../api/chefOnboardingApi';
import {
  APPLICATION_PHASE_COPY,
  CHEF_SECTION_LABELS,
  CHEF_SECTIONS,
  formatDate,
  formatPhone,
  sectionForDocument,
  type ChefApplicationPhase,
  type ChefFormSection,
} from '../domain/chefOnboardingFlow';
import {Card, Note, Rows, StatusChip, onboardingStyles as ui} from './OnboardingUi';

const PHASE_ICON: Record<ChefApplicationPhase, IconName> = {
  DRAFT: 'document',
  SUBMITTED: 'clock',
  UNDER_REVIEW: 'search',
  MORE_INFORMATION_REQUIRED: 'alert',
  APPROVED: 'check',
  REJECTED: 'close',
};

export function WhatHappensNext() {
  const items: [IconName, string, string][] = [
    ['search', 'Application review', 'Our team will review the details you submitted.'],
    ['bell', 'Status update', 'We’ll update your application status as the review progresses.'],
    ['chef', 'Set up your kitchen', 'Once approved, you can add menu items, configure working hours and manage orders.'],
  ];
  return (
    <Card title="What happens next?">
      <View style={ui.fields}>
        {items.map(([icon, title, body]) => (
          <View key={title} style={styles.next}>
            <Icon color={colors.textPrimary} name={icon} size={iconSize.xl} />
            <View style={styles.flex}>
              <Text style={ui.strong}>{title}</Text>
              <Text style={ui.muted}>{body}</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function ApplicationFacts({application, phase}: {application: ChefApplicationSummary; phase: ChefApplicationPhase}) {
  const rows: [string, string][] = [
    application.referenceCode ? ['Application reference', application.referenceCode] : ['Application ID', application.id ?? ''],
    ['Submitted on', phase === 'DRAFT' ? '' : formatDate(application.submittedAt)],
    ['Last reviewed', formatDate(application.reviewedAt)],
  ];
  const visible = rows.filter(([, value]) => value);
  return visible.length ? <Rows rows={visible} /> : null;
}

export function StatusLine({icon, label}: {icon: IconName; label: string}) {
  return (
    <View style={styles.statusLine}>
      <Icon color={colors.textPrimary} name={icon} size={iconSize.xl} />
      <View style={styles.flex}>
        <Text style={ui.muted}>Application status</Text>
        <Text style={styles.statusLabel}>{label}</Text>
      </View>
    </View>
  );
}

/** Status content for every phase. Chef tools are never offered before approval. */
export function ChefStatusView({
  phase,
  application,
  reason,
  documents,
  sections: requested,
  supportPhone,
  supportEmail,
  onOpenSection,
}: {
  phase: ChefApplicationPhase;
  application: ChefApplicationSummary;
  reason?: string | null;
  documents: ChefEvidence[];
  sections: string[];
  supportPhone: string;
  supportEmail: string;
  onOpenSection: (section: ChefFormSection) => void;
}) {
  const copy = APPLICATION_PHASE_COPY[phase];
  const needsUpdate = documents.filter(document => document.status === 'REJECTED');
  const flagged = new Set<string | null>([...requested, ...needsUpdate.map(document => sectionForDocument(document.documentType))]);
  const sections = CHEF_SECTIONS.filter(section => flagged.has(section));
  const explanation = reason ?? application.rejectionReason;
  return (
    <View style={ui.stack}>
      <Card>
        <StatusLine icon={PHASE_ICON[phase]} label={copy.label} />
        <Text style={[ui.body, styles.topGap]}>
          {copy.message}{' '}
          <Text style={{color: colors.textSecondary}}>
            {phase === 'SUBMITTED' || phase === 'UNDER_REVIEW'
              ? 'Chef tools open once your application is approved.'
              : phase === 'APPROVED'
                ? 'Set up your working hours, availability and menu to start receiving orders.'
                : phase === 'MORE_INFORMATION_REQUIRED'
                  ? 'Update the details below and submit your application again.'
                  : phase === 'DRAFT'
                    ? 'Continue where you left off. Your saved details are kept.'
                    : 'Contact Craves support if you have questions about this decision.'}
          </Text>
        </Text>
        {phase === 'REJECTED' && explanation ? (
          <View style={[styles.reason, styles.topGap]}>
            <Text style={ui.strong}>Reason</Text>
            <Text style={ui.body}>{explanation}</Text>
          </View>
        ) : null}
        <View style={[ui.divider, styles.divider]} />
        <ApplicationFacts application={application} phase={phase} />
      </Card>

      {phase === 'MORE_INFORMATION_REQUIRED' ? (
        <Card icon="alert" title="What needs updating">
          <View style={ui.fields}>
            {explanation ? (
              <View style={styles.reason}>
                <Text style={ui.strong}>Note from Craves</Text>
                <Text style={ui.body}>{explanation}</Text>
              </View>
            ) : null}
            {sections.map(section => (
              // Each flagged section opens straight on its own step.
              <Pressable accessibilityRole="button" key={section} onPress={() => onOpenSection(section)} style={styles.listRow}>
                <View style={styles.flex}>
                  <Text style={ui.strong}>{CHEF_SECTION_LABELS[section]}</Text>
                  {needsUpdate
                    .filter(document => sectionForDocument(document.documentType) === section)
                    .map(document => (
                      <Text key={document.id} style={ui.muted}>{document.reviewReason ?? 'Upload a new file.'}</Text>
                    ))}
                </View>
                <StatusChip tone="attention">Needs attention</StatusChip>
                <Icon color={colors.textSecondary} name="chevron-right" size={iconSize.sm} surface={false} />
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      {phase === 'REJECTED' && (supportPhone || supportEmail) ? (
        <Card subtitle="We can explain the decision and what you can do next." title="Talk to Craves support">
          <View style={styles.gap}>
            {supportPhone ? (
              <Button label={`Call ${formatPhone(supportPhone)}`} leftIcon="phone" onPress={() => Linking.openURL(`tel:${supportPhone}`)} variant="outline" />
            ) : null}
            {supportEmail ? (
              <Button
                label={`Email ${supportEmail}`}
                leftIcon="mail"
                onPress={() => Linking.openURL(`mailto:${supportEmail}?subject=${encodeURIComponent(`Chef application ${application.id ?? ''}`.trim())}`)}
                variant="outline"
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      {phase === 'SUBMITTED' || phase === 'UNDER_REVIEW' ? (
        <>
          <WhatHappensNext />
          <Note icon="clock" tone="neutral">
            Applications are reviewed in the order they arrive, so the time can vary. You don’t need to do anything now: this page shows the decision as soon as it’s made.
          </Note>
        </>
      ) : null}

      {phase === 'APPROVED' ? (
        <Note icon="chef" tone="neutral">Your kitchen is ready. Add your working hours, availability and menu items there.</Note>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  gap: {gap: spacing.sm},
  topGap: {marginTop: spacing.sm},
  divider: {marginVertical: spacing.md},
  next: {flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start'},
  statusLine: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  statusLabel: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  reason: {gap: 2, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
