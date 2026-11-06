import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, iconSize, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefSheet, ListGroup, ListRow} from '../../chefShell/components/ui';
import type {TaxonomyVocabulary} from '../../dishLabels/api/taxonomyApi';
import {cuisineLineage, toggleCuisine, toggleDiet, type LabelSelection} from '../../dishLabels/domain/dishLabels';
import {FieldError, GroupLabel, OptionChip} from './DishFormField';

interface DishLabelsSectionProps {
  vocabulary: TaxonomyVocabulary;
  selection: LabelSelection;
  onChange: (next: LabelSelection) => void;
  disabled: boolean;
  error: string | null;
}

/** Cuisine (up to 3, the first is the main one) and Diet (up to 6) chips under the dish's More details. */
export function DishLabelsSection({vocabulary, selection, onChange, disabled, error}: DishLabelsSectionProps) {
  const [picking, setPicking] = React.useState(false);
  const [full, setFull] = React.useState(false);

  const cuisineName = (code: string) => vocabulary.cuisines.find(term => term.code === code)?.name ?? code;
  const topLevel = vocabulary.cuisines.filter(term => term.parentCode === null);
  const unchosenTopLevel = topLevel.filter(term => !selection.cuisines.includes(term.code));
  const tapCuisine = (code: string) => {
    const next = toggleCuisine(selection.cuisines, code);
    // toggleCuisine hands back the same list when a fourth is tapped.
    setFull(next === selection.cuisines);
    if (next !== selection.cuisines) {
      onChange({...selection, cuisines: next});
    }
  };
  const hint = full ? (
    <FieldError message="Up to 3 cuisines." />
  ) : (
    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.helper}>
      Up to 3. The first is the main one.
    </Text>
  );

  return (
    <>
      <View style={styles.group}>
        <GroupLabel label="Cuisine" />
        {hint}
        <View style={styles.options}>
          {[...selection.cuisines, ...unchosenTopLevel.map(term => term.code)].map(code => (
            <OptionChip
              accessibilityRole="checkbox"
              disabled={disabled}
              key={code}
              label={cuisineName(code)}
              onPress={() => tapCuisine(code)}
              selected={selection.cuisines.includes(code)}
            />
          ))}
          <OptionChip
            accessibilityLabel="More cuisines"
            accessibilityRole="button"
            disabled={disabled}
            label="More…"
            onPress={() => setPicking(true)}
            selected={false}
          />
        </View>
      </View>
      <View style={styles.group}>
        <GroupLabel label="Diet" />
        <View style={styles.options}>
          {vocabulary.diets.map(term => (
            <OptionChip
              accessibilityRole="checkbox"
              disabled={disabled}
              key={term.code}
              label={term.name}
              onPress={() => onChange({...selection, diets: toggleDiet(selection.diets, term.code)})}
              selected={selection.diets.includes(term.code)}
            />
          ))}
        </View>
        {error ? <FieldError message={error} /> : null}
      </View>

      <ChefSheet onClose={() => setPicking(false)} title="Cuisine" visible={picking}>
        {hint}
        {topLevel.map(top => {
          // Every cuisine below this top-level one, at any depth, in vocabulary order.
          const below = vocabulary.cuisines.filter(term => {
            const lineage = cuisineLineage(term.code, vocabulary);
            return term.parentCode !== null && lineage[lineage.length - 1] === top.code;
          });
          return below.length === 0 ? null : (
            <View key={top.code} style={styles.group}>
              <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.sectionLabel}>
                {top.name}
              </Text>
              <ListGroup>
                {below.map(term => {
                  const chosen = selection.cuisines.includes(term.code);
                  return (
                    <ListRow
                      accessibilityLabel={chosen ? `${term.name}, selected` : term.name}
                      key={term.code}
                      onPress={() => tapCuisine(term.code)}
                      // false, not null: null brings back the row's chevron.
                      right={chosen && <Icon color={colors.flameRedAccessible} name="check" size={iconSize.sm} surface={false} />}
                      title={term.name}
                    />
                  );
                })}
              </ListGroup>
            </View>
          );
        })}
      </ChefSheet>
    </>
  );
}

const styles = StyleSheet.create({
  group: {gap: 6},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  helper: {color: colors.textSecondary, fontSize: typography.small},
  sectionLabel: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.bold},
});
