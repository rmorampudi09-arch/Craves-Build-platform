import React from 'react';
import {Alert, Linking, StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {Badge} from '../../../shared/components';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {ChoiceChip, ChoiceRow} from '../components/Choices';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, ProblemCard} from '../components/StateCard';
import {Card, RateRow, RiderScreen} from '../components/ui';
import {formatDay} from '../domain/format';
import {offerRulesLines} from '../domain/offerRules';
import {riderMessage} from '../domain/problem';
import type {RiderScreenProps} from '../navigation';
import {riderKeys, useRiderMe, useTerms} from '../state/riderQueries';
import {RIDER_LANGUAGES, useStrings} from '../strings/StringsProvider';

/** Switches the whole app's language; each label is in its own script. 40 dp to see, 48 dp to touch. */
function LanguageChips() {
  const {strings, language, setLanguage} = useStrings();
  if (RIDER_LANGUAGES.length < 2) {
    return null;
  }
  return (
    <ChoiceRow label={strings.terms.language}>
      {RIDER_LANGUAGES.map(code => (
        <ChoiceChip
          key={code}
          label={strings.languages[code]}
          selected={code === language}
          onPress={() => setLanguage(code)}
          testID={`rider-language-${code}`}
        />
      ))}
    </ChoiceRow>
  );
}

function CardTitle({children}: {children: string}) {
  return (
    <Text accessibilityRole="header" style={styles.cardTitle}>
      {children}
    </Text>
  );
}

/** The published terms (03-Terms.png). The rider accepts exactly the version on screen. */
export function TermsScreen({route}: RiderScreenProps<'Terms'>) {
  const {strings, language} = useStrings();
  const t = strings.terms;
  const queryClient = useQueryClient();
  const terms = useTerms();
  const me = useRiderMe();
  const accepting = route.params.mode === 'accept';
  // Read from Profile: the way back is on screen too (accepting, the terms are the only screen there is).
  const header = <RiderHeader title={t.title} back={!accepting} />;
  // First terms ever: the rider was just approved, so say so and what this last step is.
  const welcome =
    accepting && me.data && !me.data.acceptedTermsVersion ? (
      <Banner tone="success" title={t.welcomeTitle} text={t.welcome} testID="rider-terms-welcome" />
    ) : null;

  if (!terms.data) {
    return (
      <RiderScreen header={header} testID="rider-terms">
        {welcome}
        <LanguageChips />
        {terms.isError ? (
          <ProblemCard error={terms.error} onRetry={() => terms.refetch()} testID="rider-terms-problem" />
        ) : (
          <CardsSkeleton cards={3} testID="rider-terms-loading" />
        )}
      </RiderScreen>
    );
  }
  const {version, effectiveFrom, summaryOfChanges, rateCardLines, grievanceLines, fullTextUrl, draft, upcoming, offerRules} = terms.data;
  const rulesNow = offerRules ? offerRulesLines(offerRules, t) : [];
  // The rules then, only when a rider would read something different.
  const rulesThen = upcoming?.offerRules ? offerRulesLines(upcoming.offerRules, t) : [];
  const rulesChange = rulesThen.length > 0 && rulesThen.join('\n') !== rulesNow.join('\n');
  // Someone who accepted an older version sees what changed; a first acceptance reads the whole card.
  const changed = accepting && Boolean(me.data?.acceptedTermsVersion) && summaryOfChanges.length > 0;

  async function accept() {
    try {
      // The server refuses if the terms changed meanwhile.
      await riderApi.acceptTerms(version);
      await queryClient.invalidateQueries({queryKey: riderKeys.me});
    } catch (error) {
      Alert.alert(riderMessage(error, strings, language));
      await queryClient.invalidateQueries({queryKey: riderKeys.terms});
    }
  }

  const readFull = fullTextUrl ? (
    <BottomAction
      label={t.fullText}
      variant="outline"
      onPress={() => Linking.openURL(fullTextUrl).catch(() => undefined)}
      testID="rider-terms-full"
    />
  ) : null;

  return (
    <RiderScreen
      header={header}
      testID="rider-terms"
      footer={
        accepting ? (
          <>
            <BottomAction label={t.accept} onPress={accept} testID="rider-terms-accept" />
            {readFull}
          </>
        ) : (
          readFull
        )
      }>
      {welcome}
      <LanguageChips />
      <View style={styles.meta}>
        <Text style={styles.small}>{t.version(version, formatDay(effectiveFrom))}</Text>
        {draft ? <Badge label={t.draft} tone="warning" style={styles.badge} testID="rider-terms-draft" /> : null}
      </View>
      {changed ? (
        <Card>
          <CardTitle>{t.whatChanged}</CardTitle>
          {summaryOfChanges.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.body}>
              {line}
            </Text>
          ))}
        </Card>
      ) : null}
      <Card>
        <CardTitle>{t.rateCard}</CardTitle>
        {rateCardLines.map((line, index) => (
          <RateRow key={`${index}-${line.label}`} label={line.label} value={line.value} divider={index > 0} />
        ))}
        <Text style={[styles.small, styles.footnote]}>{t.notice}</Text>
      </Card>
      {rulesNow.length > 0 ? (
        <Card>
          <CardTitle>{t.rulesTitle}</CardTitle>
          {rulesNow.map(line => (
            <Text key={line} style={styles.body}>
              {line}
            </Text>
          ))}
        </Card>
      ) : null}
      {upcoming ? (
        <Card>
          <CardTitle>{t.upcomingTitle(formatDay(upcoming.effectiveFrom))}</CardTitle>
          {upcoming.summaryOfChanges.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.body}>
              {line}
            </Text>
          ))}
          {upcoming.rateCardLines.map((line, index) => (
            <RateRow key={`${index}-${line.label}`} label={line.label} value={line.value} divider={index > 0} />
          ))}
          {rulesChange ? (
            <View style={styles.rulesThen} testID="rider-terms-rules-then">
              <Text style={styles.subTitle}>{t.rulesThen}</Text>
              {rulesThen.map(line => (
                <Text key={line} style={styles.body}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <CardTitle>{t.howPaidTitle}</CardTitle>
        <Text style={styles.body}>{t.howPaid}</Text>
        <Text style={styles.body}>{t.noFees}</Text>
      </Card>
      <Card>
        <CardTitle>{t.grievance}</CardTitle>
        {grievanceLines.map((line, index) => (
          <RateRow key={`${index}-${line.label}`} label={line.label} value={line.value} />
        ))}
      </Card>
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  meta: {gap: spacing.xs, alignItems: 'flex-start'},
  badge: {minHeight: 24, paddingHorizontal: 10, paddingVertical: 2},
  cardTitle: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  small: {fontSize: typography.small, color: colors.textSecondary},
  footnote: {marginTop: spacing.xs},
  rulesThen: {gap: spacing.xs, marginTop: spacing.sm},
  subTitle: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
