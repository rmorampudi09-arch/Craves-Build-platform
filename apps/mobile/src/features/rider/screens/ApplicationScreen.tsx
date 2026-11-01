import React, {useEffect, useRef, useState, type PropsWithChildren, type ReactNode} from 'react';
import {BackHandler, Linking, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient, type UseQueryResult} from '@tanstack/react-query';
import {InputField} from '../../../shared/components';
import {borderWidth, colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import type {RiderMe, RiderProfile} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {riderDevice} from '../native/riderDevice';
import {riderApiMode} from '../riderConfig';
import {registerPhone} from '../components/RiderRuntime';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {CheckRow} from '../components/Choices';
import {chooseDocumentPhoto} from '../components/DocumentPhoto';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, ProblemCard} from '../components/StateCard';
import {StatusBadge} from '../components/StatusBadge';
import {StepBar} from '../components/StepBar';
import {Timeline} from '../components/Timeline';
import {Card, RiderScreen, Title} from '../components/ui';
import {APPLY_STEPS, applicationOf, requiredDocuments, resumeStep, vehicleModel, type Application, type ApplyStep} from '../domain/application';
import {formatClock} from '../domain/format';
import {riderMessage} from '../domain/problem';
import {useRiderShell, type RiderNav} from '../navigation';
import {riderKeys, useProfile, useRecheck} from '../state/riderQueries';
import {serverLanguage, useStrings} from '../strings/StringsProvider';
import {
  cleanName,
  DetailsCard,
  LanguageField,
  nameWords,
  PayoutAccountCard,
  PayoutFields,
  usePayoutForm,
  VehicleFields,
  vehicleFields,
  type VehicleDraft,
} from './SignUpForms';

// One application, one decision (docs/riders/FLOWS.md). Anyone signed in applies in four steps; then ops checks everything
// at once, and the rider sees whose turn it is: still applying (their turn), sent (ops's turn) or fixes asked (theirs again).

type Doc = RiderProfile['documents'][number];

/** Step 1's name and age, held until step 2 sends the whole sign-up. */
interface AboutDraft {
  name: string;
  adult: boolean;
}

/** Android's back button goes to the previous step, but only while this screen is on top (SOS and the demo panel close first). */
function useStepBack(back?: () => void) {
  const navigation = useNavigation<RiderNav>();
  const latest = useRef(back);
  latest.current = back;
  const enabled = Boolean(back);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.isFocused() || !latest.current) {
        return false;
      }
      latest.current();
      return true;
    });
    return () => subscription.remove();
  }, [enabled, navigation]);
}

/**
 * A step of the application: the header and its 4-step bar, "Step N of 4" over the step's name, the step's buttons, and at
 * the end a way to call a person (a refused phone number or plate says to call support).
 */
function StepScreen({
  me,
  step,
  back,
  footer,
  children,
}: PropsWithChildren<{me: RiderMe; step: ApplyStep; back?: () => void; footer: ReactNode}>) {
  const {strings} = useStrings();
  const ap = strings.account.apply;
  const number = APPLY_STEPS.indexOf(step) + 1;
  const total = APPLY_STEPS.length;
  useStepBack(back);
  return (
    <RiderScreen
      header={
        <>
          <RiderHeader title={ap.header} inactive />
          <StepBar step={number} label={ap.stepLabel(number, total, ap.stepNames[step])} />
        </>
      }
      footer={footer}
      testID={`rider-apply-${step}`}>
      <View style={styles.intro}>
        <Text style={styles.small}>{ap.step(number, total)}</Text>
        <Title>{ap.stepNames[step]}</Title>
      </View>
      {children}
      <BottomAction
        label={strings.common.callSupport}
        variant="neutral"
        size="compact"
        leftIcon="phone-outline"
        onPress={() => Linking.openURL(`tel:${me.supportPhone}`).catch(() => undefined)}
        testID="rider-call-support"
      />
    </RiderScreen>
  );
}

/**
 * The step's one primary button and, under it, Back (or Sign out on the first step). A button that can't be pressed yet
 * says why just above it.
 */
