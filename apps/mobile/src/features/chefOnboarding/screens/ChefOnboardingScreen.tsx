import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {useAppDispatch} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, fontWeight, radius, spacing, touchTarget, typography, iconSize} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {accountResolutionService} from '../../auth/state/accountResolutionService';
import {authActions} from '../../auth/state/authSlice';
import {completeLogout} from '../../auth/state/logoutCoordinator';
import {switchChefToCustomerRole} from '../../chefProfile/state/chefProfileRoleSwitch';
import {ApplicationFacts, ChefStatusView, StatusLine, WhatHappensNext} from '../components/ChefApplicationStatus';
import {ChefOnboardingBank, type BankFormMode} from '../components/ChefOnboardingBank';
import {
  ChefBasicDetails,
  ChefFssaiDetails,
  ChefIdentityDetails,
  ChefKitchenDetails,
  ChefReviewDetails,
} from '../components/ChefOnboardingSections';
import {Card, LinkButton, Note, StatusChip, onboardingStyles as ui} from '../components/OnboardingUi';
import {
  CHEF_SECTIONS,
  CHEF_SECTION_DESCRIPTIONS,
  CHEF_SECTION_LABELS,
  CHEF_SECTION_TITLES,
  FSSAI_GUIDE_DESCRIPTION,
  FSSAI_GUIDE_TITLE,
  activeChefSections,
  applicationPhase,
  bankCanContinue,
  chefFullName,
  firstIncompleteSection,
  sectionProgress,
  type ChefFormSection,
  type ChefSectionProgress,
} from '../domain/chefOnboardingFlow';
import {useChefOnboarding, type ChefOnboardingFlow} from '../state/useChefOnboarding';

type Props = NativeStackScreenProps<RootStackParamList, 'ChefApplication'>;

const SECTION_ICONS: Record<ChefFormSection, IconName> = {
  personal: 'account',
  kitchen: 'store',
  fssai: 'shield',
  documents: 'id-card',
  bank: 'bank',
};
const PROGRESS_CHIP: Record<ChefSectionProgress, ReactNode> = {
  complete: <StatusChip tone="complete">Complete</StatusChip>,
  'in-progress': <StatusChip tone="progress">In progress</StatusChip>,
  'not-started': <StatusChip tone="idle">Not started</StatusChip>,
  attention: <StatusChip tone="attention">Needs attention</StatusChip>,
};

function ResumeScreen({flow}: {flow: ChefOnboardingFlow}) {
  const state = flow.state!;
  const progress = sectionProgress(state, flow.bank);
  return (
    <View style={ui.stack}>
      <Card subtitle="Tap any section to review or edit it." title="Your application">
        {activeChefSections(state).map(section => (
          <Pressable
            accessibilityRole="button"
            disabled={flow.busy}
            key={section}
            onPress={() => flow.open(section)}
            style={({pressed}) => [styles.listRow, pressed && styles.pressed]}>
            <Icon color={colors.textPrimary} name={SECTION_ICONS[section]} size={iconSize.xl} />
            <Text style={[ui.strong, styles.flex]}>{CHEF_SECTION_LABELS[section]}</Text>
            {PROGRESS_CHIP[progress[section]]}
            <Icon color={colors.textSecondary} name="chevron-right" size={iconSize.sm} surface={false} />
          </Pressable>
        ))}
      </Card>
      <Note icon="check">Everything you entered is saved exactly as you left it.</Note>
    </View>
  );
}

function PageState({title, message, busy, children}: {title: string; message: string; busy?: boolean; children?: ReactNode}) {
  return (
    <SafeAreaView style={[styles.root, styles.pageState]}>
      {busy ? <ActivityIndicator color={colors.flameRedAccessible} size="large" /> : <Icon color={colors.textPrimary} name="clock" size={iconSize.xl} />}
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={[ui.muted, styles.center]}>{message}</Text>
      {children ? <View style={styles.pageActions}>{children}</View> : null}
    </SafeAreaView>
  );
}

