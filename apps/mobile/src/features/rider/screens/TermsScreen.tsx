import React from 'react';
import {Alert, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {Badge, SectionSkeleton} from '../../../shared/components';
import {borderWidth, colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import type {Language} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Card, RateRow, RiderScreen} from '../components/ui';
import {formatDay} from '../domain/format';
import type {RiderScreenProps} from '../navigation';
import {riderKeys, useRiderMe, useTerms} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const LANGUAGES: Language[] = ['en', 'te', 'hi'];

/** Switches the whole app's language; each label is in its own script. 40 dp to see, 48 dp to touch. */
function LanguageChips() {
  const {strings, language, setLanguage} = useStrings();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={strings.terms.language} style={styles.chips}>
      {LANGUAGES.map(code => {
        const selected = code === language;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{checked: selected}}
            hitSlop={{top: 4, bottom: 4}}
            onPress={() => setLanguage(code)}
            style={[styles.chip, selected && styles.chipSelected]}
            testID={`rider-language-${code}`}>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{strings.languages[code]}</Text>
          </Pressable>
        );
      })}
    </View>
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
  const {strings} = useStrings();
  const t = strings.terms;
  const queryClient = useQueryClient();
  const terms = useTerms();
  const me = useRiderMe();
  const accepting = route.params.mode === 'accept';
  const header = <RiderHeader title={t.title} />;

  if (!terms.data) {
    return (
      <RiderScreen header={header} testID="rider-terms">
        <LanguageChips />
        {terms.isError ? (
          <>
            <Banner tone="warning" text={strings.common.error} />
            <BottomAction label={strings.common.retry} variant="outline" onPress={() => terms.refetch()} />
          </>
        ) : (
          <SectionSkeleton lines={6} />
        )}
      </RiderScreen>
    );
  }
  const {version, effectiveFrom, summaryOfChanges, rateCardLines, grievanceLines, fullTextUrl, draft, upcoming} = terms.data;
  // Someone who accepted an older version sees what changed; a first acceptance reads the whole card.
  const changed = accepting && Boolean(me.data?.acceptedTermsVersion) && summaryOfChanges.length > 0;

  async function accept() {
    try {
      // The server refuses if the terms changed meanwhile.
      await riderApi.acceptTerms(version);
      await queryClient.invalidateQueries({queryKey: riderKeys.me});
    } catch (error) {
      Alert.alert(error instanceof AppApiError ? error.message : strings.common.error);
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
  chipSelected: {borderColor: colors.textPrimary, backgroundColor: colors.textPrimary},
  chipText: {fontSize: typography.body, color: colors.textPrimary},
  chipTextSelected: {fontWeight: fontWeight.bold, color: colors.white},
  meta: {gap: spacing.xs, alignItems: 'flex-start'},
  badge: {minHeight: 24, paddingHorizontal: 10, paddingVertical: 2},
  cardTitle: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  small: {fontSize: typography.small, color: colors.textSecondary},
  footnote: {marginTop: spacing.xs},
});
