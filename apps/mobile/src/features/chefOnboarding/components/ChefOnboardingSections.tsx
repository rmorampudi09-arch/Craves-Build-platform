import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {useVideoPlayer, VideoView} from 'expo-video';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, elevation, fontWeight, radius, spacing, touchTarget, typography, iconSize} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {
  customerAddressesApi,
  type CustomerLocationSuggestion,
} from '../../customerAddresses/api/customerAddressesApi';
import {EmailVerificationPanel} from '../../customerProfile/components/EmailVerificationPanel';
import {OlaMapPicker, type MapPoint} from '../../maps/OlaMapPicker';
import {
  PROOF_OPTIONS,
  chefOnboardingApi,
  proofNeedsBack,
  type LearningContent,
  type OnboardingDetails,
  type ProofKind,
} from '../api/chefOnboardingApi';
import {
  CHEF_SECTION_LABELS,
  adultCutoff,
  bankCanContinue,
  chefFullName,
  completedSections,
  evidenceComplete,
  formatDate,
  formatDateOfBirth,
  formatFssai,
  formatPhone,
  kitchenAddress,
  missingKitchenFields,
  type ChefFormSection,
} from '../domain/chefOnboardingFlow';
import type {ChefOnboardingFlow} from '../state/useChefOnboarding';
import {ChefOnboardingUpload, useSavedPreview} from './ChefOnboardingUpload';
import {DateOfBirthPicker, LanguagePicker} from './ChefPickers';
import {
  Card,
  CheckRow,
  Choice,
  FieldError,
  FieldShell,
  LinkButton,
  Note,
  Rows,
  StatusChip,
  onboardingStyles as ui,
} from './OnboardingUi';

type Props = {flow: ChefOnboardingFlow};

function fieldError(flow: ChefOnboardingFlow, name: string) {
  return flow.fieldErrors.find(item => item.field === name)?.message || null;
}

function Input({invalid, ...props}: TextInputProps & {invalid?: boolean}) {
  return (
    <TextInput
      placeholderTextColor={colors.placeholder}
      {...props}
      style={[ui.input, invalid && ui.inputError, props.style]}
    />
  );
}

function TextField({
  flow,
  name,
  label,
  maxLength = 255,
  optional,
  placeholder,
  helper,
  keyboardType,
  sanitize,
  autoCapitalize = 'words',
}: Props & {
  name: keyof OnboardingDetails;
  label: string;
  maxLength?: number;
  optional?: boolean;
  placeholder?: string;
  helper?: string;
  keyboardType?: TextInputProps['keyboardType'];
  sanitize?: (value: string) => string;
  autoCapitalize?: TextInputProps['autoCapitalize'];
}) {
  const error = fieldError(flow, name);
  return (
    <FieldShell error={error} helper={helper} label={label} optional={optional}>
      <Input
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        editable={!flow.busy}
        invalid={Boolean(error)}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={value => flow.field(name, (sanitize ? sanitize(value) : value) as never)}
        placeholder={placeholder}
        value={String(flow.details[name] ?? '')}
      />
    </FieldShell>
  );
}

function Upload({
  flow,
  type,
  label,
  photo,
  helper,
  emptyTitle,
  beforePick,
}: Props & {type: string; label: string; photo?: boolean; helper?: string; emptyTitle?: string; beforePick?: () => boolean}) {
  return (
    <ChefOnboardingUpload
      beforePick={beforePick}
      disabled={flow.busy}
      emptyTitle={emptyTitle}
      evidence={flow.state?.documents.find(document => document.documentType === type)}
      fieldError={fieldError(flow, type)}
      helper={helper}
      label={label}
      onRemove={flow.removeFile}
      onUpload={flow.uploadFile}
      photo={photo}
      type={type}
    />
  );
}

/* Basic details */