/** The website's step-by-step chef application (craves.in/chef/application) for the app. */
export function ChefOnboardingScreen({navigation}: Props) {
  const dispatch = useAppDispatch();
  const flow = useChefOnboarding();
  const {state, screen, busy} = flow;
  const [bankMode, setBankMode] = useState<BankFormMode>('entry');
  const [bankSignal, setBankSignal] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const scroller = useRef<ScrollView>(null);
  const backRef = useRef(flow.back);
  backRef.current = flow.back;

  const guide = screen === 'fssai' && flow.fssaiGuide;
  const screenKey = `${screen}${guide ? '-guide' : ''}`;
  useEffect(() => {
    scroller.current?.scrollTo({y: 0, animated: false});
  }, [screenKey]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => backRef.current());
    return () => listener.remove();
  }, []);
  const {bank, bankUnavailable, refreshBank} = flow;
  useEffect(() => {
    // An optional bank step is read only when the chef opens it.
    if (screen === 'bank' && !bank && !bankUnavailable) refreshBank().catch(() => undefined);
  }, [screen, bank, bankUnavailable, refreshBank]);

  // Servers without the step-by-step application, and applications made with the older form, keep the older screens.
  const legacy = flow.unavailable || Boolean(state && (!state.enabled || state.legacy) && screen !== 'status');
  useEffect(() => {
    if (!legacy) return;
    const status = state?.application.status;
    if (status === 'PENDING' || status === 'APPROVED') navigation.replace('ChefAccountStatus', {status});
    else navigation.replace('ChefRegistration');
  }, [legacy, navigation, state?.application.status]);

  async function leaveFor(action: () => Promise<void>) {
    if (leaving) return;
    setLeaving(true);
    setLeaveError('');
    try {
      await action();
    } catch (failure) {
      setLeaveError(toAppApiError(failure).message);
    } finally {
      setLeaving(false);
    }
  }
  const openKitchen = () =>
    leaveFor(async () => {
      dispatch(authActions.accountResolved(await accountResolutionService.resolve('CHEF')));
    });
  const toCustomer = () => leaveFor(() => switchChefToCustomerRole(dispatch));
  const signOut = () => leaveFor(() => completeLogout(dispatch));

  if (legacy) return <PageState busy message="Loading your saved details…" title="Opening your application" />;
  if (!state)
    return flow.loading ? (
      <PageState busy message="Loading your saved details…" title="Opening your application" />
    ) : (
      <PageState message={flow.error || 'Please try again.'} title="We couldn’t open your application">
        <Button label="Try again" leftIcon="renew" onPress={() => flow.load()} />
        <LinkButton center label="Sign out" onPress={signOut} />
      </PageState>
    );

  const section = CHEF_SECTIONS.includes(screen as ChefFormSection) ? (screen as ChefFormSection) : null;
  const saveLabel = flow.fromReview ? 'Save and return to review' : 'Save and continue';
  const phase = applicationPhase({
    application: state.application,
    progress: state.progress,
    submitted: state.submitted || state.legacy,
  });
  const editing = screen !== 'submitted' && screen !== 'status';
  // Nothing is claimed for a brand-new application until the first confirmed save.
  const saveState = !editing ? null : busy ? 'Saving' : !state.details ? null : flow.dirty ? 'Unsaved changes' : 'Draft saved';
  const title = guide
    ? FSSAI_GUIDE_TITLE
    : screen === 'resume' && flow.details.firstName
      ? `Welcome back, ${flow.details.firstName}`
      : CHEF_SECTION_TITLES[screen];
  const description = guide ? FSSAI_GUIDE_DESCRIPTION : CHEF_SECTION_DESCRIPTIONS[screen];
  const busyLabel = screen === 'review' ? 'Submitting…' : 'Saving…';
  const primary = (label: string, onPress: () => void, disabled = false) => (
    <Button disabled={busy || disabled} label={busy ? busyLabel : label} loading={busy} onPress={onPress} />
  );

  let footer: ReactNode;
  if (screen === 'submitted') footer = <Button label="View application status" onPress={() => flow.go('status')} />;
  else if (screen === 'status')
    footer =
      phase === 'APPROVED' ? (
        <Button label="Open your kitchen" loading={leaving} onPress={openKitchen} />
      ) : (
        <>
          {phase === 'DRAFT'
            ? primary('Continue application', () => flow.go(state.details ? 'resume' : 'personal'))
            : phase === 'MORE_INFORMATION_REQUIRED'
              ? primary('Update application', () => flow.open(flow.nextCorrection()))
              : phase === 'REJECTED'
                ? null
                : <Button disabled={busy} label={flow.loading ? 'Checking status…' : 'Refresh status'} loading={flow.loading} onPress={() => flow.load()} />}
          <View style={styles.footerLinks}>
            <LinkButton disabled={leaving} label="Switch to customer app" onPress={toCustomer} />
            <LinkButton disabled={leaving} label="Sign out" onPress={signOut} />
          </View>
        </>
      );
  else if (screen === 'resume') {
    const next = firstIncompleteSection(state, flow.bank);
    footer = primary(next === 'review' ? 'Review application' : 'Continue application', () => flow.open(next));
  } else if (screen === 'review') footer = primary('Submit application', () => flow.submit());
  else if (guide) footer = primary(saveLabel, () => flow.continueWithoutFssai());
  else if (section === 'bank')
    footer = primary(
      bankMode === 'entry' ? 'Continue' : saveLabel,
      () => setBankSignal(value => value + 1),
      // Without automatic bank setup there is nothing to submit; the note above says why.
      !bankCanContinue(flow.bank) && (flow.bankUnavailable || !flow.bank?.automaticActivation),
    );
  else if (section) footer = primary(saveLabel, () => flow.saveSection(section));

  const firstFieldError = flow.fieldErrors[0]?.message;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.header}>
        {editing ? (
          <Pressable accessibilityLabel="Back" accessibilityRole="button" disabled={busy} hitSlop={spacing.xs} onPress={() => flow.back()} style={styles.headerButton}>
            <Icon color={colors.textPrimary} name="arrow-left" size={iconSize.md} surface={false} />
          </Pressable>
        ) : null}
        <Text numberOfLines={1} style={styles.headerTitle}>{editing ? title : 'Craves for Chefs'}</Text>
        {saveState ? (
          <View accessibilityLiveRegion="polite" style={styles.saveState}>
            {saveState === 'Saving' ? <ActivityIndicator color={colors.flameRedAccessible} size="small" /> : null}
            {saveState === 'Draft saved' ? <Icon color={colors.successText} name="check" size={14} surface={false} /> : null}
            <Text style={ui.muted}>{saveState}</Text>
          </View>
        ) : null}
        {editing ? (
          <Pressable accessibilityRole="button" disabled={busy} hitSlop={spacing.xs} onPress={flow.exit}>
            <Text style={styles.exit}>Save & exit</Text>
          </Pressable>
        ) : null}
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          ref={scroller}
          showsVerticalScrollIndicator={false}>
          {screen === 'submitted' ? (
            <View style={styles.hero}>
              <Icon color={colors.white} name="check" size={iconSize.xl} surface={false} />
            </View>
          ) : null}
          <View style={[styles.heading, screen === 'submitted' && styles.headingCenter]}>
            <Text accessibilityRole="header" style={[styles.title, screen === 'submitted' && styles.center]}>{title}</Text>
            <Text style={[ui.muted, screen === 'submitted' && styles.center]}>{description}</Text>
          </View>
          {screen === 'personal' ? <ChefBasicDetails flow={flow} /> : null}
          {screen === 'kitchen' ? <ChefKitchenDetails flow={flow} /> : null}
          {screen === 'fssai' ? <ChefFssaiDetails flow={flow} /> : null}
          {screen === 'documents' ? <ChefIdentityDetails flow={flow} /> : null}
          {screen === 'bank' ? (
            <ChefOnboardingBank
              bank={flow.bank}
              busy={busy}
              name={chefFullName(flow.details)}
              onBusy={flow.bankBusy}
              onModeChange={setBankMode}
              onRefresh={() => flow.refreshBank()}
              onSaved={flow.savedBank}
              submitSignal={bankSignal}
              unavailable={flow.bankUnavailable}
            />
          ) : null}
          {screen === 'review' ? <ChefReviewDetails flow={flow} /> : null}
          {screen === 'resume' ? <ResumeScreen flow={flow} /> : null}
          {screen === 'submitted' ? (
            <View style={ui.stack}>
              <Card>
                <StatusLine icon="clock" label="Submitted" />
                <View style={[ui.divider, styles.divider]} />
                <ApplicationFacts application={state.application} phase="SUBMITTED" />
              </Card>
              <WhatHappensNext />
            </View>
          ) : null}
          {screen === 'status' ? (
            <ChefStatusView
              application={state.application}
              documents={state.documents}
              onOpenSection={next => flow.open(next)}
              phase={phase}
              reason={state.progress?.reason}
              sections={state.progress?.sections ?? []}
              supportEmail={state.supportEmail}
              supportPhone={state.supportPhone}
            />
          ) : null}
          {flow.notice ? <View style={styles.topGap}><Note tone="neutral">{flow.notice}</Note></View> : null}
          {(flow.error && !editing) || leaveError ? (
            <View style={styles.topGap}><Note tone="error">{leaveError || flow.error}</Note></View>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          {flow.error && editing ? <Note tone="error">{flow.error}</Note> : null}
          {firstFieldError && editing ? (
            <Note tone="error">{flow.fieldErrors.length > 1 ? `${firstFieldError} Check the highlighted fields.` : firstFieldError}</Note>
          ) : null}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.surfaceMuted},
  flex: {flex: 1, minWidth: 0},
  center: {textAlign: 'center'},
  pressed: {opacity: 0.7},
  topGap: {marginTop: spacing.md},
  divider: {marginVertical: spacing.md},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  headerTitle: {flex: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  saveState: {flexDirection: 'row', alignItems: 'center', gap: 4},
  exit: {color: colors.flameRedAccessible, fontSize: typography.small + 1, fontWeight: fontWeight.semibold},
  body: {padding: spacing.md, paddingBottom: spacing.xl},
  heading: {gap: spacing.xxs, marginBottom: spacing.lg},
  headingCenter: {alignItems: 'center'},
  title: {color: colors.textPrimary, fontSize: typography.hero, fontWeight: fontWeight.extrabold},
  hero: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    marginBottom: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLinks: {flexDirection: 'row', justifyContent: 'space-between'},
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget.comfortable,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pageState: {alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl},
  pageActions: {alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md},
});
