import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {font, radius, spacing, themedStyles, touchTarget, typography} from '../theme';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, ProblemCard} from '../components/StateCard';
import {Card, RiderScreen} from '../components/ui';
import {formatDay} from '../domain/format';
import {offerRulesLines} from '../domain/offerRules';
import type {RiderNav} from '../navigation';
import {useTerms} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {LanguageChips} from './TermsScreen';

/**
 * How you get orders (REDESIGN.md, Rules): the dispatch rules in force, from the server's OfferRules, one line each, and
 * "Changes from <date>" only while newer terms wait (Terms.upcoming). The rate card and the grievance officer are on Terms.
 */
export function RulesScreen() {
  const {strings} = useStrings();
  const r = strings.rules;
  const navigation = useNavigation<RiderNav>();
  const terms = useTerms();
  const data = terms.data;
  const lines = data?.offerRules ? offerRulesLines(data.offerRules, strings.terms) : [];
  const openTerms = () => navigation.navigate('Terms', {mode: 'view'});

  return (
    <RiderScreen
      header={<RiderHeader title={r.title} back />}
      testID="rider-rules"
      footer={
        data ? (
          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={openTerms} style={styles.link} testID="rider-rules-rate-card">
              <Text style={styles.linkText}>{r.rateCard(data.version)}</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={openTerms} style={styles.link} testID="rider-rules-grievance">
              <Text style={styles.linkText}>{r.grievance}</Text>
            </Pressable>
          </View>
        ) : undefined
      }>
      <LanguageChips />
      {!data ? (
        terms.isError ? (
          <ProblemCard error={terms.error} onRetry={() => terms.refetch()} testID="rider-rules-problem" />
        ) : (
          <CardsSkeleton cards={2} testID="rider-rules-loading" />
        )
      ) : (
        <>
          {lines.length === 0 ? <Text style={styles.body}>{r.none}</Text> : null}
          {lines.map(line => (
            <View key={line} style={styles.rule}>
              <View style={styles.dot} />
              <Text style={[styles.body, styles.flex]}>{line}</Text>
            </View>
          ))}
          {data.upcoming ? (
            <View testID="rider-rules-changes">
              <Card style={styles.changes}>
              <Text accessibilityRole="header" style={styles.strong}>
                {r.changesFrom(formatDay(data.upcoming.effectiveFrom))}
              </Text>
              {data.upcoming.summaryOfChanges.map((line, index) => (
                <Text key={`${index}-${line}`} style={styles.secondary}>
                  {line}
                </Text>
              ))}
                <Text style={styles.secondary}>{r.changesNote}</Text>
              </Card>
            </View>
          ) : null}
        </>
      )}
    </RiderScreen>
  );
}

const styles = themedStyles(c => ({
  flex: {flex: 1},
  rule: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  dot: {width: 8, height: 8, borderRadius: radius.pill, marginTop: 7, backgroundColor: c.inverse},
  body: {fontFamily: font.regular, fontSize: typography.body, lineHeight: 22, color: c.textPrimary},
  secondary: {fontFamily: font.regular, fontSize: typography.body, lineHeight: 20, color: c.textSecondary},
  strong: {fontSize: typography.body, fontFamily: font.bold, color: c.textPrimary},
  changes: {gap: spacing.xs},
  links: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm},
  link: {minHeight: touchTarget.minimum, justifyContent: 'center'},
  linkText: {fontSize: typography.body, fontFamily: font.bold, color: c.redText},
}));
