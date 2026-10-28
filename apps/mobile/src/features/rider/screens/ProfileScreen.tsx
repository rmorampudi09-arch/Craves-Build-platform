import React, {useState} from 'react';
import {Alert, Image, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {Icon, SectionSkeleton} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, touchTarget, typography} from '../../../design/tokens';
import type {RiderProfile} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {StatusBadge} from '../components/StatusBadge';
import {Body, Card, Label, RiderScreen, Title, Value} from '../components/ui';
import {formatDay} from '../domain/format';
import {useRiderShell, type RiderNav} from '../navigation';
import {riderKeys, useProfile, useRiderMe} from '../state/riderQueries';
import {usePendingActions} from '../state/tripQueue';
import {RIDER_LANGUAGES, useStrings} from '../strings/StringsProvider';
import {LoadFailed} from './TripDetailScreen';

const SOON_MS = 30 * 24 * 3_600_000;

type Doc = RiderProfile['documents'][number];

/** Expired documents say so; ones expiring within 30 days warn before anything blocks the rider. */
export function documentBadge(doc: Doc, now = Date.now()): {label: 'EXPIRED' | 'SOON' | Doc['status']} {
  const expires = doc.expiresOn ? Date.parse(doc.expiresOn) : null;
  if (doc.status === 'EXPIRED' || (expires !== null && expires < now)) {
    return {label: 'EXPIRED'};
  }
  if (expires !== null && expires - now < SOON_MS) {
    return {label: 'SOON'};
  }
  return {label: doc.status};
}

