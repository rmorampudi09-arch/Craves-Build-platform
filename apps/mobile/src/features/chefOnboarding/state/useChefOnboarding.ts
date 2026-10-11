import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert} from 'react-native';
import {uuid} from 'expo-modules-core';
import {toAppApiError} from '../../../core/http/apiError';
import {
  chefBankOnboardingApi,
  type ChefBankStatus,
} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import {
  EMPTY_ONBOARDING,
  TERMS_VERSION_FALLBACK,
  UPLOAD_ERRORS,
  chefOnboardingApi,
  type CallbackRequest,
  type OnboardingDetails,
  type OnboardingState,
  type UploadFile,
} from '../api/chefOnboardingApi';
import {
  INCOMPLETE_MESSAGES,
  activeChefSections,
  afterSectionSave,
  bankCanContinue,
  correctionSections,
  entryScreen,
  firstIncompleteSection,
  listInWords,
  missingKitchenFields,
  validateChefSection,
  type ChefFieldError,
  type ChefFormScreen,
  type ChefFormSection,
} from '../domain/chefOnboardingFlow';

function errorText(failure: unknown, fallback: string): string {
  const error = toAppApiError(failure);
  if (UPLOAD_ERRORS[error.code]) return UPLOAD_ERRORS[error.code];
  if (error.status === 409)
    return error.message || 'Your saved application changed. Reload it before trying again.';
  if (error.code === 'UNKNOWN_ERROR' && failure instanceof Error && failure.message) return failure.message;
  return error.message || fallback;
}

/**
 * The website's chef application (use-chef-onboarding.ts) for the app: the same screens,
 * saves and rules. The phone has no URL steps or tab storage, so those parts are left out.
 */
