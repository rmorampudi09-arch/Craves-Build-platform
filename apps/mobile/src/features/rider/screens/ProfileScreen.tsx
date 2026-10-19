import React from 'react';
import {Alert, Image, Linking, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Badge, Button, Chip, SectionSkeleton} from '../../../shared/components';
import {colors, spacing} from '../../../design/tokens';
import type {Language, RiderProfile} from '../api/contract';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, RiderScreen, riderStyles, Title, Value} from '../components/ui';
import {formatDay} from '../domain/format';
import {useRiderShell, type RiderNav} from '../navigation';
import {useProfile, useRiderMe} from '../state/riderQueries';
import {usePendingActions} from '../state/tripQueue';
import {useStrings} from '../strings/StringsProvider';

const SOON_MS = 30 * 24 * 3_600_000;
const LANGUAGES: Language[] = ['en', 'te', 'hi'];

type Doc = RiderProfile['documents'][number];

/** Expired documents say so; ones expiring within 30 days warn before anything blocks the rider. */
export function documentBadge(doc: Doc, now = Date.now()): {label: 'EXPIRED' | 'SOON' | Doc['status']; tone: 'error' | 'warning' | 'success' | 'neutral'} {
  const expires = doc.expiresOn ? Date.parse(doc.expiresOn) : null;
  if (doc.status === 'EXPIRED' || (expires !== null && expires < now)) {
    return {label: 'EXPIRED', tone: 'error'};
  }
  if (expires !== null && expires - now < SOON_MS) {
    return {label: 'SOON', tone: 'warning'};
  }
  return {label: doc.status, tone: doc.status === 'VERIFIED' ? 'success' : doc.status === 'REJECTED' ? 'error' : 'neutral'};
}

export function ProfileScreen() {
  const {strings, language, setLanguage} = useStrings();
  const p = strings.profile;
  const navigation = useNavigation<RiderNav>();
  const shell = useRiderShell();
  const me = useRiderMe();
  const profile = useProfile();
  const pending = usePendingActions(shell.riderId);

  function signOut() {
    if (pending > 0) {
      Alert.alert(p.signOutBlocked);
      return;
    }
    shell.signOut();
  }

  return (
    <RiderScreen
      header={<RiderHeader title={p.title} />}
      testID="rider-profile"
      footer={<Button label={p.signOut} variant="ghost" onPress={signOut} testID="rider-sign-out" />}>
      {me.data ? (
        <View style={styles.person}>
          {me.data.photoUrl ? <Image source={{uri: me.data.photoUrl}} style={styles.photo} accessibilityIgnoresInvertColors /> : null}
          <View>
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
            {profile.data.vehicle.regNumberMasked ? <Body>{profile.data.vehicle.regNumberMasked}</Body> : null}
          </Card>
          <Card>
            <Label>{p.documents}</Label>
            {profile.data.documents.map(doc => {
              const badge = documentBadge(doc);
              const label = badge.label === 'SOON' ? p.expiresSoon : p.docStatus[badge.label];
              return (
                <View key={doc.label} style={styles.doc} testID={`doc-${doc.label}`}>
                  <View style={riderStyles.half}>
                    <Body>{doc.label}</Body>
                    {doc.expiresOn ? <Label>{p.expires(formatDay(doc.expiresOn))}</Label> : null}
                  </View>
                  <Badge label={label} tone={badge.tone} />
                </View>
              );
            })}
          </Card>
          {profile.data.payoutAccountMasked ? (
            <Card>
              <Label>{p.payoutAccount}</Label>
              <Value>{profile.data.payoutAccountMasked}</Value>
            </Card>
          ) : null}
          {profile.data.insurance ? (
            <Card>
              <Label>{p.insurance}</Label>
              <Value>{profile.data.insurance.label}</Value>
              {profile.data.insurance.claimStatus ? <Body>{profile.data.insurance.claimStatus}</Body> : null}
              <Button
                label={p.claimCall}
                variant="outline"
                leftIcon="phone"
                onPress={() => Linking.openURL(`tel:${profile.data.insurance?.claimPhone}`).catch(() => undefined)}
              />
            </Card>
          ) : null}
        </>
      ) : (
        <SectionSkeleton />
      )}
      <Card>
        <Label>{p.language}</Label>
        <View style={riderStyles.rowGap}>
          {LANGUAGES.map(code => (
            <Chip key={code} label={strings.languages[code]} selected={language === code} onPress={() => setLanguage(code)} />
          ))}
        </View>
      </Card>
      <Button label={p.terms} variant="outline" onPress={() => navigation.navigate('Terms', {mode: 'view'})} />
      <Button label={p.setup} variant="outline" onPress={() => navigation.navigate('PhoneSetup')} />
      <Button label={p.help} variant="outline" onPress={() => navigation.navigate('Help')} />
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  person: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  photo: {width: 64, height: 64, borderRadius: 32, backgroundColor: colors.muted},
  doc: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxs},
});