/** "8 Nov" this year, "2 May 2031" otherwise. */
function dayWithYear(value: string) {
  const year = new Date(value).getFullYear();
  return year === new Date().getFullYear() ? formatDay(value) : `${formatDay(value)} ${year}`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');

export function ProfileScreen() {
  const {strings, language, setLanguage} = useStrings();
  const p = strings.profile;
  const navigation = useNavigation<RiderNav>();
  const shell = useRiderShell();
  const queryClient = useQueryClient();
  const me = useRiderMe();
  const profile = useProfile();
  const pending = usePendingActions(shell.riderId);
  const [docProblem, setDocProblem] = useState<{type: string; text: string; settings?: boolean} | null>(null);

  function signOut() {
    if (pending > 0) {
      Alert.alert(p.signOutBlocked);
      return;
    }
    shell.signOut();
  }

  /** Back camera → upload → fresh profile; ops then checks the photo by hand. */
  async function upload(type: string) {
    setDocProblem(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setDocProblem({type, text: p.cameraDenied, settings: true});
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({cameraType: ImagePicker.CameraType.back, mediaTypes: ['images'], quality: 0.6});
      const uri = shot.canceled ? null : shot.assets[0]?.uri;
      if (!uri) {
        return;
      }
      await riderApi.uploadDocument(type, uri);
      await queryClient.invalidateQueries({queryKey: riderKeys.profile});
    } catch {
      setDocProblem({type, text: p.uploadFailed});
    }
  }

  function documentRow(doc: Doc, index: number) {
    const badge = documentBadge(doc).label;
    const sub =
      doc.status === 'PENDING'
        ? p.checking
        : doc.expiresOn
          ? (badge === 'EXPIRED' ? p.expired : p.expires)(dayWithYear(doc.expiresOn))
          : undefined;
    const action =
      badge === 'SOON' && doc.expiresOn ? p.renewBy(dayWithYear(doc.expiresOn)) : badge === 'EXPIRED' ? p.renewNow : badge === 'REJECTED' ? doc.reason : undefined;
    const canUpload = Boolean(doc.type) && (badge === 'SOON' || badge === 'EXPIRED' || badge === 'REJECTED');
    const problem = docProblem && docProblem.type === doc.type ? docProblem : null;
    return (
      <View key={doc.label} style={[styles.doc, index > 0 && styles.divider]} testID={`doc-${doc.label}`}>
        <View style={styles.docTop}>
          <View style={styles.grow}>
            <Body>{doc.label}</Body>
            {sub ? <Label>{sub}</Label> : null}
          </View>
          <StatusBadge status={badge} label={badge === 'SOON' ? p.expiresSoon : p.docStatus[badge]} />
        </View>
        {action ? <Body>{action}</Body> : null}
        {canUpload ? (
          <BottomAction
            label={doc.type === 'INSURANCE' ? p.uploadInsurance : p.upload}
            variant="outline"
            size="compact"
            onPress={() => upload(doc.type as string)}
            style={styles.upload}
            testID={`rider-upload-${doc.type}`}
          />
        ) : null}
        {problem ? (
          <View style={styles.problem}>
            <Banner tone="warning" inset text={problem.text} />
            {problem.settings ? (
              <BottomAction label={p.openSettings} variant="ghost" onPress={() => Linking.openSettings().catch(() => undefined)} style={styles.link} />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  const links: [string, string, () => void][] = [
    [p.terms, 'terms', () => navigation.navigate('Terms', {mode: 'view'})],
    [p.setup, 'setup', () => navigation.navigate('PhoneSetup')],
    [p.help, 'help', () => navigation.navigate('Help')],
  ];

  return (
    <RiderScreen header={<RiderHeader title={p.title} />} testID="rider-profile">
      {me.data ? (
        <View style={styles.person}>
          {me.data.photoUrl ? (
            <Image source={{uri: me.data.photoUrl}} style={styles.avatar} accessibilityIgnoresInvertColors accessible={false} />
          ) : (
            <View style={styles.avatar} importantForAccessibility="no-hide-descendants">
              <Text style={styles.initials}>{initials(me.data.name)}</Text>
            </View>
          )}
          <View style={styles.grow}>
            <Title>{me.data.name}</Title>
            <Label>{me.data.phoneMasked}</Label>
          </View>
        </View>
      ) : null}
      {profile.data ? (
        <>
          <Card>
            <Label>{p.vehicle}</Label>
            <Value>{profile.data.vehicle.label}</Value>
            {profile.data.vehicle.regNumberMasked ? <Text style={styles.reg}>{profile.data.vehicle.regNumberMasked}</Text> : null}
          </Card>
          {profile.data.documents.length ? (
            <Card style={styles.docs}>
              <Label>{p.documents}</Label>
              {profile.data.documents.map(documentRow)}
            </Card>
          ) : null}
          {profile.data.payoutAccountMasked ? (
            <Card>
              <Label>{p.payoutAccount}</Label>
              <Value>{profile.data.payoutAccountMasked}</Value>
              <Label>{p.payoutChange}</Label>
            </Card>
          ) : null}
          {profile.data.insurance ? (
            <Card>
              <Label>{p.insurance}</Label>
              <Value>{profile.data.insurance.label}</Value>
              {profile.data.insurance.claimStatus ? <Body>{profile.data.insurance.claimStatus}</Body> : null}
              <BottomAction
                label={p.claimCall}
                variant="outline"
                size="compact"
                onPress={() => Linking.openURL(`tel:${profile.data.insurance?.claimPhone}`).catch(() => undefined)}
                style={styles.upload}
                testID="rider-claim-call"
              />
            </Card>
          ) : null}
        </>
      ) : profile.isError ? (
        <LoadFailed error={profile.error} onRetry={profile.refetch} />
      ) : (
        <SectionSkeleton lines={6} testID="rider-profile-loading" />
      )}
      {RIDER_LANGUAGES.length > 1 ? (
        <View style={styles.language}>
          <Label>{p.language}</Label>
          <View accessibilityRole="radiogroup" accessibilityLabel={p.language} style={styles.chips}>
            {RIDER_LANGUAGES.map(code => (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{checked: language === code}}
                hitSlop={{top: spacing.xxs, bottom: spacing.xxs}}
                onPress={() => setLanguage(code)}
                style={[styles.chip, language === code && styles.chipOn]}
                testID={`rider-language-${code}`}>
                <Text style={[styles.chipText, language === code && styles.chipTextOn]}>{strings.languages[code]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Card style={styles.links}>
        {links.map(([label, id, open], index) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            onPress={open}
            testID={`rider-open-${id}`}
            style={({pressed}) => [styles.linkRow, index > 0 && styles.divider, pressed && styles.pressed]}>
            <Text style={styles.linkText}>{label}</Text>
            <Icon name="chevron-right" size={iconSize.lg} color={colors.textSecondary} surface={false} />
          </Pressable>
        ))}
      </Card>
      <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut} testID="rider-sign-out">
        <Text style={styles.signOutText}>{p.signOut}</Text>
      </Pressable>
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  grow: {flex: 1},
  person: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.cream,
  },
  initials: {fontSize: typography.hero, fontWeight: fontWeight.bold, color: colors.textPrimary},
  reg: {fontSize: typography.small, color: colors.textPrimary},
  docs: {gap: 0},
  doc: {gap: spacing.xs, paddingVertical: spacing.sm},
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  docTop: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  upload: {marginTop: spacing.xxs},
  problem: {gap: spacing.xxs},
  link: {alignSelf: 'flex-start', marginLeft: -spacing.xs},
  language: {gap: spacing.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  chipOn: {borderColor: colors.textPrimary, backgroundColor: colors.textPrimary},
  chipText: {fontSize: typography.body, color: colors.textPrimary},
  chipTextOn: {fontWeight: fontWeight.bold, color: colors.white},
  links: {padding: 0, gap: 0, overflow: 'hidden'},
  linkRow: {minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md},
  linkText: {flex: 1, fontSize: typography.body, color: colors.textPrimary},
  pressed: {backgroundColor: colors.muted},
  signOut: {minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  signOutText: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textSecondary},
});