function StepFooter({label, onNext, back, blockedBy}: {label: string; onNext(): unknown; back?: () => void; blockedBy?: string}) {
  const {strings} = useStrings();
  const shell = useRiderShell();
  return (
    <>
      {blockedBy ? <Text style={[styles.small, styles.center]}>{blockedBy}</Text> : null}
      <BottomAction
        label={label}
        onPress={async () => {
          await onNext();
        }}
        disabled={Boolean(blockedBy)}
        leftIcon={blockedBy ? 'lock-outline' : undefined}
        accessibilityHint={blockedBy}
        testID="rider-apply-next"
      />
      {back ? (
        <BottomAction label={strings.account.apply.back} variant="neutral" onPress={back} testID="rider-apply-back" />
      ) : (
        <BottomAction label={strings.account.signOut} variant="neutral" onPress={() => shell.signOut()} testID="rider-sign-out" />
      )}
    </>
  );
}

/** Off the steps (sent, fixes asked, loading): a way to reach a person, and out. */
function SupportFooter({me}: {me: RiderMe}) {
  const {strings} = useStrings();
  const shell = useRiderShell();
  return (
    <>
      <BottomAction
        label={strings.common.callSupport}
        variant="outline"
        leftIcon="phone-outline"
        onPress={() => Linking.openURL(`tel:${me.supportPhone}`).catch(() => undefined)}
        testID="rider-call-support"
      />
      <BottomAction label={strings.account.signOut} variant="neutral" onPress={() => shell.signOut()} testID="rider-sign-out" />
    </>
  );
}

function AboutStep({me, draft, payoutSent, onNext}: {me: RiderMe; draft: AboutDraft; payoutSent: boolean; onNext(draft: AboutDraft): void}) {
  const {strings} = useStrings();
  const ap = strings.account.apply;
  const [name, setName] = useState(draft.name);
  const [adult, setAdult] = useState(draft.adult);
  const [nameError, setNameError] = useState<string>();
  const [adultError, setAdultError] = useState<string>();
  const renamed = payoutSent && nameWords(name) !== nameWords(me.name);

  function next() {
    const fullName = cleanName(name);
    setNameError(fullName.length < 2 ? ap.nameMissing : undefined);
    setAdultError(adult ? undefined : ap.adultMissing);
    if (fullName.length >= 2 && adult) {
      onNext({name: fullName, adult});
    }
  }

  return (
    <StepScreen me={me} step="about" footer={<StepFooter label={ap.toVehicle} onNext={next} />}>
      <Text style={styles.body}>{ap.aboutBody}</Text>
      <Card style={styles.form}>
        <InputField
          label={ap.name}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          maxLength={120}
          error={nameError}
          testID="rider-join-name"
        />
        {renamed ? <Banner tone="warning" inset text={strings.account.details.resendPayout} testID="rider-join-resend-payout" /> : null}
        <LanguageField />
        {/* Someone who already applied confirmed their age then. */}
        {me.status === 'PENDING' ? null : (
          <CheckRow label={strings.account.join.adult} checked={adult} onChange={setAdult} testID="rider-join-adult" />
        )}
        {adultError ? <Banner tone="warning" inset text={adultError} testID="rider-apply-error" /> : null}
      </Card>
      <Banner tone="success" text={ap.free} testID="rider-apply-free" />
    </StepScreen>
  );
}

