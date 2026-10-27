import React from 'react';
import {Alert, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {Icon, SectionSkeleton, type IconName} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, spacing, touchTarget, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import type {RiderMe, RiderProfile} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {StatusBadge} from '../components/StatusBadge';
import {Card, RiderScreen, Title} from '../components/ui';
import {formatDay} from '../domain/format';
import {resolveGate} from '../domain/gate';
import {useRiderShell} from '../navigation';
import {RIDER_APP_VERSION} from '../riderConfig';
import {riderKeys, useProfile, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {DetailsCard, JoinForm, PayoutAccountCard} from './SignUpForms';

type RiderDocument = RiderProfile['documents'][number];

/** Takes a new photo with the back camera and sends it for ops to check by hand. */
async function uploadAgain(doc: RiderDocument, messages: {denied: string; openSettings: string; cancel: string; error: string}) {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(messages.denied, undefined, [
        {text: messages.cancel, style: 'cancel'},
        {text: messages.openSettings, onPress: () => Linking.openSettings().catch(() => undefined)},
      ]);
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.back,
      mediaTypes: ['images'],
      quality: 0.7,
    });
    const uri = shot.canceled ? undefined : shot.assets[0]?.uri;
    if (uri && doc.type) {
      await riderApi.uploadDocument(doc.type, uri);
    }
  } catch (error) {
    Alert.alert(error instanceof AppApiError ? error.message : messages.error);
  }
}

function IconCard({icon, title, body}: {icon: IconName; title: string; body: string}) {
  return (
    <Card style={styles.iconCard}>
      <Icon name={icon} size={iconSize.lg} color={colors.textSecondary} surface={false} />
      <View style={styles.flex}>
        <Text style={styles.strong}>{title}</Text>
        <Text style={styles.secondary}>{body}</Text>
      </View>
    </Card>
  );
}