export function ChefBasicDetails({flow}: Props) {
  const [name, setName] = useState(() => chefFullName(flow.details));
  const nameError = fieldError(flow, 'fullName');
  const dobError = fieldError(flow, 'dateOfBirth');
  const emailError = fieldError(flow, 'email');
  return (
    <View style={ui.stack}>
      <Card icon="account" title="About you">
        <View style={ui.fields}>
          <FieldShell error={nameError} helper="Enter your name as it appears on your bank account." label="Full name">
            <Input
              accessibilityLabel="Full name"
              autoCapitalize="words"
              autoComplete="name"
              editable={!flow.busy}
              invalid={Boolean(nameError)}
              maxLength={120}
              onChangeText={value => {
                setName(value);
                const trimmed = value.trim();
                const split = trimmed.lastIndexOf(' ');
                flow.updateDetails(previous => ({
                  ...previous,
                  firstName: split > -1 ? trimmed.slice(0, split) : trimmed,
                  lastName: split > -1 ? trimmed.slice(split + 1) : '',
                }));
              }}
              placeholder="First and last name"
              value={name}
            />
          </FieldShell>
          <FieldShell error={dobError} helper="You must be at least 18 years old to apply." label="Date of birth">
            <DateOfBirthPicker
              disabled={flow.busy}
              invalid={Boolean(dobError)}
              max={adultCutoff()}
              onChange={value => flow.field('dateOfBirth', value)}
              value={flow.details.dateOfBirth}
            />
          </FieldShell>
        </View>
      </Card>
      <Card icon="shield" subtitle="We’ll use these for updates about your application." title="Contact details">
        <View style={ui.fields}>
          <FieldShell error={flow.state?.phoneNumber ? null : 'Sign in again to verify your mobile number.'} label="Mobile number">
            {flow.state?.phoneNumber ? (
              <View style={[ui.input, styles.locked]}>
                <Text style={[ui.body, styles.flex]}>{formatPhone(flow.state.phoneNumber)}</Text>
                <Verified />
              </View>
            ) : null}
          </FieldShell>
          <FieldShell error={emailError} helper="We’ll send a 6-digit code to verify your email." label="Email address">
            <Input
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!flow.busy}
              invalid={Boolean(emailError)}
              keyboardType="email-address"
              maxLength={255}
              onChangeText={value => flow.field('email', value.trim())}
              placeholder="you@example.com"
              value={flow.details.email}
            />
          </FieldShell>
          <EmailVerificationPanel disabled={flow.busy} email={flow.details.email} onVerified={flow.onEmailVerified} />
        </View>
      </Card>
    </View>
  );
}

function Verified({label = 'Verified'}: {label?: string}) {
  return (
    <View style={styles.verified}>
      <Icon color={colors.successText} name="check" size={iconSize.xs} surface={false} />
      <Text style={styles.verifiedText}>{label}</Text>
    </View>
  );
}

/* Your kitchen */

function KitchenPinModal({
  open,
  start,
  onClose,
  onConfirm,
}: {
  open: boolean;
  start: MapPoint;
  onClose: () => void;
  onConfirm: (point: MapPoint) => void;
}) {
  const insets = useSafeAreaInsets();
  const [point, setPoint] = useState(start);
  const {latitude, longitude} = start;
  useEffect(() => {
    if (open) setPoint({latitude, longitude});
  }, [open, latitude, longitude]);
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent visible={open}>
      <View style={styles.flex}>
        <OlaMapPicker
          accessibilityLabel="Kitchen map. Move the map to place the pin on your kitchen."
          fill
          latitude={point.latitude}
          longitude={point.longitude}
          onCenterChange={setPoint}
          pinHint="Your kitchen is here"
          style={styles.flex}
        />
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.mapBack, {top: insets.top + spacing.sm}]}>
          <Icon color={colors.textPrimary} name="arrow-left" size={iconSize.md} surface={false} />
        </Pressable>
        <View style={[styles.mapSheet, {paddingBottom: insets.bottom + spacing.md}]}>
          <Text style={ui.strong}>Move the map until the pin is on your kitchen</Text>
          <Button label="Confirm pin" onPress={() => onConfirm(point)} />
        </View>
      </View>
    </Modal>
  );
}