function VehicleStep({
  me,
  profile,
  about,
  onBack,
  onDone,
}: {
  me: RiderMe;
  profile?: RiderProfile;
  about: AboutDraft;
  onBack(): void;
  onDone(): void;
}) {
  const {strings, language} = useStrings();
  const ap = strings.account.apply;
  const queryClient = useQueryClient();
  const vehicle = profile?.vehicle;
  const [draft, setDraft] = useState<VehicleDraft>({kind: vehicle?.kind ?? 'PETROL', plate: '', model: vehicleModel(vehicle?.label) ?? ''});
  const [plateError, setPlateError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  // Someone correcting their application keeps the plate on file by leaving it empty.
  const keepPlate = me.status === 'PENDING' ? vehicle?.regNumberMasked : undefined;

  async function next() {
    const fields = vehicleFields(draft, Boolean(keepPlate));
    setPlateError(fields ? undefined : ap.plateMissing);
    if (!fields) {
      return;
    }
    setError(null);
    try {
      const signedUp = await riderApi.signUp({name: about.name, language: serverLanguage(language), ...fields, adult: about.adult});
      onDone();
      queryClient.setQueryData(riderKeys.me, signedUp);
      await queryClient.invalidateQueries({queryKey: riderKeys.profile});
    } catch (caught) {
      setError(riderMessage(caught, strings, language));
    }
  }

  const documents = requiredDocuments(draft.kind).map(type => ap.docNames[type] ?? type);
  return (
    <StepScreen me={me} step="vehicle" back={onBack} footer={<StepFooter label={ap.toDocuments} onNext={next} back={onBack} />}>
      <Card style={styles.form}>
        <VehicleFields draft={draft} onChange={setDraft} keepPlate={keepPlate} plateError={plateError} />
        {error ? <Banner tone="warning" inset text={error} testID="rider-apply-error" /> : null}
      </Card>
      <Text style={styles.secondary}>{ap.youllSend(documents.join(', '))}</Text>
    </StepScreen>
  );
}

/** How many of the photos are in, as a bar and in words. */
function SentBar({sent, total}: {sent: number; total: number}) {
  const ap = useStrings().strings.account.apply;
  return (
    <View accessible accessibilityLabel={ap.sentCount(sent, total)} style={styles.progress} testID="rider-apply-sent">
      <View style={styles.track}>
        <View style={[styles.fill, {transform: [{scaleX: total ? sent / total : 0}]}]} />
      </View>
      <Text style={styles.count}>{ap.sentCount(sent, total)}</Text>
    </View>
  );
}

/**
 * One document: its status, ops's reason when it was sent back, and the one thing to do with it. While applying, a photo
 * already sent can be changed; once the application is sent, ops is checking it, so there is nothing to do.
 */
function DocumentRow({doc, mode, divider, onSent}: {doc: Doc; mode: 'apply' | 'review' | 'fix'; divider?: boolean; onSent?(): void}) {
  const {strings, language} = useStrings();
  const a = strings.account;
  const ap = a.apply;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const type = doc.type ?? '';
  const name = ap.docNames[type] ?? doc.label;
  const sentBack = doc.status === 'REJECTED' || doc.status === 'EXPIRED';
  const badge =
    doc.status === 'PENDING' && mode === 'apply'
      ? ap.docSent
      : doc.status === 'VERIFIED' && type === 'BANK'
        ? a.nameMatches
        : a.docStatus[doc.status];
  const reason = sentBack ? (doc.reason ?? (doc.status === 'EXPIRED' ? a.expiredReason : undefined)) : undefined;
  const hint = doc.status === 'MISSING' || sentBack ? a.docHints[type] : undefined;
  const action =
    doc.status === 'MISSING' ? ap.addPhoto : sentBack ? ap.newPhoto : doc.status === 'PENDING' && mode === 'apply' ? ap.changePhoto : null;

  async function send() {
    setError(null);
    try {
      const uri = await chooseDocumentPhoto({
        title: name,
        take: ap.takePhoto,
        gallery: ap.fromGallery,
        cancel: strings.common.cancel,
        denied: a.cameraDenied,
        openSettings: a.openSettings,
      });
      if (!uri) {
        return;
      }
      await riderApi.uploadDocument(type, uri);
      onSent?.();
      await queryClient.invalidateQueries({queryKey: riderKeys.profile});
    } catch (caught) {
      setError(riderMessage(caught, strings, language));
    }
  }

  return (
    <View style={[styles.document, divider && styles.divider]} testID={`rider-document-${type}`}>
      <View style={styles.documentRow}>
        <Text style={[styles.strong, styles.flex]}>{name}</Text>
        <StatusBadge status={doc.status} label={badge} />
      </View>
      {reason ? <Text style={styles.body}>{reason}</Text> : null}
      {hint ? <Text style={styles.secondary}>{hint}</Text> : null}
      {error ? <Banner tone="warning" inset text={error} testID={`rider-upload-error-${type}`} /> : null}
      {action && type ? (
        <BottomAction
          label={action}
          variant={doc.status === 'PENDING' ? 'neutral' : 'outline'}
          size="compact"
          leftIcon={doc.status === 'PENDING' ? undefined : 'camera-outline'}
          accessibilityHint={name}
          onPress={send}
          // Changing a sent photo is the quiet option: a text button under the name, not a full-width one.
          style={doc.status === 'PENDING' ? styles.quietAction : undefined}
          testID={`rider-upload-${type}`}
        />
      ) : null}
    </View>
  );
}

function DocumentsStep({me, application, onBack, onNext}: {me: RiderMe; application: Application; onBack(): void; onNext(): void}) {
  const ap = useStrings().strings.account.apply;
  const total = application.documents.length;
  const ready = application.sent === total;
  return (
    <StepScreen
      me={me}
      step="documents"
      back={onBack}
      footer={<StepFooter label={ap.toPayout} onNext={onNext} back={onBack} blockedBy={ready ? undefined : ap.sendAll(total)} />}>
      <SentBar sent={application.sent} total={total} />
      <Banner tone="info" icon="camera-outline" title={ap.tipsTitle} text={ap.tips} />
      <Card style={styles.list}>
        {application.documents.map((doc, index) => (
          <DocumentRow key={doc.type ?? doc.label} doc={doc} mode="apply" divider={index > 0} />
        ))}
      </Card>
    </StepScreen>
  );
}

function PayoutStep({me, profile, onBack}: {me: RiderMe; profile: RiderProfile; onBack(): void}) {
  const ap = useStrings().strings.account.apply;
  const form = usePayoutForm(me.name);
  // Sending it completes the application: the screen then shows it as sent.
  return (
    <StepScreen me={me} step="payout" back={onBack} footer={<StepFooter label={ap.send} onNext={form.submit} back={onBack} />}>
      {profile.payoutAccountReturned ? <Banner tone="warning" text={ap.payoutAgain} testID="rider-payout-returned" /> : null}
      <Card style={styles.form}>
        <PayoutFields form={form} kycName={me.name} />
      </Card>
    </StepScreen>
  );
}

/** While ops checks: asks for notifications if they are off, so the decision can reach the phone with the app closed. */
function NotifyWhenDecided() {
  const ap = useStrings().strings.account.apply;
  const [allowed, setAllowed] = useState<boolean>();
  useEffect(() => {
    let live = true;
    riderDevice
      .notificationsGranted()
      .then(granted => live && setAllowed(granted))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (allowed !== false) {
    return null;
  }
  return (
    <Card style={styles.timeline}>
      <Text style={styles.secondary}>{ap.notifyBody}</Text>
      <BottomAction
        label={ap.notifyAction}
        variant="outline"
        size="compact"
        leftIcon="bell"
        onPress={async () => {
          // Refused for good, notifications can only be turned on in the app's settings (as phone setup does).
          const granted = await riderDevice.requestNotifications();
          if (!granted) {
            await riderDevice.openAppSettings();
          }
          setAllowed(granted);
        }}
        testID="rider-application-notify-on"
      />
    </Card>
  );
}

/** Everything is in: ops's turn. Nothing to do but wait; the answer arrives here on its own. */
function Sent({
  me,
  profile,
  application,
  again,
  onCheck,
}: {
  me: RiderMe;
  profile: RiderProfile;
  application: Application;
  again: boolean;
  /** Asks again; resolves with the error when a request failed. */
  onCheck(): Promise<unknown>;
}) {
  const {strings, language} = useStrings();
  const ap = strings.account.apply;
  // A press that finds no decision yet still says it looked, or why it couldn't (a decision moves the screen on by itself).
  const [checked, setChecked] = useState<{at: number; error: unknown}>();
  const check = async () => {
    const error = await onCheck();
    setChecked({at: Date.now(), error});
  };
  return (
    <RiderScreen
      header={<RiderHeader title={ap.statusHeader} inactive />}
      footer={<SupportFooter me={me} />}
      // The details and payout forms below keep the room while typing; the footer is only support.
      keyboardHidesFooter
      testID="rider-application-sent">
      <View style={styles.intro}>
        <Title>{ap.sentTitle}</Title>
        <Text style={styles.secondary}>{ap.sentBody}</Text>
      </View>
      {again ? <Banner tone="success" text={ap.sentAgain} testID="rider-application-sent-again" /> : null}
      <NotifyWhenDecided />
      <Card style={styles.timeline}>
        <Timeline
          items={[
            {title: ap.stepSent, state: 'done'},
            {title: ap.stepCheck, body: ap.stepCheckBody, state: 'current', testID: 'rider-application-checking'},
            {title: ap.stepApproved, body: ap.stepApprovedBody, state: 'todo'},
          ]}
        />
        <BottomAction label={ap.checkNow} variant="outline" size="compact" onPress={check} testID="rider-application-check" />
        {checked ? (
          <Text accessibilityLiveRegion="polite" style={styles.small} testID="rider-application-checked">
            {checked.error ? riderMessage(checked.error, strings, language) : ap.stillChecking(formatClock(checked.at))}
          </Text>
        ) : null}
      </Card>
      <Card style={styles.list}>
        <Text accessibilityRole="header" style={[styles.strong, styles.listTitle]}>
          {ap.whatYouSent}
        </Text>
        {application.documents.map(doc => (
          <DocumentRow key={doc.type ?? doc.label} doc={doc} mode="review" divider />
        ))}
      </Card>
      <DetailsCard me={me} profile={profile} />
      <PayoutAccountCard key={me.name} profile={profile} kycName={me.name} />
    </RiderScreen>
  );
}

/** Ops sent things back: only those, each with ops's reason and a way to send it again. */
function Fixes({
  me,
  profile,
  application,
  again,
  onFixed,
}: {
  me: RiderMe;
  profile: RiderProfile;
  application: Application;
  again: boolean;
  onFixed(): void;
}) {
  const ap = useStrings().strings.account.apply;
  const returned = application.payout === 'RETURNED';
  return (
    <RiderScreen
      header={<RiderHeader title={ap.statusHeader} inactive />}
      footer={<SupportFooter me={me} />}
      keyboardHidesFooter
      testID="rider-application-fixes">
      <View style={styles.intro}>
        <Title>{ap.fixTitle(application.toFix.length + (returned ? 1 : 0))}</Title>
        {/* Photos sent back mean ops checked the rest. Only the payout account (also after a new name): its card says why. */}
        {application.toFix.length ? <Text style={styles.secondary}>{ap.fixBody}</Text> : null}
      </View>
      {again ? <Banner tone="success" text={ap.fixedNote} testID="rider-application-fixed" /> : null}
      {application.toFix.length ? (
        <Card style={styles.list}>
          {application.toFix.map((doc, index) => (
            <DocumentRow key={doc.type ?? doc.label} doc={doc} mode="fix" divider={index > 0} onSent={onFixed} />
          ))}
        </Card>
      ) : null}
      {returned ? <PayoutAccountCard key={me.name} profile={profile} kycName={me.name} onSent={onFixed} /> : null}
    </RiderScreen>
  );
}

function Loading({me, profile}: {me: RiderMe; profile: UseQueryResult<RiderProfile>}) {
  const ap = useStrings().strings.account.apply;
  return (
    <RiderScreen header={<RiderHeader title={ap.statusHeader} inactive />} footer={<SupportFooter me={me} />} testID="rider-application-loading">
      {profile.isError ? (
        <ProblemCard error={profile.error} onRetry={() => profile.refetch()} testID="rider-documents-problem" />
      ) : (
        <CardsSkeleton cards={2} testID="rider-documents-loading" />
      )}
    </RiderScreen>
  );
}

/**
 * Someone signed in who isn't working yet: not signed up (NOT_RIDER) or applied and waiting (PENDING). The stage is worked
 * out from GET /profile the way the server and the ops console work it out (domain/application).
 */
export function ApplicationScreen({me}: {me: RiderMe}) {
  const queryClient = useQueryClient();
  const applied = me.status === 'PENDING';
  const profile = useProfile(applied);
  // Unset: where the application stands decides (resumeStep). Set when the rider moves between steps.
  const [step, setStep] = useState<ApplyStep | undefined>(applied ? undefined : 'about');
  const [about, setAbout] = useState<AboutDraft>({name: me.name, adult: applied});
  // The rider sent something ops asked for again: say it went.
  const [again, setAgain] = useState(false);
  const application = applied && profile.data ? applicationOf(profile.data) : undefined;
  // A new round of fixes starts without the note that the last ones went.
  const [seenStage, setSeenStage] = useState(application?.stage);
  if (application?.stage !== seenStage) {
    setSeenStage(application?.stage);
    if (application?.stage === 'FIX') {
      setAgain(false);
    }
  }
  // invalidateQueries resolves on a failed request too: the first error, if any, comes back for Check now to show.
  const recheck = async () => {
    const keys = [riderKeys.me, riderKeys.profile];
    await Promise.all(keys.map(queryKey => queryClient.invalidateQueries({queryKey})));
    return keys.map(queryKey => queryClient.getQueryState(queryKey)?.error).find(Boolean);
  };
  useRecheck(recheck, application?.stage === 'REVIEW');
  // The phone the rider applies on hears ops's decision as a push (P6-04); without it the app still checks every 15 s.
  useEffect(() => {
    if (applied && riderApiMode === 'live') {
      registerPhone().catch(() => undefined);
    }
  }, [applied]);

  const aboutStep = (
    <AboutStep
      me={me}
      draft={about}
      payoutSent={Boolean(profile.data?.payoutAccountSubmitted)}
      onNext={draft => {
        setAbout(draft);
        setStep('vehicle');
      }}
    />
  );
  const vehicleStep = (
    <VehicleStep me={me} profile={profile.data} about={about} onBack={() => setStep('about')} onDone={() => setStep('documents')} />
  );

  if (!applied) {
    // Just signed up: /me says PENDING in a moment, then the documents.
    return step === 'vehicle' ? vehicleStep : step === 'about' ? aboutStep : <Loading me={me} profile={profile} />;
  }
  if (!application || !profile.data) {
    return <Loading me={me} profile={profile} />;
  }
  if (application.stage === 'REVIEW') {
    return <Sent me={me} profile={profile.data} application={application} again={again} onCheck={recheck} />;
  }
  if (application.stage === 'FIX') {
    return <Fixes me={me} profile={profile.data} application={application} again={again} onFixed={() => setAgain(true)} />;
  }
  // Still applying. The payout step only while no account is in: with one in, it's the photos that are missing.
  const current = step === 'payout' && (application.payout === 'SENT' || application.payout === 'CONFIRMED') ? 'documents' : (step ?? resumeStep(application));
  switch (current) {
    case 'about':
      return aboutStep;
    case 'vehicle':
      return vehicleStep;
    case 'documents':
      return <DocumentsStep me={me} application={application} onBack={() => setStep('vehicle')} onNext={() => setStep('payout')} />;
    case 'payout':
      return <PayoutStep me={me} profile={profile.data} onBack={() => setStep('documents')} />;
  }
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  intro: {gap: spacing.xs},
  center: {textAlign: 'center'},
  form: {gap: spacing.sm},
  list: {gap: 0, paddingVertical: spacing.xxs},
  listTitle: {paddingTop: spacing.sm, paddingBottom: spacing.xs},
  quietAction: {alignSelf: 'flex-start', marginLeft: -spacing.xs},
  timeline: {gap: spacing.md},
  document: {gap: spacing.xs, paddingVertical: spacing.sm},
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  documentRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  progress: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  track: {flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.muted, overflow: 'hidden'},
  fill: {height: '100%', width: '100%', backgroundColor: colors.success, transformOrigin: 'left'},
  count: {fontSize: typography.small, fontWeight: fontWeight.bold, color: colors.textPrimary},
  small: {fontSize: typography.small, color: colors.textSecondary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  secondary: {fontSize: typography.body, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
