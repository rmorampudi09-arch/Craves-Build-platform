import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {
  CHEF_MENU_FOOD_TYPES,
  CHEF_MENU_IMAGE_CONTENT_TYPES,
  CHEF_MENU_SPICE_LEVELS,
} from '../api/chefMenuApi';
import {
  EMPTY_CHEF_MENU_FORM,
  chefMenuFormSchema,
  type ChefMenuFormValues,
  type ChefMenuSubmitIntent,
} from '../domain/chefMenuForm';
import {useChefAddMenuItemModel} from '../state/useChefAddMenuItemModel';

type Props = NativeStackScreenProps<ChefProductStackParamList, 'ChefAddMenuItem'>;

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
};

function FormField({label, error, helper, style, ...props}: FormFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, props.multiline && styles.multilineInput, style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {!error && helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{checked: selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.choiceChip,
        selected && styles.choiceChipSelected,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityState={{checked: value, disabled}}
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={colors.white}
        trackColor={{false: colors.borderStrong, true: colors.flameRed}}
        value={value}
      />
    </View>
  );
}

function mediaTypeLabel(contentType: (typeof CHEF_MENU_IMAGE_CONTENT_TYPES)[number]) {
  if (contentType === 'image/jpeg') {
    return 'JPEG';
  }
  if (contentType === 'image/png') {
    return 'PNG';
  }
  return 'WebP';
}

export function ChefAddMenuItemScreen({navigation}: Props) {
  const model = useChefAddMenuItemModel();
  const {
    control,
    handleSubmit,
    watch,
    formState: {errors, isSubmitting},
  } = useForm<ChefMenuFormValues>({
    resolver: zodResolver(chefMenuFormSchema),
    defaultValues: EMPTY_CHEF_MENU_FORM,
    mode: 'onBlur',
  });
  const description = watch('description');
  const submitting = model.submitState === 'submitting' || isSubmitting;

  const submitAndReturn = React.useCallback(
    async (values: ChefMenuFormValues, intent: ChefMenuSubmitIntent) => {
      model.clearError();
      const created = await model.submit(values, intent);
      if (created) {
        navigation.goBack();
      }
    },
    [model, navigation],
  );

  const saveDraft = handleSubmit(values => submitAndReturn(values, 'SAVE_DRAFT'));
  const addItem = handleSubmit(values => submitAndReturn(values, 'ADD_ITEM'));

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to Chef menu"
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [
            styles.headerButton,
            (pressed || submitting) && styles.pressed,
          ]}>
          <Icon color={colors.espressoBrown} name="arrow-left" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>
            Add new item
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            Chef Menu
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.introBlock}>
            <Text style={styles.title}>Create a menu item</Text>
            <Text style={styles.subtitle}>
              Add the exact selling and delivery details used by the current Chef catalog contract.
            </Text>
          </View>

          <Section
            title="Food photos"
            description="The current service accepts uploaded JPEG, PNG, and WebP images after an item exists.">
            <View style={styles.mediaBoundary}>
              <View style={styles.mediaIcon}>
                <Icon color={colors.flameRed} name="chef" size={28} />
              </View>
              <View style={styles.mediaCopy}>
                <Text style={styles.mediaTitle}>Photo selection is not enabled yet</Text>
                <Text style={styles.mediaDescription}>
                  This app build has no approved native image picker, and the deployed maximum file size and image-count policy are not exposed to mobile. The form will not pretend an upload succeeded.
                </Text>
                <View style={styles.typeRow}>
                  {CHEF_MENU_IMAGE_CONTENT_TYPES.map(type => (
                    <View key={type} style={styles.typePill}>
                      <Text style={styles.typePillText}>{mediaTypeLabel(type)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </Section>

          <Section title="Basic details">
            <Controller
              control={control}
              name="itemName"
              render={({field}) => (
                <FormField
                  autoCapitalize="words"
                  error={errors.itemName?.message}
                  label="Item name"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="e.g. Paneer Tikka"
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="category"
              render={({field}) => (
                <FormField
                  autoCapitalize="words"
                  error={errors.category?.message}
                  helper="Category options are not provided by the current server, so enter the category name."
                  label="Category"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="e.g. Starters"
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({field}) => (
                <FormField
                  error={errors.description?.message}
                  label="Description"
                  multiline
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="Describe the dish"
                  textAlignVertical="top"
                  value={field.value}
                />
              )}
            />
            <Text accessibilityLiveRegion="polite" style={styles.counterText}>
              {description.length} characters
            </Text>
          </Section>

          <Section title="Food preference">
            <Text style={styles.groupLabel}>Food type</Text>
            <Controller
              control={control}
              name="foodType"
              render={({field}) => (
                <View style={styles.chipRow}>
                  {CHEF_MENU_FOOD_TYPES.map(foodType => (
                    <ChoiceChip
                      key={foodType}
                      label={foodType === 'NON_VEG' ? 'Non-veg' : foodType === 'VEG' ? 'Veg' : 'Egg'}
                      onPress={() => field.onChange(foodType)}
                      selected={field.value === foodType}
                    />
                  ))}
                </View>
              )}
            />

            <Text style={[styles.groupLabel, styles.groupLabelSpaced]}>Spice level</Text>
            <Controller
              control={control}
              name="spiceLevel"
              render={({field}) => (
                <View style={styles.chipRow}>
                  <ChoiceChip
                    label="Not set"
                    onPress={() => field.onChange('')}
                    selected={field.value === ''}
                  />
                  {CHEF_MENU_SPICE_LEVELS.map(spice => (
                    <ChoiceChip
                      key={spice}
                      label={spice.charAt(0) + spice.slice(1).toLowerCase()}
                      onPress={() => field.onChange(spice)}
                      selected={field.value === spice}
                    />
                  ))}
                </View>
              )}
            />
          </Section>

          <Section title="Price and serving">
            <Controller
              control={control}
              name="price"
              render={({field}) => (
                <FormField
                  error={errors.price?.message}
                  keyboardType="decimal-pad"
                  label="Price (INR)"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="0.00"
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="servesCount"
              render={({field}) => (
                <FormField
                  error={errors.servesCount?.message}
                  keyboardType="number-pad"
                  label="Serves (optional)"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="e.g. 2"
                  value={field.value}
                />
              )}
            />
          </Section>

          <Section title="Preparation and delivery">
            <Controller
              control={control}
              name="preparationTimeMinutes"
              render={({field}) => (
                <FormField
                  error={errors.preparationTimeMinutes?.message}
                  keyboardType="number-pad"
                  label="Preparation time in minutes (optional)"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="e.g. 30"
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="unitPackageWeightGrams"
              render={({field}) => (
                <FormField
                  error={errors.unitPackageWeightGrams?.message}
                  helper="Required by the current delivery contract before an item can be sold."
                  keyboardType="number-pad"
                  label="Packaged weight (grams)"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="e.g. 450"
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="thermoboxRequired"
              render={({field}) => (
                <ToggleRow
                  description="Specify whether this item requires a thermobox for delivery."
                  disabled={submitting}
                  label="Thermobox required"
                  onValueChange={field.onChange}
                  value={field.value}
                />
              )}
            />
          </Section>

          <Section title="Availability">
            <Controller
              control={control}
              name="available"
              render={({field}) => (
                <ToggleRow
                  description="Availability is saved independently. A customer can see the item only when status is Active and availability is on."
                  disabled={submitting}
                  label="Available for sale"
                  onValueChange={field.onChange}
                  value={field.value}
                />
              )}
            />
          </Section>

          <View style={styles.contractNote}>
            <Icon color={colors.warning} name="shield" size={21} />
            <View style={styles.contractNoteCopy}>
              <Text style={styles.contractNoteTitle}>Current draft limitation</Text>
              <Text style={styles.contractNoteText}>
                Save as Draft still requires item name, category, food type, price, packaged weight, and thermobox choice because the backend has no incomplete-draft contract.
              </Text>
            </View>
          </View>

          {model.errorMessage ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>Couldn’t save this item</Text>
              <Text style={styles.errorBannerText}>{model.errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save menu item as draft"
              disabled={submitting}
              onPress={saveDraft}
              style={({pressed}) => [
                styles.secondaryAction,
                (pressed || submitting) && styles.actionDisabled,
              ]}>
              <Text style={styles.secondaryActionText}>Save as Draft</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add menu item"
              disabled={submitting}
              onPress={addItem}
              style={({pressed}) => [
                styles.primaryAction,
                (pressed || submitting) && styles.actionDisabled,
              ]}>
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.primaryActionText}>Add Item</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  safeArea: {flex: 1, backgroundColor: colors.surfaceMuted},
  header: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: touchTarget.minimum,
    justifyContent: 'center',
    width: touchTarget.minimum,
  },
  headerCopy: {flex: 1, marginLeft: spacing.xs},
  headerTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSubtitle: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: 2},
  content: {padding: spacing.md, paddingBottom: spacing.xxxl},
  introBlock: {marginBottom: spacing.md},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {color: colors.textSecondary, fontSize: typography.body, marginTop: spacing.xxs},
  sectionCard: {
    ...elevation.card,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  sectionBody: {marginTop: spacing.md},
  fieldBlock: {marginBottom: spacing.md},
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceBase,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: typography.body,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  multilineInput: {minHeight: 112},
  fieldError: {color: colors.error, fontSize: typography.small, marginTop: spacing.xxs},
  fieldHelper: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.xxs},
  counterText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: -spacing.sm,
    textAlign: 'right',
  },
  groupLabel: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  groupLabelSpaced: {marginTop: spacing.md},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  choiceChip: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
  },
  choiceChipSelected: {backgroundColor: colors.flameRed, borderColor: colors.flameRed},
  choiceChipText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  choiceChipTextSelected: {color: colors.white},
  toggleRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.md},
  toggleCopy: {flex: 1},
  toggleTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  toggleDescription: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  mediaBoundary: {
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  mediaIcon: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  mediaCopy: {flex: 1},
  mediaTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  mediaDescription: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xxs},
  typeRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm},
  typePill: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  typePillText: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  contractNote: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  contractNoteCopy: {flex: 1},
  contractNoteTitle: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  contractNoteText: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xxs},
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  errorBannerTitle: {color: colors.error, fontSize: typography.small, fontWeight: fontWeight.bold},
  errorBannerText: {color: colors.textPrimary, fontSize: typography.small, marginTop: spacing.xxs},
  actions: {flexDirection: 'row', gap: spacing.sm},
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.flameRed,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
  },
  secondaryActionText: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  primaryAction: {
    ...elevation.primaryAction,
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
  },
  primaryActionText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.bold},
  actionDisabled: {opacity: 0.55},
  pressed: {opacity: 0.65},
});
