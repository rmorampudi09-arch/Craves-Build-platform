import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import {usePreventRemove} from '@react-navigation/native';
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
import {ChefMenuCategorySelector} from '../components/ChefMenuCategorySelector';
import {
  CHEF_MENU_FOOD_TYPES,
  CHEF_MENU_SPICE_LEVELS,
  chefMenuApi,
  type ChefMenuItem,
} from '../api/chefMenuApi';
import {
  chefMenuFormSchema,
  chefMenuItemToFormValues,
  type ChefMenuFormValues,
} from '../domain/chefMenuForm';
import {getChefMenuPrimaryImageUrl} from '../domain/chefMenuPresentation';
import {useChefEditMenuItemModel} from '../state/useChefEditMenuItemModel';
import {useChefMenuModel} from '../state/useChefMenuModel';

type Props = NativeStackScreenProps<ChefProductStackParamList, 'ChefEditMenuItem'>;

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

function ChefEditMenuItemForm({
  item,
  navigation,
  refreshMenu,
}: {
  item: ChefMenuItem;
  navigation: Props['navigation'];
  refreshMenu: () => Promise<void>;
}) {
  const model = useChefEditMenuItemModel();
  const [allowExit, setAllowExit] = React.useState(false);
  const [photo, setPhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: {errors, isDirty, isSubmitting},
  } = useForm<ChefMenuFormValues>({
    resolver: zodResolver(chefMenuFormSchema),
    defaultValues: chefMenuItemToFormValues(item),
    mode: 'onBlur',
  });
  const description = watch('description');
  const submitting = model.submitState === 'submitting' || isSubmitting || photoBusy;
  const imageUrl = getChefMenuPrimaryImageUrl(item);
  const displayedImageUrl = photo?.uri ?? imageUrl;
  const hasPendingChanges = isDirty || photo !== null;

  usePreventRemove(hasPendingChanges && !allowExit, ({data}) => {
    Alert.alert(
      'Discard unsaved changes?',
      'Your menu item changes have not been saved.',
      [
        {text: 'Keep editing', style: 'cancel'},
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });

  React.useEffect(() => {
    if (allowExit) {
      navigation.goBack();
    }
  }, [allowExit, navigation]);

  const pickPhoto = React.useCallback(async () => {
    if (submitting) return;
    setPhotoError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo permission required',
          'Allow photo access so you can choose a new primary dish image.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)) {
        setPhotoError('Choose a JPEG, PNG or WebP image.');
        return;
      }
      setPhoto(asset);
    } catch {
      setPhotoError('The photo library could not be opened. Please try again.');
    }
  }, [submitting]);

  const uploadPhoto = React.useCallback(async () => {
    if (!photo) return true;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const formData = new FormData();
      formData.append(
        'file',
        {
          uri: photo.uri,
          name: photo.fileName?.trim() || `craves-dish-${item.id}.jpg`,
          type: photo.mimeType || 'image/jpeg',
        } as unknown as Blob,
      );
      await chefMenuApi.uploadImage(item.id, formData, true);
      return true;
    } catch {
      setPhotoError('The new photo could not be uploaded. Your text changes were saved; retry the photo before leaving.');
      return false;
    } finally {
      setPhotoBusy(false);
    }
  }, [item.id, photo]);

  const saveChanges = handleSubmit(async values => {
    model.clearError();
    setPhotoError(null);
    let updated = item;
    if (isDirty) {
      const submitted = await model.submit(values, item);
      if (!submitted) return;
      updated = submitted;
    }
    if (photo && !(await uploadPhoto())) {
      reset(chefMenuItemToFormValues(updated));
      await refreshMenu().catch(() => undefined);
      return;
    }
    setPhoto(null);
    reset(chefMenuItemToFormValues(updated));
    await refreshMenu().catch(() => undefined);
    setAllowExit(true);
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to menu item"
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
            Edit item
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {item.itemName}
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
            <Text style={styles.title}>Edit menu item</Text>
            <Text style={styles.subtitle}>
              Saving sends the backend’s complete replacement request. Existing status and currency are preserved.
            </Text>
          </View>

          <Section
            title="Food photo"
            description="Choose a new primary image. JPEG, PNG and WebP are accepted by the live catalog service.">
            {displayedImageUrl ? (
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel={`${item.itemName} ${photo ? 'selected replacement' : 'current'} image`}
                resizeMode="cover"
                source={{uri: displayedImageUrl}}
                style={styles.currentImage}
              />
            ) : (
              <View style={styles.mediaFallback}>
                <Icon color={colors.flameRed} name="chef" size={34} />
                <Text style={styles.mediaFallbackText}>No current image</Text>
              </View>
            )}
            <View style={styles.mediaActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={photo ? 'Choose a different dish photo' : 'Choose a new dish photo'}
                disabled={submitting}
                onPress={pickPhoto}
                style={({pressed}) => [styles.mediaAction, (pressed || submitting) && styles.pressed]}>
                <Icon color={colors.flameRed} name="chef" size={20} />
                <Text style={styles.mediaActionText}>{photo ? 'Choose another' : imageUrl ? 'Replace photo' : 'Add photo'}</Text>
              </Pressable>
              {photo ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Discard selected replacement photo"
                  disabled={submitting}
                  onPress={() => { setPhoto(null); setPhotoError(null); }}
                  style={({pressed}) => [styles.mediaAction, (pressed || submitting) && styles.pressed]}>
                  <Icon color={colors.espressoBrown} name="trash" size={20} />
                  <Text style={styles.mediaActionText}>Discard</Text>
                </Pressable>
              ) : null}
            </View>
            {photo ? <Text style={styles.mediaHint}>The selected image will become the primary image when you save.</Text> : null}
            {photoError ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{photoError}</Text> : null}
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
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="category"
              render={({field}) => (
                <ChefMenuCategorySelector
                  disabled={submitting}
                  error={errors.category?.message}
                  onChange={category => {
                    field.onChange(category);
                    field.onBlur();
                  }}
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
                      label={
                        foodType === 'NON_VEG'
                          ? 'Non-veg'
                          : foodType === 'VEG'
                            ? 'Veg'
                            : 'Egg'
                      }
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
                  label={`Price (${item.currency})`}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
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
                  keyboardType="number-pad"
                  label="Packaged weight (grams)"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
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
                  description="This value is part of the exact full replacement request. Customer-live still requires Active status and availability on."
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
              <Text style={styles.contractNoteTitle}>Full replacement safety</Text>
              <Text style={styles.contractNoteText}>
                Status remains {item.status} and currency remains {item.currency}. The editor never sends a guessed partial update or changes publication state implicitly.
              </Text>
            </View>
          </View>

          {model.errorMessage ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>Couldn’t update this item</Text>
              <Text style={styles.errorBannerText}>{model.errorMessage}</Text>
              {model.errorDetails.map((detail, index) => (
                <Text key={`${index}-${detail}`} style={styles.errorDetail}>
                  • {detail}
                </Text>
              ))}
              {model.errorDetails.length > 0 ? (
                <Text style={styles.errorBoundaryText}>
                  Server details are shown without guessed field binding because the current error contract does not expose structured field keys.
                </Text>
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save menu item changes"
            disabled={submitting || !hasPendingChanges}
            onPress={saveChanges}
            style={({pressed}) => [
              styles.primaryAction,
              (pressed || submitting || !hasPendingChanges) && styles.actionDisabled,
            ]}>
            {submitting ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.primaryActionText}>Save changes</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ChefEditMenuItemScreen({navigation, route}: Props) {
  const menu = useChefMenuModel();
  const item = menu.items.find(candidate => candidate.id === route.params.menuItemId);

  if (menu.status === 'pending' && !item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.flameRed} size="large" />
          <Text style={styles.stateTitle}>Loading menu item…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to menu item"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.headerButton}>
            <Icon color={colors.espressoBrown} name="arrow-left" size={22} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.headerTitle}>
              Edit item
            </Text>
          </View>
        </View>
        <View style={styles.centerState}>
          <Icon
            color={menu.status === 'error' ? colors.error : colors.textSecondary}
            name={menu.status === 'error' ? 'wifi-off' : 'chef'}
            size={34}
          />
          <Text style={styles.stateTitle}>Menu item unavailable</Text>
          <Text style={styles.stateMessage}>
            Editing requires the canonical Chef menu list item because no chef-owned detail GET route exists.
          </Text>
          {menu.status === 'error' ? (
            <Pressable
              accessibilityRole="button"
              disabled={menu.isRefreshing}
              onPress={() => menu.refresh().catch(() => undefined)}
              style={styles.retryButton}>
              <Text style={styles.retryButtonText}>
                {menu.isRefreshing ? 'Refreshing…' : 'Try again'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return <ChefEditMenuItemForm item={item} navigation={navigation} refreshMenu={menu.refresh} />;
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
    backgroundColor: colors.iconSurface,
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
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: 2,
  },
  content: {padding: spacing.md, paddingBottom: spacing.xxxl},
  introBlock: {marginBottom: spacing.md},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.body,
    marginTop: spacing.xxs,
  },
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
  currentImage: {borderRadius: radius.md, height: 180, width: '100%'},
  mediaFallback: {
    alignItems: 'center',
    backgroundColor: colors.iconSurface,
    borderRadius: radius.md,
    height: 150,
    justifyContent: 'center',
  },
  mediaFallbackText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  mediaActions: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm},
  mediaAction: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.iconSurface,
  },
  mediaActionText: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  mediaHint: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.xs},
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
  fieldError: {
    color: colors.error,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  fieldHelper: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
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
  choiceChipSelected: {
    backgroundColor: colors.flameRed,
    borderColor: colors.flameRed,
  },
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
  contractNoteText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  errorBannerTitle: {
    color: colors.error,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  errorBannerText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  errorDetail: {
    color: colors.textPrimary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  errorBoundaryText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.sm,
  },
  primaryAction: {
    ...elevation.primaryAction,
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  actionDisabled: {opacity: 0.55},
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  stateMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.flameRed,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  pressed: {opacity: 0.65},
});
