import React from 'react';
import {Alert, Linking} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {riderApi} from '../api/riderApi';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, RiderScreen} from '../components/ui';
import {riderMessage} from '../domain/problem';
import {riderKeys, useRiderMe} from '../state/riderQueries';
import {serverLanguage, useStrings} from '../strings/StringsProvider';

/**
 * The privacy notice in force (WORKPLAN P2-09): the lawyer's text opens on the web in the language on screen, and the
 * rider accepts that version. The gate shows this before anything else and never mid-shift (domain/gate.ts).
 */
export function PrivacyNoticeScreen() {
  const {strings, language} = useStrings();
  const p = strings.privacy;
  const queryClient = useQueryClient();
  const notice = useRiderMe().data?.privacyNotice;
  if (!notice) {
    return null;
  }
  const {version} = notice;
  // The lawyer's text exists in the server's languages; a Kannada reader opens and accepts the English one.
  const shownIn = serverLanguage(language);
  const url = notice.url.replace('{language}', shownIn);

  async function accept() {
    try {
      await riderApi.acceptPrivacyNotice(version, shownIn);
    } catch (error) {
      Alert.alert(error instanceof AppApiError && error.code === 'NOTICE_CHANGED' ? p.changed : riderMessage(error, strings, language));
    }
    await queryClient.invalidateQueries({queryKey: riderKeys.me});
  }

  return (
    <RiderScreen
      header={<RiderHeader title={p.title} />}
      testID="rider-privacy"
      footer={
        <>
          <BottomAction label={p.accept} onPress={accept} testID="rider-privacy-accept" />
          <BottomAction
            label={p.read}
            variant="outline"
            onPress={() => Linking.openURL(url).catch(() => undefined)}
            testID="rider-privacy-read"
          />
        </>
      }>
      <Card>
        <Body>{p.intro}</Body>
        <Body>{p.selfies}</Body>
        <Label>{p.version(version)}</Label>
      </Card>
    </RiderScreen>
  );
}
