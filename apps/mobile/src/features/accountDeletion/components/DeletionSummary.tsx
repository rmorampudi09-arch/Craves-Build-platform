import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {deletionCopy} from '../domain/deletionCopy';
import type {SummaryKind} from '../domain/deletionModel';
import {DeletionNote} from './DeletionNote';

const customer = deletionCopy.customerSummary;
const chef = deletionCopy.chefSummary;

interface Props {
  kind: SummaryKind;
  /** Customer scopes only: today + 30 days, "5 Dec" and "5 Dec 2026". */
  shortDate: string;
  longDate: string;
  /** Customer side only: the person also has a chef side, which stays. */
  chefSideStays: boolean;
}

function Label({text}: {text: string}) {
  return (
    <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
      {text}
    </Text>
  );
}

function Bullets({items}: {items: readonly string[]}) {
  return (
    <View style={styles.bullets}>
      {items.map(item => (
        <View key={item} style={styles.bullet}>
          <View style={styles.dot} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.line, styles.fill]}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Kept({label, title, body}: {label: string; title: string; body: string}) {
  return (
    <View style={styles.card}>
      <Label text={label} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.strong}>
        {title}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
        {body}
      </Text>
    </View>
  );
}

function Steps({last}: {last: string}) {
  const steps = [...chef.steps, {title: last, body: ''}];
  return (
    <View style={styles.card}>
      <Label text={chef.howLabel} />
      {steps.map((step, index) => (
        <View key={step.title} style={styles.step}>
          <View style={styles.number}>
            <Text allowFontScaling={false} style={styles.numberText}>
              {index + 1}
            </Text>
          </View>
          <View style={styles.stepCopy}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.strong}>
              {step.title}
            </Text>
            {step.body ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
                {step.body}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function ChefSummary({all}: {all: boolean}) {
  return (
    <>
      <Steps last={all ? chef.lastStepAll : chef.lastStepSide} />
      <View style={styles.card}>
        <Label text={chef.goesLabel} />
        <Bullets items={all ? [...chef.goes, ...customer.goesAll] : chef.goes} />
      </View>
      <Kept body={chef.keptBody} label={chef.keptLabel} title={chef.keptTitle} />
      {all ? (
        <Kept body={customer.keptBody} label={customer.keptLabel} title={customer.keptTitle} />
      ) : (
        <DeletionNote text={chef.customerSideStays} tone="success" />
      )}
    </>
  );
}

function CustomerSummary({all, shortDate, longDate, chefSideStays}: Omit<Props, 'kind'> & {all: boolean}) {
  return (
    <>
      <View style={styles.card}>
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.strong}>
          {customer.dateTitle(longDate)}
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
          {customer.dateBody}
        </Text>
      </View>
      <View style={styles.card}>
        <Label text={customer.goesLabel} />
        <Bullets items={all ? customer.goesAll : customer.goesSide} />
      </View>
      <Kept body={customer.keptBody} label={customer.keptLabel} title={customer.keptTitle} />
      <View style={styles.card}>
        <Label text={customer.untilLabel(shortDate)} />
        <Bullets items={customer.until} />
      </View>
      {all ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
          {customer.signUpAgain(shortDate)}
        </Text>
      ) : chefSideStays ? (
        <DeletionNote text={customer.chefSideStays} tone="success" />
      ) : null}
    </>
  );
}

/** What goes and what Craves keeps, in the four forms the owner approved (spec, "The start"). */
export function DeletionSummary({kind, shortDate, longDate, chefSideStays}: Props) {
  return (
    <View style={styles.root}>
      {kind === 'chefSide' || kind === 'chefAll' ? (
        <ChefSummary all={kind === 'chefAll'} />
      ) : (
        <CustomerSummary all={kind === 'customerAll'} chefSideStays={chefSideStays} longDate={longDate} shortDate={shortDate} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: spacing.md},
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  label: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.semibold, textTransform: 'uppercase'},
  strong: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  line: {color: colors.textSecondary, fontSize: typography.small},
  fill: {flex: 1},
  bullets: {gap: spacing.xs},
  bullet: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs},
  dot: {width: 5, height: 5, marginTop: 8, borderRadius: radius.pill, backgroundColor: colors.textSecondary},
  step: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  number: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  numberText: {color: colors.flameRedAccessible, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  stepCopy: {flex: 1, gap: spacing.xxs},
});