export function ChefKitchenDetails({flow}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerLocationSuggestion[]>([]);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [pinnedLabel, setPinnedLabel] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const d = flow.details;
  const hasPin = d.latitude != null && d.longitude != null;

  async function pin(latitude: number, longitude: number, label = '') {
    const request = ++generation.current;
    flow.updateDetails(previous => ({...previous, latitude, longitude}));
    setLocationError('');
    setPinnedLabel(label);
    setLocating(true);
    try {
      const address = await customerAddressesApi.reverseGeocode(latitude, longitude);
      if (!mounted.current || request !== generation.current) return;
      setPinnedLabel(address.formattedAddress);
      flow.updateDetails(previous => ({
        ...previous,
        addressLine1: address.houseNumber ?? previous.addressLine1,
        addressLine2: [address.street, address.area].filter(Boolean).join(', ') || previous.addressLine2,
        city: address.city ?? previous.city,
        state: address.state ?? previous.state,
        postalCode: address.postalCode && /^\d{6}$/.test(address.postalCode) ? address.postalCode : previous.postalCode,
      }));
    } catch {
      if (mounted.current && request === generation.current)
        setLocationError('Your pin is selected. We couldn’t fill in the address automatically, so please enter or correct it below.');
    } finally {
      if (mounted.current && request === generation.current) setLocating(false);
    }
  }
  async function locate() {
    const request = ++generation.current;
    setLocating(true);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        if (mounted.current)
          setLocationError(
            permission.canAskAgain
              ? 'Location access was not allowed. Search for your address instead.'
              : 'Location access is turned off. Allow it for Craves in phone settings, or search for your address.',
          );
        return;
      }
      const position = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.High});
      if (mounted.current && request === generation.current)
        await pin(position.coords.latitude, position.coords.longitude);
    } catch (failure) {
      const code = (failure as {code?: string} | null)?.code;
      if (mounted.current && request === generation.current)
        setLocationError(
          code === 'LOCATION_PROVIDER_DISABLED'
            ? 'Turn on phone location services and try again, or search for your address.'
            : 'We couldn’t find your location. Search for your address or try again.',
        );
    } finally {
      if (mounted.current && request === generation.current) setLocating(false);
    }
  }
  async function search() {
    if (query.trim().length < 3) {
      setLocationError('Enter at least 3 characters to search.');
      return;
    }
    const request = ++generation.current;
    setSearching(true);
    setLocationError('');
    setResults([]);
    try {
      const found = await customerAddressesApi.searchLocations(
        query.trim(),
        hasPin ? {latitude: d.latitude!, longitude: d.longitude!} : null,
      );
      if (!mounted.current || request !== generation.current) return;
      setResults(found);
      if (!found.length) setLocationError('No matching address found. Try a nearby landmark or area name.');
    } catch (failure) {
      if (mounted.current && request === generation.current)
        setLocationError(
          toAppApiError(failure).message ||
            'Address search is unavailable right now. Use your current location or enter the address below.',
        );
    } finally {
      if (mounted.current && request === generation.current) setSearching(false);
    }
  }

  const state = flow.state;
  const photosDone = Boolean(state && evidenceComplete(state, 'KITCHEN_PHOTO_1') && evidenceComplete(state, 'KITCHEN_PHOTO_2'));
  const addressDone = Boolean(hasPin && d.addressLine1 && d.city && d.state && /^\d{6}$/.test(d.postalCode));
  const missing = missingKitchenFields(d);
  const locationFieldError = fieldError(flow, 'location');
  const stopLookups = () => {
    generation.current++;
    setLocating(false);
    setSearching(false);
  };

  return (
    <View style={ui.stack}>
      <Card done={Boolean(d.kitchenName.trim())} icon="store" title="Kitchen information">
        <View style={ui.fields}>
          <TextField flow={flow} label="Kitchen name" maxLength={160} name="kitchenName" placeholder="For example, Ananya’s Kitchen" />
          <FieldShell after={<Text style={[ui.muted, styles.counter]}>{d.kitchenDescription.length}/1000</Text>} label="About your kitchen" optional>
            <Input
              accessibilityLabel="About your kitchen"
              editable={!flow.busy}
              maxLength={1000}
              multiline
              onChangeText={value => flow.field('kitchenDescription', value)}
              placeholder="A line about the food you love to cook"
              style={styles.textarea}
              textAlignVertical="top"
              value={d.kitchenDescription}
            />
          </FieldShell>
        </View>
      </Card>

      <Card done={addressDone} icon="location" subtitle="Find your kitchen, then check the pin." title="Kitchen address">
        <View style={ui.fields}>
          {hasPin ? (
            <View style={styles.mapPreview}>
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <OlaMapPicker
                  accessibilityLabel="Map preview of your kitchen pin"
                  disabled
                  fill
                  latitude={d.latitude!}
                  longitude={d.longitude!}
                  onCenterChange={() => undefined}
                  style={StyleSheet.absoluteFill}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={flow.busy}
                onPress={() => setAdjusting(true)}
                style={styles.adjustPin}>
                <Icon color={colors.flameRedAccessible} name="edit" size={iconSize.xs} surface={false} />
                <Text style={styles.adjustPinText}>Adjust pin</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.mapEmpty}>
              <Icon color={colors.flameRedAccessible} name="location" size={iconSize.xl} />
              <Text style={ui.strong}>Your kitchen pin will appear here</Text>
              <Text style={[ui.muted, styles.center]}>Search for your address or use your current location.</Text>
            </View>
          )}

          <FieldShell label="Search location" optional>
            <View style={[ui.input, styles.searchRow]}>
              <Icon color={colors.textSecondary} name="search" size={iconSize.md} surface={false} />
              <TextInput
                accessibilityLabel="Search location"
                editable={!flow.busy}
                maxLength={200}
                onChangeText={value => {
                  stopLookups();
                  setQuery(value);
                  setResults([]);
                }}
                onSubmitEditing={() => search()}
                placeholder="Building, street or area"
                placeholderTextColor={colors.placeholder}
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />
              <Pressable accessibilityLabel="Search address" accessibilityRole="button" disabled={flow.busy || searching} hitSlop={spacing.xs} onPress={() => search()}>
                {searching ? <ActivityIndicator color={colors.flameRedAccessible} /> : <Icon color={colors.flameRedAccessible} name="search" size={iconSize.md} surface={false} />}
              </Pressable>
            </View>
            {searching ? <Text style={ui.muted}>Searching addresses…</Text> : null}
            {results.map((result, index) => (
              <Pressable
                accessibilityRole="button"
                key={result.id ?? `${result.latitude},${result.longitude},${index}`}
                onPress={() => {
                  const label = [result.title, result.subtitle].filter(Boolean).join(', ');
                  setResults([]);
                  setQuery(label);
                  pin(result.latitude, result.longitude, label).catch(() => undefined);
                }}
                style={styles.result}>
                <Icon color={colors.textSecondary} name="location-outline" size={iconSize.xs} surface={false} />
                <View style={styles.flex}>
                  <Text style={ui.body}>{result.title}</Text>
                  {result.subtitle ? <Text style={ui.muted}>{result.subtitle}</Text> : null}
                </View>
              </Pressable>
            ))}
          </FieldShell>

          <Button
            disabled={flow.busy || locating}
            label={locating ? 'Finding your location…' : 'Use my current location'}
            leftIcon="gps"
            loading={locating}
            onPress={() => locate()}
            variant="outline"
          />
          {locationError || locationFieldError ? <FieldError>{locationError || locationFieldError}</FieldError> : null}
          {hasPin ? (
            <View accessibilityLiveRegion="polite" style={styles.pinned}>
              <Icon color={colors.flameRedAccessible} name="location" size={iconSize.sm} surface={false} />
              <View style={styles.flex}>
                <Text style={ui.body}>{pinnedLabel || kitchenAddress(d) || 'Pin placed on the map'}</Text>
                <Text style={ui.muted}>Adjust the pin if it isn’t exactly on your kitchen.</Text>
              </View>
            </View>
          ) : null}

          <View style={ui.divider} />
          <TextField flow={flow} label="Flat / house number / building" name="addressLine1" />
          <TextField flow={flow} label="Street / area" name="addressLine2" optional />
          <TextField flow={flow} label="Landmark" name="landmark" optional placeholder="For example, near the metro station" />
          <View style={styles.pair}>
            <View style={styles.flex}>
              <TextField
                flow={flow}
                keyboardType="number-pad"
                label="PIN code"
                maxLength={6}
                name="postalCode"
                sanitize={value => value.replace(/\D/g, '').slice(0, 6)}
              />
            </View>
            <View style={styles.flex}>
              <TextField flow={flow} label="City" maxLength={80} name="city" />
            </View>
          </View>
          <TextField flow={flow} label="State" maxLength={80} name="state" />
        </View>
      </Card>

      <Card done={photosDone} icon="camera" subtitle="Two clear photos of where you cook. Customers see them on your kitchen page." title="Kitchen photos">
        <View style={ui.fields}>
          {missing.length && !photosDone ? (
            <View style={styles.requires}>
              <Text style={ui.strong}>Finish your kitchen address to add photos</Text>
              <Text style={ui.muted}>Photos are saved with your address. Still needed:</Text>
              <View style={styles.requiresList}>
                {missing.map(item => (
                  <View key={item.field} style={styles.requiresChip}>
                    <Text style={styles.requiresChipText}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          <Upload
            beforePick={flow.kitchenReadyForPhotos}
            flow={flow}
            helper="Show the full kitchen space where you prepare food."
            label="Overall kitchen photo"
            photo
            type="KITCHEN_PHOTO_1"
          />
          <Upload
            beforePick={flow.kitchenReadyForPhotos}
            flow={flow}
            helper="Show your stove and the cooking equipment you use."
            label="Cooking setup photo"
            photo
            type="KITCHEN_PHOTO_2"
          />
          <Text style={ui.muted}>JPG or PNG · up to 10 MB each</Text>
        </View>
      </Card>

      {hasPin ? (
        <KitchenPinModal
          onClose={() => setAdjusting(false)}
          onConfirm={point => {
            setAdjusting(false);
            stopLookups();
            pin(point.latitude, point.longitude).catch(() => undefined);
          }}
          open={adjusting}
          start={{latitude: d.latitude!, longitude: d.longitude!}}
        />
      ) : null}
    </View>
  );
}

/* FSSAI */

const FOSCOS_URL = 'https://foscos.fssai.gov.in/';

export function ChefFssaiDetails({flow}: Props) {
  if (flow.fssaiGuide) return <FssaiGuide flow={flow} />;
  const value = flow.details.fssaiNumber;
  const error = fieldError(flow, 'fssaiNumber');
  const reviewed = Boolean(flow.state?.progress?.fssaiVerified && flow.state.details?.fssaiNumber === value);
  return (
    <Card>
      <FieldShell
        after={<LinkButton disabled={flow.busy} label="Don’t have FSSAI?" onPress={() => flow.setFssaiGuide(true)} />}
        error={error}
        helper="The 14-digit number on your FSSAI registration or licence."
        label="FSSAI registration number">
        <View style={[ui.input, error && ui.inputError, styles.searchRow]}>
          <TextInput
            accessibilityLabel="FSSAI registration number"
            editable={!flow.busy}
            keyboardType="number-pad"
            maxLength={14}
            onChangeText={next => flow.field('fssaiNumber', next.replace(/\D/g, '').slice(0, 14))}
            placeholder="14-digit number"
            placeholderTextColor={colors.placeholder}
            style={[styles.searchInput, ui.mono]}
            value={value}
          />
          {reviewed ? (
            <Verified label="Verified by Craves" />
          ) : /^\d{14}$/.test(value) ? (
            <Verified label="14/14" />
          ) : value ? (
            <Text style={[ui.muted, ui.mono]}>{value.length}/14</Text>
          ) : null}
        </View>
      </FieldShell>
    </Card>
  );
}

const GUIDE_STEPS: [string, string][] = [
  ['Visit the official FSSAI FoSCoS portal', 'Open the official registration and licensing website, foscos.fssai.gov.in.'],
  ['Choose the registration or licence for your business', 'Use the portal’s eligibility guidance to pick the right option.'],
  ['Enter your details', 'Complete the required personal and food business information.'],
  ['Upload documents and submit', 'Provide the requested documents and pay the applicable fee shown on the portal.'],
  ['Track your application', 'Use your acknowledgement or reference number to follow the status on FoSCoS.'],
];

function GuideVideo({url, title, onError}: {url: string; title: string; onError: () => void}) {
  const player = useVideoPlayer(url, instance => instance.play());
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({status}) => {
      if (status === 'error') onError();
    });
    return () => subscription.remove();
  }, [player, onError]);
  return <VideoView accessibilityLabel={title} nativeControls player={player} style={styles.video} />;
}