export function useChefOnboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [details, setDetails] = useState<OnboardingDetails>({...EMPTY_ONBOARDING});
  const [screen, setScreen] = useState<ChefFormScreen>('personal');
  const [bank, setBank] = useState<ChefBankStatus | null>(null);
  const [bankUnavailable, setBankUnavailable] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ChefFieldError[]>([]);
  const [notice, setNotice] = useState('');
  const [fromReview, setFromReview] = useState(false);
  const [terms, setTerms] = useState(false);
  const [callback, setCallback] = useState<CallbackRequest | null>(null);
  const [fssaiGuide, setFssaiGuideState] = useState(false);
  const currentState = useRef(state);
  const currentDetails = useRef(details);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const helpKey = useRef<string | null>(null);
  // An open or contacted request blocks a duplicate; a resolved one lets the applicant ask again.
  const callbackCase = callback && callback.status !== 'RESOLVED' ? callback.caseNumber : '';
  const emailVerified = Boolean(
    verifiedEmail && details.email.trim() && verifiedEmail.trim().toLowerCase() === details.email.trim().toLowerCase(),
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function accept(next: OnboardingState, preserveDetails = false) {
    if (!mounted.current) return;
    currentState.current = next;
    setState(next);
    if (!preserveDetails) {
      const saved = next.details ?? {...EMPTY_ONBOARDING};
      currentDetails.current = saved;
      setDetails(saved);
      setDirty(false);
    }
  }

  const refreshBank = useCallback(async () => {
    try {
      const next = await chefBankOnboardingApi.getStatus();
      if (mounted.current) {
        setBank(next);
        setBankUnavailable(false);
      }
      return next;
    } catch {
      if (mounted.current) setBankUnavailable(true);
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await chefOnboardingApi.load();
      const nextBank = next.bankEnrollmentRequired ? await refreshBank() : null;
      if (!mounted.current) return;
      currentState.current = next;
      setState(next);
      setCallback(next.callbackRequest);
      setUnavailable(false);
      const saved = next.details ?? {...EMPTY_ONBOARDING};
      currentDetails.current = saved;
      setDetails(saved);
      setDirty(false);
      setFromReview(false);
      setFssaiGuideState(false);
      setFieldErrors([]);
      const destination = entryScreen(next);
      setScreen(destination);
      if (destination === 'resume' && firstIncompleteSection(next, nextBank) === 'review')
        setNotice('Your saved details are ready to review.');
    } catch (failure) {
      if (!mounted.current) return;
      // 404: this server has no step-by-step application, so the older form is used.
      if (toAppApiError(failure).status === 404) setUnavailable(true);
      else setError(errorText(failure, 'Your application is unavailable.'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [refreshBank]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  function changed(fixed: string[]) {
    setDirty(true);
    setError('');
    setNotice('');
    setFieldErrors(errors => errors.filter(item => !fixed.includes(item.field)));
  }
  function field<K extends keyof OnboardingDetails>(key: K, value: OnboardingDetails[K]) {
    updateDetails(previous => ({...previous, [key]: value}));
  }
  function updateDetails(update: (previous: OnboardingDetails) => OnboardingDetails) {
    // Clear the errors this change fixes: the pin feeds "location", first and last name "fullName".
    const before = currentDetails.current;
    const after = update(before);
    currentDetails.current = after;
    setDetails(after);
    changed(
      (Object.keys(after) as (keyof OnboardingDetails)[])
        .filter(key => after[key] !== before[key])
        .map(key =>
          key === 'latitude' || key === 'longitude'
            ? 'location'
            : key === 'firstName' || key === 'lastName'
              ? 'fullName'
              : key,
        ),
    );
  }
  const onEmailVerified = useCallback((email: string) => {
    setVerifiedEmail(email);
    if (!currentDetails.current.email.trim()) {
      const updated = {...currentDetails.current, email};
      currentDetails.current = updated;
      setDetails(updated);
      setDirty(true);
    }
  }, []);

  async function persist(partial = false): Promise<OnboardingState> {
    const existing = currentState.current;
    if (!existing) throw new Error('Sign in again to continue.');
    if (existing.submitted || existing.legacy)
      throw new Error('This application is already submitted. Check its status before making changes.');
    const next = await chefOnboardingApi.save(existing.version, currentDetails.current, partial);
    accept(next);
    return next;
  }
  async function work(action: () => Promise<void>) {
    if (inFlight.current || !mounted.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      if (mounted.current) setError(errorText(failure, 'This step could not be completed. Please retry.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  /** Shows a screen and clears transient messages from the previous one. */
  function go(next: ChefFormScreen) {
    setScreen(next);
    setFssaiGuideState(false);
    setFieldErrors([]);
    setError('');
    setNotice('');
  }
  function kitchenReadyForPhotos(): boolean {
    const missing = missingKitchenFields(currentDetails.current);
    if (!missing.length) return true;
    setFieldErrors(missing.map(({field: name, message}) => ({field: name, message})));
    return false;
  }
  async function saveSection(section: ChefFormSection) {
    const existing = currentState.current;
    if (!existing) return;
    const invalid = validateChefSection(section, currentDetails.current, existing, emailVerified);
    if (invalid.length) {
      setFieldErrors(invalid);
      return;
    }
    await work(async () => {
      const saved = await persist();
      go(afterSectionSave(section, fromReview, saved));
      setFromReview(false);
    });
  }
  /** Saves the FSSAI help view as a draft and lets the applicant finish the other sections. */
  async function continueWithoutFssai() {
    const value = currentDetails.current.fssaiNumber.trim();
    if (value && !/^[0-9]{14}$/.test(value)) {
      setFssaiGuideState(false);
      setFieldErrors([{
        field: 'fssaiNumber',
        message: 'Finish your 14-digit FSSAI number, or clear it to continue without one for now.',
      }]);
      return;
    }
    await work(async () => {
      const saved = await persist();
      go(afterSectionSave('fssai', fromReview, saved));
      setFromReview(false);
    });
  }
  function setFssaiGuide(visible: boolean) {
    setFssaiGuideState(visible);
    setFieldErrors([]);
    setError('');
    setNotice('');
  }
  /** The first section a reviewer flagged, otherwise the first incomplete one. */
  function nextCorrection(): ChefFormSection | 'review' {
    const saved = currentState.current;
    if (!saved) return 'personal';
    return correctionSections(saved)[0] ?? firstIncompleteSection(saved, bank);
  }
  function edit(section: ChefFormSection) {
    setFromReview(true);
    go(section);
  }
  function open(section: ChefFormSection | 'review') {
    setFromReview(false);
    go(section);
  }
  /** The applicant's home: the status page, never the customer screens. */
  function toHub() {
    go('status');
    setFromReview(false);
  }
  function leave() {
    if (!dirty) {
      toHub();
      return;
    }
    Alert.alert('Leave without saving?', 'Your latest changes are not saved yet.', [
      {text: 'Stay', style: 'cancel'},
      {text: 'Leave', style: 'destructive', onPress: () => load().catch(() => undefined).then(toHub)},
    ]);
  }
  /** Returns false when there is nowhere further back inside the application. */
  function back(): boolean {
    if (busy) return true;
    if (screen === 'status' || screen === 'submitted') return false;
    if (screen === 'fssai' && fssaiGuide) {
      setFssaiGuide(false);
      return true;
    }
    if (fromReview) {
      go('review');
      setFromReview(false);
      return true;
    }
    // Changes Craves asked for: Back walks only the flagged sections, then returns to the status page.
    const flagged = currentState.current ? correctionSections(currentState.current) : [];
    const correcting: ChefFormScreen[] = flagged.length ? [...flagged, 'review'] : [];
    if (correcting.includes(screen)) {
      const index = correcting.indexOf(screen);
      if (index > 0) go(correcting[index - 1]!);
      else leave();
      return true;
    }
    const sections = activeChefSections(currentState.current);
    const index = sections.indexOf(screen as ChefFormSection);
    if (index > 0) go(sections[index - 1]!);
    else if (screen === 'review') go(sections[sections.length - 1]!);
    else if (index === 0 && currentState.current?.details) go('resume');
    else if (screen === 'resume') toHub();
    else leave();
    return true;
  }
  function exit() {
    if (busy) return;
    if (screen === 'status' || screen === 'submitted' || !dirty) {
      toHub();
      return;
    }
    work(async () => {
      await persist(true);
      toHub();
    }).catch(() => undefined);
  }
  async function removeFile(id: string) {
    await work(async () => {
      const saved = currentState.current;
      if (!saved) throw new Error('Reload your saved application.');
      accept(await chefOnboardingApi.removeDocument(id, saved.version), true);
    });
  }
  /** Saves the typed details, uploads the file, then confirms it on the saved application. */
  async function uploadFile(type: string, file: UploadFile): Promise<void> {
    if (inFlight.current || !mounted.current) throw new Error('Wait for the current save to finish.');
    if (type.startsWith('KITCHEN_PHOTO') && !kitchenReadyForPhotos())
      throw new Error(
        `Add your ${listInWords(missingKitchenFields(currentDetails.current).map(item => item.noun))} first. Photos are saved with your kitchen address.`,
      );
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await persist();
      const uploadedId = await chefOnboardingApi.upload(type, file);
      const next = await chefOnboardingApi.load();
      // Confirm by id: the server renames files, so names never match.
      if (!next.documents.some(item => item.id === uploadedId && item.documentType === type && item.status !== 'REJECTED'))
        throw new Error('The upload could not be confirmed. Reload your application before retrying.');
      accept(next);
    } catch (failure) {
      throw new Error(errorText(failure, 'Upload failed. Please try again.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function requestCallback() {
    if (callbackCase) return;
    await work(async () => {
      const saved = await persist();
      helpKey.current ??= uuid.v4();
      const fssai = currentDetails.current.fssaiNumber;
      const caseNumber = await chefOnboardingApi.requestHelp(
        helpKey.current,
        [
          'Category: FSSAI application callback',
          'Request: Please call me on my verified mobile number to help me apply for FSSAI registration.',
          `Application: ${saved.application.id ?? 'Not created yet'} (${saved.application.status})`,
          'Onboarding stage: FSSAI details',
          `FSSAI status: ${/^[0-9]{14}$/.test(fssai) ? 'Number added' : 'No FSSAI number yet'}`,
          `Verified mobile: ${saved.phoneNumber || 'On file'}`,
          `Preferred language: ${currentDetails.current.language}`,
          'Sent from: Craves app',
        ].join('\n'),
      );
      if (mounted.current) setCallback({caseNumber, status: 'OPEN', requestedAt: new Date().toISOString()});
    });
  }
  function savedBank(next: ChefBankStatus) {
    if (!mounted.current) return;
    setBank(next);
    setBankUnavailable(false);
    if (bankCanContinue(next)) {
      go(afterSectionSave('bank', fromReview, currentState.current));
      setFromReview(false);
    }
  }
  function bankBusy(value: boolean) {
    inFlight.current = value;
    if (mounted.current) setBusy(value);
  }
  async function submit() {
    await work(async () => {
      if (!terms) throw new Error('Accept the terms before submitting your application.');
      const saved = await persist();
      const incomplete = firstIncompleteSection(saved, bank);
      if (incomplete !== 'review') {
        edit(incomplete);
        throw new Error(INCOMPLETE_MESSAGES[incomplete]);
      }
      const next = await chefOnboardingApi.submit(saved.version, saved.progress?.termsVersion ?? TERMS_VERSION_FALLBACK);
      if (
        !next.submitted ||
        !['PENDING', ...(saved.application.status === 'APPROVED' ? ['APPROVED'] : [])].includes(next.application.status) ||
        !next.application.id
      )
        throw new Error('Submission could not be confirmed. Check your application status before trying again.');
      accept(next);
      go('submitted');
    });
  }

  return {
    state,
    details,
    screen,
    bank,
    bankUnavailable,
    emailVerified,
    onEmailVerified,
    loading,
    unavailable,
    busy,
    dirty,
    error,
    fieldErrors,
    notice,
    fromReview,
    terms,
    setTerms,
    callback,
    callbackCase,
    fssaiGuide,
    setFssaiGuide,
    continueWithoutFssai,
    nextCorrection,
    open,
    go,
    load,
    refreshBank,
    field,
    updateDetails,
    saveSection,
    edit,
    back,
    exit,
    uploadFile,
    kitchenReadyForPhotos,
    removeFile,
    requestCallback,
    savedBank,
    bankBusy,
    submit,
  };
}
export type ChefOnboardingFlow = ReturnType<typeof useChefOnboarding>;
