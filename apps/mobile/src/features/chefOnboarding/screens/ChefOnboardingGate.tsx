import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as KitchenLocation from '../../customerAddresses/location/currentLocation';
import { useAppDispatch } from '../../../app/store/hooks';
import { AppApiError, toAppApiError } from '../../../core/http/apiError';
import { colors, spacing } from '../../../design/tokens';
import { AuthShell } from '../../auth/components/AuthShell';
import { AuthCard } from '../../auth/components/AuthCard';
import { InputField } from '../../auth/components/InputField';
import { PrimaryButton } from '../../auth/components/PrimaryButton';
import { completeLogout } from '../../auth/state/logoutCoordinator';
import {
  chefOnboardingApi,
  emptyDetails,
  languages,
  proofOptions,
  proofNeedsBack,
  requestId,
  type EmailState,
  type LearningContent,
  type OnboardingDetails,
  type OnboardingState,
} from '../api/chefOnboardingApi';

function Dropdown({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <PrimaryButton
        variant="outline"
        label={
          options.find(option => option[0] === value)?.[1] ?? 'Choose an option'
        }
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.title}>
              {label}
            </Text>
            <ScrollView>
              {options.map(([key, text]) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={text}
                  onPress={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  style={styles.option}
                >
                  <Text style={styles.text}>{text}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <PrimaryButton
              variant="outline"
              label="Close options"
              onPress={() => setOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
function EmailOtp({
  disabled,
  onVerified,
}: {
  disabled: boolean;
  onVerified: (email: string | null) => void;
}) {
  const [state, setState] = useState<EmailState | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = useRef<{
    action: 'challenges' | 'resend';
    body: Record<string, string>;
  } | null>(null);
  const active = useRef(true);
  const accept = useCallback(
    (next: EmailState) => {
      if (!active.current) {
        return;
      }
      setState(next);
      if (next.emailVerified && next.email) {
        setEmail(next.email);
        onVerified(next.email);
      } else {
        onVerified(null);
      }
    },
    [onVerified],
  );
  useEffect(() => {
    active.current = true;
    chefOnboardingApi
      .email()
      .then(accept)
      .catch(() => {
        if (active.current) {
          setError('Email verification is unavailable. Refresh and retry.');
        }
      });
    return () => {
      active.current = false;
    };
  }, [accept]);
  async function run(action: () => Promise<EmailState>) {
    if (busy || disabled) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      accept(await action());
    } catch (cause) {
      if (active.current) {
        setError(toAppApiError(cause).message);
      }
    } finally {
      if (active.current) {
        setBusy(false);
      }
    }
  }
  async function sendCode(resend = false) {
    if (!send.current) {
      send.current =
        resend && state?.pending
          ? {
              action: 'resend',
              body: {
                challengeId: state.pending.challengeId,
                requestId: requestId(),
              },
            }
          : {
              action: 'challenges',
              body: { email: email.trim(), requestId: requestId() },
            };
    }
    const attempt = send.current;
    const result = await chefOnboardingApi.email(attempt.action, attempt.body);
    send.current = null;
    return result;
  }
  return (
    <View style={styles.group}>
      <InputField
        label="Email address"
        value={email}
        keyboardType="email-address"
        autoCapitalize="none"
        disabled={disabled || busy}
        onChangeText={value => {
          setEmail(value);
          send.current = null;
          onVerified(
            value === state?.email && state.emailVerified ? value : null,
          );
        }}
      />
      {state?.emailVerified && email === state.email ? (
        <Text style={styles.text}>Email verified</Text>
      ) : (
        <>
          <PrimaryButton
            variant="outline"
            label={send.current ? 'Retry email request' : 'Send email OTP'}
            loading={busy}
            disabled={disabled}
            onPress={() => {
              run(() => sendCode()).catch(() => undefined);
            }}
          />
          {state?.pending ? (
            <>
              <Text style={styles.text}>
                Code sent to {state.pending.maskedEmail}
              </Text>
              <InputField
                label="Email OTP"
                value={code}
                keyboardType="number-pad"
                maxLength={6}
                disabled={busy || disabled}
                onChangeText={setCode}
              />
              <PrimaryButton
                label="Verify email OTP"
                loading={busy}
                disabled={disabled || !/^\d{6}$/.test(code)}
                onPress={() => {
                  run(() =>
                    chefOnboardingApi.email('verify', {
                      challengeId: state.pending!.challengeId,
                      code,
                    }),
                  ).catch(() => undefined);
                }}
              />
              <PrimaryButton
                variant="outline"
                label="Resend email OTP"
                disabled={
                  disabled ||
                  busy ||
                  Date.now() < Date.parse(state.pending.resendAvailableAt)
                }
                onPress={() => {
                  run(() => sendCode(true)).catch(() => undefined);
                }}
              />
            </>
          ) : null}
        </>
      )}
      <PrimaryButton
        variant="ghost"
        label="Refresh email verification"
        disabled={disabled || busy}
        onPress={() => {
          run(() => chefOnboardingApi.email()).catch(() => undefined);
        }}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const titles: Record<OnboardingState['resumeStep'], string> = {
  personal: 'Personal details',
  kitchen: 'Kitchen details',
  'kitchen-photos': 'Kitchen photos',
  fssai: 'FSSAI registration',
  documents: 'Your document',
  review: 'Review application',
  waiting: 'Application under review',
  legacy: 'Chef workspace',
};
function inputError(message: string) {
  return new AppApiError('ONBOARDING_INPUT_INVALID', message);
}
export function ChefOnboardingGate({ fallback }: { fallback: ReactNode }) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [details, setDetails] = useState<OnboardingDetails>({
    ...emptyDetails,
  });
  const [step, setStep] = useState<OnboardingState['resumeStep']>('personal');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [legacyUnavailable, setLegacyUnavailable] = useState(false);
  const [existing, setExisting] = useState(false);
  const [option, setOption] = useState<'licence' | 'learn' | 'help'>('licence');
  const [content, setContent] = useState<LearningContent[]>([]);
  const [contentError, setContentError] = useState('');
  const [help, setHelp] = useState('');
  const helpKey = useRef<string | null>(null);
  const accept = useCallback((next: OnboardingState) => {
    setState(next);
    setDetails(next.details ?? { ...emptyDetails });
    setStep(next.resumeStep);
    return next;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      accept(await chefOnboardingApi.mine());
      setLegacyUnavailable(false);
    } catch (cause) {
      const error = toAppApiError(cause);
      if (error.status === 404) {
        setLegacyUnavailable(true);
      } else {
        setMessage(error.message);
      }
    } finally {
      setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);
  useEffect(() => {
    if (step !== 'fssai' || !state?.enabled || state.legacy) {
      return;
    }
    let active = true;
    setContent([]);
    setContentError('');
    chefOnboardingApi
      .content(details.language)
      .then(result => {
        if (active) {
          setContent(result);
        }
      })
      .catch(() => {
        if (active) {
          setContentError(
            'Learning content is unavailable. You can still contact Craves.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [step, details.language, state?.enabled, state?.legacy]);
  const emailVerified = useCallback((email: string | null) => {
    setVerifiedEmail(email);
    if (email) {
      setDetails(current => ({ ...current, email }));
    }
  }, []);
  function field<K extends keyof OnboardingDetails>(
    key: K,
    value: OnboardingDetails[K],
  ) {
    setDetails(current => ({ ...current, [key]: value }));
    setMessage('');
  }
  async function work(action: () => Promise<unknown>) {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (cause) {
      setMessage(toAppApiError(cause).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!state) {
      throw inputError('Reload your Chef application.');
    }
    return accept(await chefOnboardingApi.save(state.version, details));
  }
  function input(
    key: keyof OnboardingDetails,
    label: string,
    numeric = false,
    maxLength = 255,
  ) {
    return (
      <InputField
        key={key}
        label={label}
        value={String(details[key] ?? '')}
        disabled={busy}
        maxLength={maxLength}
        keyboardType={numeric ? 'numeric' : 'default'}
        onChangeText={value => field(key, value as never)}
      />
    );
  }
  async function locateKitchen() {
    const permission =
      await KitchenLocation.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw inputError('Allow location access while you are at your kitchen.');
    }
    const position = await KitchenLocation.getCurrentPositionAsync({
      accuracy: KitchenLocation.Accuracy.High,
    });
    setDetails(current => ({
      ...current,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }));
    setMessage('Kitchen location selected. Check the address before saving.');
  }
  async function upload(type: string) {
    if (type === 'FSSAI_LICENSE') {
      await save();
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw inputError('Allow photo access to choose the document.');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    const asset = result.assets[0];
    const mime =
      asset.mimeType ??
      (/\.png$/i.test(asset.uri) ? 'image/png' : 'image/jpeg');
    if (
      !['image/jpeg', 'image/png'].includes(mime) ||
      (asset.fileSize && asset.fileSize > 10 * 1024 * 1024)
    ) {
      throw inputError('Choose a JPG or PNG image no larger than 10 MB.');
    }
    accept(
      await chefOnboardingApi.upload(type, {
        uri: asset.uri,
        type: mime,
        name:
          asset.fileName ??
          (mime === 'image/png' ? 'document.png' : 'document.jpg'),
      }),
    );
  }
  function file(type: string, label: string) {
    const item = state?.documents.find(
      document => document.documentType === type,
    );
    return (
      <View key={type} style={styles.group}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.text}>
          {item
            ? item.originalFileName + ' · ' + item.status
            : 'Choose a clear JPG or PNG image, up to 10 MB.'}
        </Text>
        {item?.reviewReason ? (
          <Text style={styles.error}>{item.reviewReason}</Text>
        ) : null}
        <PrimaryButton
          variant="outline"
          label={'Upload ' + label}
          disabled={busy || item?.status === 'APPROVED'}
          onPress={() => {
            work(() => upload(type)).catch(() => undefined);
          }}
        />
      </View>
    );
  }
  if (legacyUnavailable || (state && (!state.enabled || state.legacy))) {
    return <>{fallback}</>;
  }
  if (existing && state?.application.status === 'APPROVED') {
    return (
      <View style={styles.full}>
        <PrimaryButton
          variant="outline"
          label="Continue updated onboarding"
          onPress={() => setExisting(false)}
        />
        {fallback}
      </View>
    );
  }
  if (loading) {
    return (
      <AuthShell>
        <AuthCard>
          <Text style={styles.text}>Loading saved Chef application…</Text>
        </AuthCard>
      </AuthShell>
    );
  }
  if (!state) {
    return (
      <AuthShell>
        <AuthCard>
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
          <PrimaryButton
            label="Try again"
            onPress={() => {
              load().catch(() => undefined);
            }}
          />
        </AuthCard>
      </AuthShell>
    );
  }
  const proofLabel =
    proofOptions.find(proof => proof[0] === details.proofKind)?.[1] ??
    'Selected proof';
  return (
    <AuthShell>
      <AuthCard>
        <Text accessibilityRole="header" style={styles.title}>
          {titles[step]}
        </Text>
        <Text style={styles.text}>
          Your progress is saved with your Craves account.
        </Text>
        {state.application.status === 'APPROVED' ? (
          <>
            <Text style={styles.text}>
              Your existing Chef approval stays valid while you complete the
              added details.
            </Text>
            <PrimaryButton
              variant="outline"
              label="View existing Chef workspace"
              onPress={() => setExisting(true)}
            />
          </>
        ) : null}
        {state.application.rejectionReason ? (
          <Text style={styles.error}>{state.application.rejectionReason}</Text>
        ) : null}
        {step === 'personal' ? (
          <>
            {input('firstName', 'First name')}
            {input('lastName', 'Last name')}
            {input('dateOfBirth', 'Date of birth (YYYY-MM-DD)', false, 10)}
            <InputField
              label="Verified phone number"
              value={state.phoneNumber}
              editable={false}
            />
            <EmailOtp disabled={busy} onVerified={emailVerified} />
            <PrimaryButton
              label="Save and continue"
              loading={busy}
              disabled={!verifiedEmail}
              onPress={() => {
                work(save).catch(() => undefined);
              }}
            />
          </>
        ) : null}
        {step === 'kitchen' ? (
          <>
            {input('kitchenName', 'Kitchen name', false, 160)}
            {input('kitchenDescription', 'Kitchen description', false, 1000)}
            {input('addressLine1', 'House / building')}
            {input('addressLine2', 'Street / area')}
            {input('landmark', 'Landmark')}
            {input('city', 'City', false, 120)}
            {input('state', 'State', false, 120)}
            {input('postalCode', 'Pincode', true, 6)}
            <PrimaryButton
              variant="outline"
              label="Use my kitchen's current location"
              disabled={busy}
              onPress={() => {
                work(locateKitchen).catch(() => undefined);
              }}
            />
            <Text style={styles.text}>
              {details.latitude !== null && details.longitude !== null
                ? 'Kitchen location selected.'
                : 'Choose your location while you are at your kitchen.'}
            </Text>
            <PrimaryButton
              label="Save kitchen and continue"
              loading={busy}
              onPress={() => {
                work(async () => {
                  if (details.latitude === null || details.longitude === null) {
                    throw inputError(
                      'Choose your kitchen location before continuing.',
                    );
                  }
                  await save();
                }).catch(() => undefined);
              }}
            />
            <PrimaryButton
              variant="ghost"
              label="Back to personal details"
              disabled={busy}
              onPress={() => setStep('personal')}
            />
          </>
        ) : null}
        {step === 'kitchen-photos' ? (
          <>
            {file('KITCHEN_PHOTO_1', 'Kitchen photo 1')}
            {file('KITCHEN_PHOTO_2', 'Kitchen photo 2')}
            <PrimaryButton
              variant="ghost"
              label="Back to kitchen details"
              disabled={busy}
              onPress={() => setStep('kitchen')}
            />
          </>
        ) : null}
        {step === 'fssai' ? (
          <>
            <Text style={styles.text}>
              If you do not have FSSAI yet, learn how to apply or request help.
              Your next Chef entry returns here until this step is complete.
            </Text>
            <PrimaryButton
              variant={option === 'licence' ? 'primary' : 'outline'}
              label="I have FSSAI"
              disabled={busy}
              onPress={() => setOption('licence')}
            />
            <PrimaryButton
              variant={option === 'learn' ? 'primary' : 'outline'}
              label="Learn how to apply"
              disabled={busy}
              onPress={() => setOption('learn')}
            />
            <PrimaryButton
              variant={option === 'help' ? 'primary' : 'outline'}
              label="Get Craves help"
              disabled={busy}
              onPress={() => setOption('help')}
            />
            <Dropdown
              label="Preferred language"
              value={details.language}
              options={languages}
              disabled={busy}
              onChange={value =>
                field('language', value as OnboardingDetails['language'])
              }
            />
            {option === 'licence' ? (
              <>
                {input(
                  'fssaiNumber',
                  'FSSAI registration / licence number',
                  true,
                  14,
                )}
                {file('FSSAI_LICENSE', 'FSSAI document')}
                <PrimaryButton
                  label="Save and continue"
                  loading={busy}
                  onPress={() => {
                    work(async () => {
                      if (!/^\d{14}$/.test(details.fssaiNumber)) {
                        throw inputError(
                          'Enter the 14-digit FSSAI number to continue.',
                        );
                      }
                      if (
                        !state.documents.some(
                          document =>
                            document.documentType === 'FSSAI_LICENSE' &&
                            document.status !== 'REJECTED',
                        )
                      ) {
                        throw inputError(
                          'Upload the FSSAI document or save progress for later.',
                        );
                      }
                      await save();
                    }).catch(() => undefined);
                  }}
                />
              </>
            ) : null}
            {option === 'learn' ? (
              <>
                {contentError ? (
                  <Text style={styles.error}>{contentError}</Text>
                ) : null}
                {!contentError && content.length === 0 ? (
                  <Text style={styles.text}>
                    No articles or videos have been published in this language
                    yet. Choose another language or request Craves help.
                  </Text>
                ) : null}
                {content.map(item => (
                  <View key={item.id} style={styles.group}>
                    <Text style={styles.label}>{item.title}</Text>
                    {item.kind === 'ARTICLE' ? (
                      <Text style={styles.text}>{item.body}</Text>
                    ) : (
                      <PrimaryButton
                        variant="outline"
                        label={'Watch ' + item.title}
                        disabled={busy}
                        onPress={() => {
                          work(async () =>
                            Linking.openURL(
                              await chefOnboardingApi.playback(item.id),
                            ),
                          ).catch(() => undefined);
                        }}
                      />
                    )}
                  </View>
                ))}
              </>
            ) : null}
            <View style={styles.group}>
              <Text style={styles.label}>Craves support</Text>
              <PrimaryButton
                variant="ghost"
                label={state.supportPhone}
                onPress={() => {
                  work(() =>
                    Linking.openURL('tel:' + state.supportPhone),
                  ).catch(() => undefined);
                }}
              />
              <PrimaryButton
                variant="ghost"
                label={state.supportEmail}
                onPress={() => {
                  work(() =>
                    Linking.openURL('mailto:' + state.supportEmail),
                  ).catch(() => undefined);
                }}
              />
            </View>
            {option === 'help' ? (
              <>
                <Text style={styles.text}>
                  Your saved contact, kitchen details and language accompany
                  your request.
                </Text>
                <InputField
                  label="What help do you need?"
                  value={help}
                  multiline
                  maxLength={2000}
                  disabled={busy}
                  onChangeText={setHelp}
                />
                <PrimaryButton
                  label="Request help from Craves"
                  disabled={help.trim().length < 3}
                  loading={busy}
                  onPress={() => {
                    work(async () => {
                      await save();
                      helpKey.current ??= requestId();
                      const result = await chefOnboardingApi.help(
                        helpKey.current,
                        help,
                      );
                      setStep('fssai');
                      setMessage(
                        'Help request saved. Reference: ' + result.caseNumber,
                      );
                    }).catch(() => undefined);
                  }}
                />
              </>
            ) : null}
            <PrimaryButton
              variant="outline"
              label="Save progress for later"
              loading={busy}
              onPress={() => {
                work(async () => {
                  await save();
                  setStep('fssai');
                  setMessage(
                    'Progress saved. Continue from FSSAI on your next Chef entry.',
                  );
                }).catch(() => undefined);
              }}
            />
          </>
        ) : null}
        {step === 'documents' ? (
          <>
            <Dropdown
              label="Choose your document"
              value={details.proofKind ?? ''}
              options={proofOptions}
              disabled={
                busy ||
                state.documents.some(
                  document =>
                    document.documentType === 'SELECTED_PROOF_FRONT' ||
                    document.documentType === 'SELECTED_PROOF_BACK',
                )
              }
              onChange={value =>
                field('proofKind', value as OnboardingDetails['proofKind'])
              }
            />
            {details.proofKind === 'OTHER_GOVERNMENT_ID'
              ? input('otherGovernmentId', 'Government ID name', false, 80)
              : null}
            <Text style={styles.text}>
              PAN and bank statement need one file. Aadhaar and other government
              IDs need front and back.
            </Text>
            <PrimaryButton
              variant="outline"
              label="Save document choice"
              disabled={busy || !details.proofKind}
              onPress={() => {
                work(save).catch(() => undefined);
              }}
            />
            {details.proofKind &&
            state.details?.proofKind === details.proofKind ? (
              <>
                {file(
                  'SELECTED_PROOF_FRONT',
                  proofLabel +
                    (proofNeedsBack(details.proofKind) ? ' front' : ''),
                )}
                {proofNeedsBack(details.proofKind)
                  ? file('SELECTED_PROOF_BACK', proofLabel + ' back')
                  : null}
              </>
            ) : null}
          </>
        ) : null}
        {step === 'review' ? (
          <>
            <Text style={styles.text}>
              {details.firstName} {details.lastName} · {details.kitchenName}
            </Text>
            <Text style={styles.text}>
              {proofLabel} · Two kitchen photos · FSSAI document
            </Text>
            <PrimaryButton
              label="Submit for admin review"
              loading={busy}
              onPress={() => {
                work(async () =>
                  accept(await chefOnboardingApi.submit(state.version)),
                ).catch(() => undefined);
              }}
            />
          </>
        ) : null}
        {step === 'waiting' ? (
          <>
            <Text style={styles.text}>
              Craves is reviewing the required documents.
            </Text>
            <PrimaryButton
              label="Check status"
              disabled={busy}
              onPress={() => {
                load().catch(() => undefined);
              }}
            />
          </>
        ) : null}
        {message ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
        ) : null}
        <PrimaryButton
          variant="ghost"
          label="Sign out"
          disabled={busy}
          onPress={() => {
            completeLogout(dispatch).catch(() => undefined);
          }}
        />
      </AuthCard>
    </AuthShell>
  );
}
const styles = StyleSheet.create({
  full: { flex: 1 },
  group: { marginTop: spacing.md },
  label: { fontSize: 15, fontWeight: '700', color: colors.espressoBrown },
  title: { fontSize: 23, fontWeight: '700', color: colors.espressoBrown },
  text: { fontSize: 14, lineHeight: 22, color: colors.mutedText, marginTop: 8 },
  error: { fontSize: 14, lineHeight: 22, color: colors.error, marginTop: 12 },
  modal: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#0008',
  },
  modalCard: {
    maxHeight: '85%',
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 20,
  },
  option: { padding: 14, minHeight: 48 },
});
