import React from 'react';
import {Linking} from 'react-native';
import {Button, TerminalState} from '../../../shared/components';
import {formatDay} from '../domain/format';
import {resolveGate} from '../domain/gate';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, RiderScreen, Title, Value} from '../components/ui';
import {useRiderShell} from '../navigation';
import {RIDER_APP_VERSION} from '../riderConfig';
import {useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

/** Why the rider can't work, or the notice they must read, with a way to appeal outside the app. */
export function AccountStatusScreen() {
  const {strings} = useStrings();
  const shell = useRiderShell();
  const me = useRiderMe();

  if (!me.data) {
    return me.isError ? (
      <TerminalState title={strings.common.error} actionLabel={strings.common.retry} onAction={() => me.refetch()} />
    ) : null;
  }
  const gate = resolveGate(me.data, RIDER_APP_VERSION, false);
  const block = gate.kind === 'account' ? gate.block : null;
  const notice = me.data.notice;
  const call = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => undefined);

  return (
    <RiderScreen
      header={<RiderHeader inactive={Boolean(block)} />}
      testID="rider-account-status"
      footer={
        <>
          <BottomAction label={strings.common.callSupport} leftIcon="phone-outline" onPress={() => call(me.data.supportPhone)} />
          {block ? <Button label={strings.account.signOut} variant="ghost" onPress={() => shell.signOut()} /> : null}
        </>
      }>
      {block ? (
        <>
          <Title>{strings.account.titles[block]}</Title>
          <Body>{strings.account.bodies[block]}</Body>
          {me.data.statusReason ? (
            <Card>
              <Label>{strings.account.reason}</Label>
              <Value>{me.data.statusReason}</Value>
              {me.data.statusEffectiveAt ? (
                <Label>{`${strings.account.since} ${formatDay(me.data.statusEffectiveAt)}`}</Label>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
      {notice ? (
        <Card>
          <Value>{notice.title}</Value>
          <Body>{notice.reason}</Body>
          {notice.deadline ? <Label>{`${strings.account.deadline} ${formatDay(notice.deadline)}`}</Label> : null}
          <Button label={strings.common.callSupport} variant="outline" onPress={() => call(notice.appealPhone)} />
        </Card>
      ) : null}
      <Card>
        <Value>{strings.account.appealTitle}</Value>
        <Body>{strings.account.appealBody}</Body>
      </Card>
    </RiderScreen>
  );
}
