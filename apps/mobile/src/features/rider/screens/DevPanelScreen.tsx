import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Button} from '../../../shared/components';
import {mockRider} from '../api/riderApi.mock';
import {Body, RiderScreen, Title} from '../components/ui';
import {riderOnlineService} from '../native/riderOnlineService';
import type {RiderScreenProps} from '../navigation';
import {riderKeys} from '../state/riderQueries';

// Demo controls for reviewers; reachable only in mock builds (long-press the status chip). Not translated on purpose.
export function DevPanelScreen({navigation}: RiderScreenProps<'DevPanel'>) {
  const queryClient = useQueryClient();
  const c = mockRider.controls;
  const act = (fn: () => void, poll = false) => async () => {
    fn();
    if (poll) {
      await riderOnlineService.pollNow();
    }
    await queryClient.invalidateQueries({queryKey: riderKeys.all});
    navigation.goBack();
  };

  return (
    <RiderScreen footer={<Button label="Close" variant="ghost" onPress={() => navigation.goBack()} />}>
      <Title>Demo controls</Title>
      <Body>These change the demo server only. Go online first for offers.</Body>
      <Button label="Send an offer now" onPress={act(c.sendOfferNow, true)} />
      <Button label="Next accept loses the race" variant="outline" onPress={act(c.loseNextRace)} />
      <Button label="Next call fails (offline)" variant="outline" onPress={act(c.failNextCall)} />
      <Button label="Next device check fails: phone not approved" variant="outline" onPress={act(c.failNextDeviceCheck)} />
      <Button label="Customer cancels the active trip" variant="outline" onPress={act(c.cancelActiveTrip, true)} />
      <Button label="Ops ends my shift" variant="outline" onPress={act(c.stopShift, true)} />
      <Button label="Give / clear a 7-day notice" variant="outline" onPress={act(c.giveNotice)} />
      <Button label="Suspend me" variant="outline" onPress={act(() => c.setStatus('SUSPENDED'))} />
      <Button label="Make me active" variant="outline" onPress={act(() => c.setStatus('ACTIVE'))} />
      <Button label="Start over as a new applicant" variant="outline" onPress={act(c.startApplication)} />
      <Button label="Ops approves my application" variant="outline" onPress={act(c.approveApplication)} />
      <Button label="Ops asks for fixes (first photo, payout account)" variant="outline" onPress={act(c.askForFixes)} />
      <Button label="Publish new terms" variant="outline" onPress={act(c.publishNewTerms)} />
      <Button label="Publish a privacy notice" variant="outline" onPress={act(c.publishPrivacyNotice)} />
      <Button label="Turn withdrawals on / off" variant="outline" onPress={act(c.toggleWithdraw)} />
      <Button label="Reset the demo" variant="ghost" onPress={act(c.reset)} />
    </RiderScreen>
  );
}