function FssaiGuide({flow}: Props) {
  const [content, setContent] = useState<LearningContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [videoError, setVideoError] = useState('');
  const language = flow.details.language;
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    setContent([]);
    setPlayback({});
    setVideoError('');
    chefOnboardingApi
      .content(language)
      .then(items => {
        if (!live) return;
        const own = items.filter(item => item.language === language);
        // The service sends English only when nothing is published in the chosen language.
        setContent(own.length || language === 'en' ? own : items.filter(item => item.language === 'en'));
      })
      .catch(failure => live && setError(toAppApiError(failure).message || 'The video guide is unavailable right now.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [language, attempt]);

  async function play(item: LearningContent) {
    setOpening(item.id);
    setVideoError('');
    try {
      const url = await chefOnboardingApi.playback(item.id);
      setPlayback(previous => ({...previous, [item.id]: url}));
    } catch (failure) {
      setVideoError(failure instanceof Error && failure.message ? failure.message : 'The video could not be opened.');
    } finally {
      setOpening(null);
    }
  }
  const videos = content.filter(item => item.kind === 'VIDEO');
  const articles = content.filter(item => item.kind === 'ARTICLE');
  return (
    <View style={ui.stack}>
      <Card>
        <View style={ui.fields}>
          {GUIDE_STEPS.map(([title, body], index) => (
            <View key={title} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={ui.strong}>{title}</Text>
                <Text style={ui.muted}>{body}</Text>
                {index === 0 ? <LinkButton icon="chevron-right" label="Open foscos.fssai.gov.in" onPress={() => Linking.openURL(FOSCOS_URL)} /> : null}
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Card icon="play" title="Watch how to apply">
        <View style={ui.fields}>
          <FieldShell label="Video language" optional>
            <LanguagePicker disabled={flow.busy} onChange={next => flow.field('language', next)} value={language} />
          </FieldShell>
          {loading ? (
            <View accessibilityLabel="Loading video guide" style={[styles.video, styles.videoEmpty]}>
              <ActivityIndicator color={colors.flameRedAccessible} />
            </View>
          ) : error ? (
            <View style={styles.videoEmptyBox}>
              <Text style={ui.muted}>{error}</Text>
              <LinkButton label="Try again" onPress={() => setAttempt(value => value + 1)} />
            </View>
          ) : !videos.length && !articles.length ? (
            <View style={styles.videoEmptyBox}>
              <Icon color={colors.textSecondary} name="play" size={28} surface={false} />
              <Text style={[ui.muted, styles.center]}>The video guide is coming soon. Follow the steps above, or ask us to call you.</Text>
            </View>
          ) : (
            <>
              {videos.map(item => (
                <View key={item.id} style={styles.gapXs}>
                  {playback[item.id] ? (
                    <GuideVideo
                      onError={() => setVideoError('Video access expired or playback failed. Play it again to retry.')}
                      title={item.title}
                      url={playback[item.id]!}
                    />
                  ) : (
                    <Pressable
                      accessibilityLabel={`Watch video: ${item.title}`}
                      accessibilityRole="button"
                      disabled={opening !== null}
                      onPress={() => play(item)}
                      style={[styles.video, styles.poster]}>
                      <View style={styles.playButton}>
                        {opening === item.id ? <ActivityIndicator color={colors.white} /> : <Icon color={colors.white} name="play" size={26} surface={false} />}
                      </View>
                      <Text style={styles.posterTitle}>{item.title}</Text>
                    </Pressable>
                  )}
                  {item.language === 'en' && language !== 'en' ? <Text style={ui.muted}>In English</Text> : null}
                  {playback[item.id] ? (
                    <LinkButton
                      label="Reload video"
                      onPress={() => {
                        setPlayback(previous => {
                          const next = {...previous};
                          delete next[item.id];
                          return next;
                        });
                        play(item).catch(() => undefined);
                      }}
                    />
                  ) : null}
                </View>
              ))}
              {videoError ? <FieldError>{videoError}</FieldError> : null}
              {articles.map(item => (
                <View key={item.id} style={styles.gapXs}>
                  <Text style={ui.strong}>{item.title}</Text>
                  <Text style={ui.muted}>{item.body}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </Card>

      <Card icon="headset" subtitle="Our team can guide you through the application process." title="Need help with FSSAI?">
        {flow.callbackCase ? (
          <View accessibilityLiveRegion="polite" style={styles.success}>
            <Icon color={colors.successText} name="check" size={iconSize.md} surface={false} />
            <View style={styles.flex}>
              <Text style={ui.strong}>{flow.callback?.status === 'CONTACTED' ? 'Our team contacted you' : 'Request received'}</Text>
              <Text style={ui.muted}>
                {flow.callback?.status === 'CONTACTED'
                  ? 'Our Craves team has spoken to you about your FSSAI application. We’ll follow up if anything else is needed.'
                  : 'Our Craves team will call you on your registered mobile number to help with your FSSAI application.'}
              </Text>
              <Text style={ui.muted}>
                Reference {flow.callbackCase}
                {flow.callback?.requestedAt ? ` · Requested ${formatDate(flow.callback.requestedAt)}` : ''}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.gapXs}>
            {flow.callback?.status === 'RESOLVED' ? (
              <Text style={ui.muted}>Your last request ({flow.callback.caseNumber}) is resolved. Ask again if you still need help.</Text>
            ) : null}
            <Button disabled={flow.busy} label="Request a call from Craves" leftIcon="phone" onPress={() => flow.requestCallback()} variant="outline" />
          </View>
        )}
      </Card>

      <Note tone="neutral">You can finish the other sections now. Add your FSSAI number before you submit your application.</Note>
      <LinkButton center disabled={flow.busy} label="I have an FSSAI number" onPress={() => flow.setFssaiGuide(false)} />
    </View>
  );
}

/* Identity */

const PROOF_SHORT: Record<ProofKind, string> = Object.fromEntries(PROOF_OPTIONS) as Record<ProofKind, string>;

export function ChefIdentityDetails({flow}: Props) {
  const proof = flow.details.proofKind;
  const locked = Boolean(flow.state?.documents.some(document => document.documentType.startsWith('SELECTED_PROOF_')));
  const twoSided = proofNeedsBack(proof, flow.details.proofHasBack);
  const proofError = fieldError(flow, 'proofKind');
  const done = Boolean(
    proof &&
      flow.state &&
      evidenceComplete(flow.state, 'SELECTED_PROOF_FRONT') &&
      (!twoSided || evidenceComplete(flow.state, 'SELECTED_PROOF_BACK')),
  );
  return (
    <View style={ui.stack}>
      <Card icon="id-card" title="Document type">
        <View style={ui.fields}>
          <View accessibilityRole="radiogroup" style={styles.choices}>
            {PROOF_OPTIONS.map(([key, label]) => {
              const selected = proof === key;
              return (
                <Choice
                  disabled={flow.busy || (locked && !selected)}
                  key={key}
                  label={label}
                  onPress={() => {
                    flow.field('proofKind', key);
                    if (key !== 'OTHER_GOVERNMENT_ID') flow.field('proofHasBack', null);
                  }}
                  selected={selected}
                />
              );
            })}
          </View>
          {proofError ? (
            <FieldError>{proofError}</FieldError>
          ) : (
            <Text style={ui.muted}>
              {locked ? 'To choose a different document, remove the uploaded files first.' : 'Choose one valid document that shows your name.'}
            </Text>
          )}
          {proof === 'OTHER_GOVERNMENT_ID' ? (
            <>
              <TextField flow={flow} label="Name of the ID" maxLength={80} name="otherGovernmentId" placeholder="For example, Voter ID, Driving Licence or Passport" />
              <CheckRow
                checked={flow.details.proofHasBack === false}
                disabled={flow.busy}
                onChange={checked => flow.field('proofHasBack', checked ? false : null)}>
                This document has no back side
              </CheckRow>
            </>
          ) : null}
        </View>
      </Card>
      {proof ? (
        <Card
          done={done}
          icon="document"
          subtitle={twoSided ? 'Upload the front and the back.' : 'Upload one clear photo.'}
          title={PROOF_SHORT[proof]}>
          <View style={ui.fields}>
            <Upload emptyTitle={twoSided ? 'Add front side' : 'Add document'} flow={flow} label={twoSided ? 'Front side' : PROOF_SHORT[proof]} type="SELECTED_PROOF_FRONT" />
            {twoSided ? <Upload emptyTitle="Add back side" flow={flow} label="Back side" type="SELECTED_PROOF_BACK" /> : null}
            <Text style={ui.muted}>JPG or PNG · up to 10 MB each</Text>
          </View>
        </Card>
      ) : null}
      {proof ? <Note>Make sure all four corners are visible, the text is readable and there is no glare.</Note> : null}
    </View>
  );
}

/* Review */

function ReviewCard({
  flow,
  section,
  complete,
  icon,
  children,
}: Props & {section: ChefFormSection; complete: boolean; icon: React.ComponentProps<typeof Card>['icon']; children: React.ReactNode}) {
  return (
    <Card icon={icon} title={CHEF_SECTION_LABELS[section]}>
      <View style={styles.reviewMeta}>
        {complete ? <StatusChip tone="complete">Complete</StatusChip> : <StatusChip tone="attention">Needs attention</StatusChip>}
        <LinkButton disabled={flow.busy} icon="edit" label="Edit" onPress={() => flow.edit(section)} />
      </View>
      {children}
    </Card>
  );
}

function ReviewPhoto({flow, type, label}: Props & {type: string; label: string}) {
  const evidence = flow.state?.documents.find(document => document.documentType === type && document.status !== 'REJECTED');
  const preview = useSavedPreview(evidence);
  return (
    <View style={styles.reviewPhoto}>
      <View style={styles.reviewThumb}>
        {preview ? (
          <Image accessibilityLabel={label} source={{uri: preview}} style={styles.fill} />
        ) : (
          <Icon color={evidence ? colors.successText : colors.textSecondary} name={evidence ? 'check' : 'camera'} size={iconSize.sm} surface={false} />
        )}
      </View>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}

export function ChefReviewDetails({flow}: Props) {
  const d = flow.details;
  const saved = flow.state;
  if (!saved) return null;
  const completion = completedSections(saved, flow.bank);
  const uploaded = (type: string) => (evidenceComplete(saved, type) ? 'Uploaded' : '');
  const fssaiAdded = /^\d{14}$/.test(d.fssaiNumber);
  const fssaiReviewed = Boolean(saved.progress?.fssaiVerified && saved.details?.fssaiNumber === d.fssaiNumber);
  const bankSaved = bankCanContinue(flow.bank);
  return (
    <View style={ui.stack}>
      <ReviewCard complete={completion.personal} flow={flow} icon="account" section="personal">
        <Rows
          rows={[
            ['Full name', chefFullName(d)],
            ['Date of birth', d.dateOfBirth ? formatDateOfBirth(d.dateOfBirth) : ''],
            ['Mobile', saved.phoneNumber ? formatPhone(saved.phoneNumber) : ''],
            ['Email', d.email],
          ]}
        />
      </ReviewCard>
      <ReviewCard complete={completion.kitchen} flow={flow} icon="store" section="kitchen">
        <Rows
          rows={[
            ['Kitchen name', d.kitchenName],
            ['Address', kitchenAddress(d)],
            ['Location', d.latitude != null && d.longitude != null ? 'Pinned on map' : ''],
          ]}
        />
        <View style={styles.reviewPhotos}>
          <ReviewPhoto flow={flow} label="Overall kitchen" type="KITCHEN_PHOTO_1" />
          <ReviewPhoto flow={flow} label="Cooking setup" type="KITCHEN_PHOTO_2" />
        </View>
      </ReviewCard>
      <ReviewCard complete={completion.fssai} flow={flow} icon="shield" section="fssai">
        <Rows
          rows={[
            ['Status', fssaiReviewed ? 'Verified by Craves' : fssaiAdded ? 'Number added' : 'Not added yet'],
            ['Registration number', fssaiAdded ? formatFssai(d.fssaiNumber) : ''],
          ]}
        />
      </ReviewCard>
      <ReviewCard complete={completion.documents} flow={flow} icon="id-card" section="documents">
        <Rows
          rows={[
            [
              'Document type',
              d.proofKind
                ? d.proofKind === 'OTHER_GOVERNMENT_ID' && d.otherGovernmentId
                  ? d.otherGovernmentId
                  : PROOF_SHORT[d.proofKind]
                : '',
            ],
            ...((proofNeedsBack(d.proofKind, d.proofHasBack)
              ? [
                  ['Front side', uploaded('SELECTED_PROOF_FRONT')],
                  ['Back side', uploaded('SELECTED_PROOF_BACK')],
                ]
              : [['Document', uploaded('SELECTED_PROOF_FRONT')]]) as [string, string][]),
          ]}
        />
      </ReviewCard>
      {saved.bankEnrollmentRequired === false ? (
        <Card icon="bank" title="Bank details">
          <View style={styles.gapXs}>
            {bankSaved ? <StatusChip tone="complete">Saved</StatusChip> : <StatusChip tone="idle">Add later</StatusChip>}
            <Text style={ui.muted}>
              {bankSaved
                ? `Account ending ${flow.bank?.lastFour ?? ''} is saved. ${flow.bank?.message ?? ''}`
                : 'You can add bank details later. They aren’t needed to submit your application for review. Saving them now means one less step when payouts open.'}
            </Text>
            <LinkButton
              disabled={flow.busy}
              label={bankSaved ? 'Change bank details' : flow.bank ? 'Add bank details now' : 'Add or check bank details'}
              onPress={() => flow.edit('bank')}
            />
          </View>
        </Card>
      ) : (
        <ReviewCard complete={completion.bank} flow={flow} icon="bank" section="bank">
          <Rows
            rows={[
              ['Account holder', flow.bank?.accountHolderName || chefFullName(d)],
              ['Bank', flow.bank?.bankName ?? ''],
              ['Account', flow.bank?.lastFour ? `•••• ${flow.bank.lastFour}` : ''],
              ['IFSC', flow.bank?.ifsc ?? ''],
            ]}
          />
          {flow.bank?.message && !completion.bank ? <Text style={[ui.muted, styles.topGap]}>{flow.bank.message}</Text> : null}
        </ReviewCard>
      )}
      <Card>
        <CheckRow checked={flow.terms} disabled={flow.busy} onChange={flow.setTerms}>
          <Text style={ui.body}>
            I confirm these details are correct and agree to the{' '}
            <Text onPress={() => Linking.openURL('https://craves.in/terms')} style={styles.inlineLink}>Craves Chef Terms</Text>
            {' '}and{' '}
            <Text onPress={() => Linking.openURL('https://craves.in/privacy')} style={styles.inlineLink}>Privacy Policy</Text>.
          </Text>
        </CheckRow>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  fill: {width: '100%', height: '100%'},
  center: {textAlign: 'center'},
  gapXs: {gap: spacing.xs},
  topGap: {marginTop: spacing.sm},
  locked: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceMuted},
  verified: {flexDirection: 'row', alignItems: 'center', gap: 3},
  verifiedText: {color: colors.successText, fontSize: typography.small, fontWeight: fontWeight.semibold},
  counter: {alignSelf: 'flex-end'},
  textarea: {minHeight: 88},
  mapPreview: {height: 180, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted},
  mapEmpty: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  adjustPin: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  adjustPinText: {color: colors.flameRedAccessible, fontSize: typography.small + 1, fontWeight: fontWeight.semibold},
  mapBack: {
    position: 'absolute',
    left: spacing.md,
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...elevation.card,
  },
  mapSheet: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -radius.xl,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  searchRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 0},
  searchInput: {flex: 1, minHeight: touchTarget.minimum, color: colors.textPrimary, fontSize: typography.body, padding: 0},
  result: {flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border},
  pinned: {flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  pair: {flexDirection: 'row', gap: spacing.sm},
  requires: {gap: spacing.xxs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft},
  requiresList: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs},
  requiresChip: {paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.white},
  requiresChipText: {color: colors.warningText, fontSize: typography.small, fontWeight: fontWeight.semibold},
  step: {flexDirection: 'row', gap: spacing.sm},
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary,
  },
  stepNumberText: {color: colors.white, fontSize: typography.small, fontWeight: fontWeight.bold},
  video: {width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.black},
  videoEmpty: {alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted},
  videoEmptyBox: {alignItems: 'center', gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  poster: {alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.espresso},
  playButton: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  posterTitle: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.semibold, textAlign: 'center'},
  success: {flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.successSoft},
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  reviewMeta: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm},
  reviewPhotos: {flexDirection: 'row', gap: spacing.md, marginTop: spacing.md},
  reviewPhoto: {alignItems: 'center', gap: spacing.xxs},
  reviewThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  inlineLink: {color: colors.flameRedAccessible, fontWeight: fontWeight.semibold, textDecorationLine: 'underline'},
});