/** One row per document from GET /profile; a missing one asks for a photo, a rejected or expired one shows why. */
function Documents() {
  const {strings} = useStrings();
  const a = strings.account;
  const queryClient = useQueryClient();
  const profile = useProfile();
  const messages = {
    denied: a.cameraDenied,
    openSettings: a.openSettings,
    cancel: strings.common.cancel,
    error: strings.common.error,
  };

  if (!profile.data) {
    return profile.isError ? (
      <>
        <Banner tone="warning" text={a.documentsError} />
        <BottomAction label={strings.common.retry} variant="outline" size="compact" onPress={() => profile.refetch()} />
      </>
    ) : (
      <Card>
        <SectionSkeleton showTitle={false} lines={4} />
      </Card>
    );
  }
  const documents = profile.data.documents;
  if (!documents.length) {
    return null;
  }
  return (
    <Card style={styles.documents}>
      {documents.map((doc, index) => {
        const fix = doc.status === 'REJECTED' || doc.status === 'EXPIRED' || doc.status === 'MISSING';
        const reason = doc.reason ?? (doc.status === 'EXPIRED' ? a.expiredReason : undefined);
        const label = doc.status === 'VERIFIED' && doc.type === 'BANK' ? a.nameMatches : a.docStatus[doc.status];
        const hint = fix && doc.type ? a.docHints[doc.type] : undefined;
        return (
          <View key={doc.type ?? doc.label} style={[styles.document, index > 0 && styles.divider]}>
            <View style={styles.documentRow}>
              <Text style={[styles.body, styles.flex]}>{doc.label}</Text>
              <StatusBadge status={doc.status} label={label} />
            </View>
            {fix && reason ? <Text style={styles.body}>{reason}</Text> : null}
            {hint ? <Text style={styles.secondary}>{hint}</Text> : null}
            {fix && doc.type ? (
              <BottomAction
                label={doc.status === 'MISSING' ? a.upload : a.uploadAgain}
                variant="outline"
                size="compact"
                accessibilityHint={doc.label}
                onPress={async () => {
                  await uploadAgain(doc, messages);
                  await queryClient.invalidateQueries({queryKey: riderKeys.profile});
                }}
                testID={`rider-upload-${doc.type}`}
              />
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

/** The details and payout account cards once the profile has loaded (Documents shows the loading and error states). */
function DetailsAndPayout({me}: {me: RiderMe}) {
  const profile = useProfile();
  if (!profile.data) {
    return null;
  }
  return (
    <>
      <DetailsCard me={me} profile={profile.data} />
      <PayoutAccountCard key={me.name} profile={profile.data} kycName={me.name} />
    </>
  );
}

/**
 * Why the rider can't work yet (02-AccountStatus.png), or the notice they must read, with a way to reach a person.
 * Someone who isn't a rider yet signs up here, like a chef: then documents and a payout account, which ops checks.
 */
export function AccountStatusScreen() {
  const {strings} = useStrings();
  const a = strings.account;
  const shell = useRiderShell();
  const me = useRiderMe();

  if (!me.data) {
    return (
      <RiderScreen header={<RiderHeader title={a.headerBlocked} inactive />} testID="rider-account-status">
        {me.isError ? (
          <>
            <Banner tone="warning" text={strings.common.error} />
            <BottomAction label={strings.common.retry} variant="outline" onPress={() => me.refetch()} />
          </>
        ) : (
          <SectionSkeleton />
        )}
      </RiderScreen>
    );
  }
  const gate = resolveGate(me.data, RIDER_APP_VERSION, false);
  const block = gate.kind === 'account' ? gate.block : null;
  const notice = me.data.notice;
  const call = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => undefined);
  const appeal = block === 'SUSPENDED' || block === 'DEACTIVATED' || Boolean(notice);

  return (
    <RiderScreen
      header={<RiderHeader title={block === 'PENDING' ? a.header : a.headerBlocked} inactive={Boolean(block)} />}
      testID="rider-account-status"
      keyboardHidesFooter
      footer={
        <>
          <BottomAction
            label={strings.common.callSupport}
            leftIcon="phone-outline"
            onPress={() => call(me.data.supportPhone)}
            testID="rider-call-support"
          />
          {block ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => shell.signOut()}
              style={({pressed}) => [styles.textButton, pressed && styles.pressed]}
              testID="rider-sign-out">
              <Text style={styles.textButtonLabel}>{a.signOut}</Text>
            </Pressable>
          ) : null}
        </>
      }>
      {block ? (
        <View style={styles.intro}>
          <Title>{a.titles[block]}</Title>
          <Text style={styles.secondary}>{a.bodies[block]}</Text>
        </View>
      ) : null}
      {block === 'NOT_RIDER' ? <JoinForm /> : null}
      {block === 'PENDING' ? (
        <>
          <Documents />
          <DetailsAndPayout me={me.data} />
          <IconCard icon="clock-outline" title={a.backgroundTitle} body={a.backgroundBody} />
          <IconCard icon="moped" title={a.trainingTitle} body={a.trainingBody} />
        </>
      ) : null}
      {block && me.data.statusReason ? (
        <Card>
          <Text style={styles.label}>{a.reason}</Text>
          <Text style={styles.strong}>{me.data.statusReason}</Text>
          {me.data.statusEffectiveAt ? (
            <Text style={styles.label}>{`${a.since} ${formatDay(me.data.statusEffectiveAt)}`}</Text>
          ) : null}
        </Card>
      ) : null}
      {notice ? (
        <Card>
          <Text style={styles.strong}>{notice.title}</Text>
          <Text style={styles.body}>{notice.reason}</Text>
          {notice.deadline ? <Text style={styles.label}>{`${a.deadline} ${formatDay(notice.deadline)}`}</Text> : null}
          <BottomAction
            label={strings.common.callSupport}
            variant="outline"
            size="compact"
            leftIcon="phone-outline"
            onPress={() => call(notice.appealPhone)}
          />
        </Card>
      ) : null}
      {appeal ? (
        <Card>
          <Text style={styles.strong}>{a.appealTitle}</Text>
          <Text style={styles.secondary}>{a.appealBody}</Text>
        </Card>
      ) : null}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  intro: {gap: spacing.xs},
  body: {fontSize: typography.body, color: colors.textPrimary},
  secondary: {fontSize: typography.body, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  label: {fontSize: typography.small, color: colors.textSecondary},
  iconCard: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  documents: {gap: 0, paddingVertical: spacing.xxs},
  document: {gap: spacing.xs, paddingVertical: spacing.sm},
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  documentRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  textButton: {minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  textButtonLabel: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textSecondary},
  pressed: {opacity: 0.6},
});
