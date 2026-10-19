import React from 'react';
import {Linking} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {Button, SectionSkeleton, TerminalState} from '../../../shared/components';
import {riderApi} from '../api/riderApi';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, RiderScreen, Row, Title, Value} from '../components/ui';
import {formatDay} from '../domain/format';
import type {RiderScreenProps} from '../navigation';
import {riderKeys, useTerms} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

export function TermsScreen({route, navigation}: RiderScreenProps<'Terms'>) {
  const {strings} = useStrings();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const accepting = route.params.mode === 'accept';

  if (!terms.data) {
    return terms.isError ? (
      <TerminalState title={strings.common.error} actionLabel={strings.common.retry} onAction={() => terms.refetch()} />
    ) : (
      <SectionSkeleton />
    );
  }
  const {version, effectiveFrom, summaryOfChanges, rateCardLines, grievanceLines, fullTextUrl} = terms.data;

  async function accept() {
    try {
      // Accept exactly the version on screen; the server refuses if it changed meanwhile.
      await riderApi.acceptTerms(version);
      await queryClient.invalidateQueries({queryKey: riderKeys.me});
    } catch {
      await queryClient.invalidateQueries({queryKey: riderKeys.terms});
    }
  }

  return (
    <RiderScreen
      header={<RiderHeader title={strings.terms.title} />}
      testID="rider-terms"
      footer={
        accepting ? (
          <BottomAction label={strings.terms.accept} onPress={accept} testID="rider-terms-accept" />
        ) : (
          <Button label={strings.common.cancel} variant="ghost" onPress={() => navigation.goBack()} />
        )
      }>
      <Title>{strings.terms.title}</Title>
      <Label>{strings.terms.version(version, formatDay(effectiveFrom))}</Label>
      <Card>
        <Value>{strings.terms.whatChanged}</Value>
        {summaryOfChanges.map(line => (
          <Body key={line}>{`• ${line}`}</Body>
        ))}
      </Card>
      <Card>
        <Value>{strings.terms.rateCard}</Value>
        {rateCardLines.map(line => (
          <Row key={line.label} label={line.label} value={line.value} />
        ))}
        <Label>{strings.terms.notice}</Label>
      </Card>
      <Card>
        <Value>{strings.terms.grievance}</Value>
        {grievanceLines.map(line => (
          <Row key={line.label} label={line.label} value={line.value} />
        ))}
      </Card>
      {fullTextUrl ? (
        <Button label={strings.terms.fullText} variant="outline" onPress={() => Linking.openURL(fullTextUrl)} />
      ) : null}
    </RiderScreen>
  );
}
