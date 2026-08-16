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
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
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
import {
  CHEF_MENU_FOOD_TYPES,
  CHEF_MENU_SPICE_LEVELS,
  chefMenuApi,
} from '../api/chefMenuApi';
import {ChefMenuCategorySelector} from '../components/ChefMenuCategorySelector';
import {
  chefMenuFormSchema,
  EMPTY_CHEF_MENU_FORM,
  type ChefMenuFormValues,
  type ChefMenuSubmitIntent,
} from '../domain/chefMenuForm';
import {useChefAddMenuItemModel} from '../state/useChefAddMenuItemModel';

type Props = NativeStackScreenProps<ChefProductStackParamList, 'ChefAddMenuItem'>;
const ICON_SURFACE = '#F1F5F9';

function FilledIcon({name, size = 22, color = colors.espressoBrown}: {name: string; size?: number; color?: string}) {
  return <MaterialDesignIcons name={name as never} size={size} color={color} />;
}

function Field({
  label,
  error,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  editable,
}: {
  label: string;
  error?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  editable: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, multiline && styles.multilineInput, !editable && styles.disabledInput]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function ChoiceChip({label, selected, disabled, onPress}: {label: string; selected: boolean; disabled: boolean; onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{checked: selected, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choiceChip, selected && styles.choiceChipSelected, disabled && styles.disabled]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChefAddMenuItemScreen({navigation}: Props) {
  const model = useChefAddMenuItemModel();
  const [photo, setPhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const submitting = model.submitState === 'submitting' || photoBusy;

  const {
    control,
    handleSubmit,
    formState: {errors},
  } = useForm<ChefMenuFormValues>({
    resolver: zodResolver(chefMenuFormSchema),
    defaultValues: EMPTY_CHEF_MENU_FORM,
    mode: 'onBlur',
  });

  const pickPhoto = React.useCallback(async () => {
    if (submitting) return;
    setPhotoError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo permission required',
          'Allow photo access so you can select a dish image for your menu item.',
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

  const uploadPhoto = React.useCallback(async (menuItemId: string) => {
    if (!photo) return true;
    setPhotoBusy(true);
    try {
      const formData = new FormData();
      const fallbackName = `craves-dish-${menuItemId}.jpg`;
      formData.append(
        'file',
        {
          uri: photo.uri,
          name: photo.fileName?.trim() || fallbackName,
          type: photo.mimeType || 'image/jpeg',
        } as unknown as Blob,
      );
      await chefMenuApi.uploadImage(menuItemId, formData, true);
      return true;
    } catch {
      return false;
    } finally {
      setPhotoBusy(false);
    }
  }, [photo]);

  const submit = React.useCallback(
    (intent: ChefMenuSubmitIntent) =>
      handleSubmit(async values => {
        model.clearError();
        setPhotoError(null);
        const created = await model.submit(values, intent);
        if (!created) return;

        const imageUploaded = await uploadPhoto(created.id);
        if (!imageUploaded) {
          Alert.alert(
            'Dish saved, photo needs retry',
            'The menu item was saved successfully, but the selected photo was not uploaded. You can add the photo again from Edit Dish.',
          );
        }
        navigation.replace('ChefMenuItemDetail', {menuItemId: created.id});
      })(),
    [handleSubmit, model, navigation, uploadPhoto],
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => navigation.goBack()}
            style={styles.iconButton}>
            <FilledIcon name="arrow-left" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.title}>Add Dish</Text>
            <Text style={styles.subtitle}>Create the menu item and upload its primary food photo.</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {(model.errorMessage || photoError) ? (
            <View style={styles.errorBanner}>
              <View style={styles.bannerIcon}><FilledIcon name="alert-circle" color={colors.error} /></View>
              <Text style={styles.bannerText}>{model.errorMessage ?? photoError}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}><FilledIcon name="camera" color={colors.flameRed} /></View>
              <View style={styles.sectionCopy}>
                <Text style={styles.sectionTitle}>Food photo</Text>
                <Text style={styles.sectionCaption}>Choose a clear image. It becomes the primary photo after the dish is saved.</Text>
              </View>
            </View>
            {photo ? (
              <View style={styles.photoPreviewWrap}>
                <Image accessibilityIgnoresInvertColors source={{uri: photo.uri}} resizeMode="cover" style={styles.photoPreview} />
                <Pressable accessibilityLabel="Remove selected photo" accessibilityRole="button" disabled={submitting} onPress={() => setPhoto(null)} style={styles.removePhotoButton}>
                  <FilledIcon name="close" size={18} color={colors.white} />
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" disabled={submitting} onPress={pickPhoto} style={styles.photoPicker}>
                <View style={styles.photoPickerIcon}><FilledIcon name="image-plus" size={30} color={colors.flameRed} /></View>
                <Text style={styles.photoPickerTitle}>Choose dish photo</Text>
                <Text style={styles.photoPickerText}>JPEG, PNG or WebP · crop to 4:3</Text>
              </Pressable>
            )}
            {photo ? (
              <Pressable accessibilityRole="button" disabled={submitting} onPress={pickPhoto} style={styles.secondaryButton}>
                <FilledIcon name="image-edit" size={18} color={colors.flameRed} />
                <Text style={styles.secondaryButtonText}>Choose another photo</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}><FilledIcon name="food-variant" color={colors.flameRed} /></View>
              <View style={styles.sectionCopy}>
                <Text style={styles.sectionTitle}>Dish details</Text>
                <Text style={styles.sectionCaption}>Customer-facing information from the Catalog service.</Text>
              </View>
            </View>

            <Controller
              control={control}
              name="itemName"
              render={({field}) => <Field editable={!submitting} error={errors.itemName?.message} label="Dish name" onChangeText={field.onChange} placeholder="Homestyle dal rice" value={field.value} />}
            />
            <Controller
              control={control}
              name="description"
              render={({field}) => <Field editable={!submitting} error={errors.description?.message} label="Description" multiline onChangeText={field.onChange} placeholder="Describe the dish, ingredients and style" value={field.value} />}
            />
            <Controller
              control={control}
              name="category"
              render={({field}) => <ChefMenuCategorySelector disabled={submitting} error={errors.category?.message} onChange={field.onChange} value={field.value} />}
            />

            <Text style={styles.fieldLabel}>Food type</Text>
            <Controller
              control={control}
              name="foodType"
              render={({field}) => (
                <View style={styles.choiceRow}>
                  {CHEF_MENU_FOOD_TYPES.map(type => <ChoiceChip key={type} disabled={submitting} label={type === 'NON_VEG' ? 'Non-veg' : type === 'EGG' ? 'Egg' : 'Veg'} selected={field.value === type} onPress={() => field.onChange(type)} />)}
                </View>
              )}
            />

            <Controller
              control={control}
              name="price"
              render={({field}) => <Field editable={!submitting} error={errors.price?.message} keyboardType="decimal-pad" label="Price (₹)" onChangeText={field.onChange} placeholder="180" value={field.value} />}
            />
            <View style={styles.twoColumns}>
              <View style={styles.column}>
                <Controller
                  control={control}
                  name="servesCount"
                  render={({field}) => <Field editable={!submitting} error={errors.servesCount?.message} keyboardType="number-pad" label="Serves" onChangeText={field.onChange} placeholder="1" value={field.value} />}
                />
              </View>
              <View style={styles.column}>
                <Controller
                  control={control}
                  name="preparationTimeMinutes"
                  render={({field}) => <Field editable={!submitting} error={errors.preparationTimeMinutes?.message} keyboardType="number-pad" label="Prep minutes" onChangeText={field.onChange} placeholder="25" value={field.value} />}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Spice level</Text>
            <Controller
              control={control}
              name="spiceLevel"
              render={({field}) => (
                <View style={styles.choiceRow}>
                  <ChoiceChip disabled={submitting} label="Not set" selected={field.value === ''} onPress={() => field.onChange('')} />
                  {CHEF_MENU_SPICE_LEVELS.map(level => <ChoiceChip key={level} disabled={submitting} label={level.charAt(0) + level.slice(1).toLowerCase()} selected={field.value === level} onPress={() => field.onChange(level)} />)}
                </View>
              )}
            />

            <Controller
              control={control}
              name="unitPackageWeightGrams"
              render={({field}) => <Field editable={!submitting} error={errors.unitPackageWeightGrams?.message} keyboardType="number-pad" label="Packed weight (grams)" onChangeText={field.onChange} placeholder="450" value={field.value} />}
            />

            <Controller
              control={control}
              name="thermoboxRequired"
              render={({field}) => (
                <View style={styles.switchRow}>
                  <View style={styles.switchIcon}><FilledIcon name="package-variant-closed" color={colors.flameRed} /></View>
                  <View style={styles.switchCopy}><Text style={styles.switchTitle}>Thermobox required</Text><Text style={styles.switchText}>Tell delivery operations this dish needs insulated handling.</Text></View>
                  <Switch disabled={submitting} onValueChange={field.onChange} thumbColor={colors.white} trackColor={{false: colors.borderStrong, true: colors.flameRed}} value={field.value} />
                </View>
              )}
            />

            <Controller
              control={control}
              name="available"
              render={({field}) => (
                <View style={styles.switchRow}>
                  <View style={styles.switchIcon}><FilledIcon name="store-check" color={colors.flameRed} /></View>
                  <View style={styles.switchCopy}><Text style={styles.switchTitle}>Available for ordering</Text><Text style={styles.switchText}>This applies when publishing the item as Active.</Text></View>
                  <Switch disabled={submitting} onValueChange={field.onChange} thumbColor={colors.white} trackColor={{false: colors.borderStrong, true: colors.flameRed}} value={field.value} />
                </View>
              )}
            />
          </View>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={() => submit('SAVE_DRAFT')} style={[styles.draftButton, submitting && styles.disabled]}>
              <FilledIcon name="content-save" color={colors.flameRed} />
              <Text style={styles.draftButtonText}>Save Draft</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={submitting} onPress={() => submit('ADD_ITEM')} style={[styles.publishButton, submitting && styles.disabled]}>
              {submitting ? <ActivityIndicator color={colors.white} /> : <><FilledIcon name="check-circle" color={colors.white} /><Text style={styles.publishButtonText}>Add Dish</Text></>}
            </Pressable>
          </View>
          <Text style={styles.footerNote}>Photo upload happens only after the backend creates the menu item. If the upload fails, the dish remains safely saved and can be edited without duplication.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.white},
  flex: {flex: 1},
  header: {minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border},
  iconButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  headerCopy: {minWidth: 0, flex: 1},
  title: {color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.extrabold},
  subtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  content: {padding: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md},
  card: {gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, ...elevation.card},
  sectionHeading: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  sectionIcon: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  sectionCopy: {minWidth: 0, flex: 1},
  sectionTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  sectionCaption: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 17},
  errorBanner: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.errorSoft},
  bannerIcon: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: ICON_SURFACE},
  bannerText: {minWidth: 0, flex: 1, color: colors.error, fontSize: typography.small, lineHeight: 19},
  photoPicker: {minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surfaceBase},
  photoPickerIcon: {width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: ICON_SURFACE},
  photoPickerTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  photoPickerText: {color: colors.textSecondary, fontSize: typography.tiny},
  photoPreviewWrap: {position: 'relative', overflow: 'hidden', borderRadius: radius.lg, backgroundColor: ICON_SURFACE},
  photoPreview: {width: '100%', aspectRatio: 4 / 3},
  removePhotoButton: {position: 'absolute', top: spacing.xs, right: spacing.xs, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.espressoBrown},
  secondaryButton: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  secondaryButtonText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  fieldBlock: {gap: spacing.xxs},
  fieldLabel: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  input: {minHeight: touchTarget.minimum, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white, color: colors.espressoBrown, fontSize: typography.body},
  multilineInput: {minHeight: 96, paddingTop: spacing.sm},
  disabledInput: {backgroundColor: colors.surfaceMuted, opacity: 0.65},
  errorText: {color: colors.error, fontSize: typography.tiny},
  choiceRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  choiceChip: {minHeight: touchTarget.minimum, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: ICON_SURFACE},
  choiceChipSelected: {borderColor: colors.flameRed, backgroundColor: colors.flameRed},
  choiceText: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  choiceTextSelected: {color: colors.white},
  twoColumns: {flexDirection: 'row', gap: spacing.sm},
  column: {minWidth: 0, flex: 1},
  switchRow: {minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxs},
  switchIcon: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  switchCopy: {minWidth: 0, flex: 1},
  switchTitle: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  switchText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 17},
  actions: {flexDirection: 'row', gap: spacing.sm},
  draftButton: {minHeight: touchTarget.comfortable, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.flameRed, backgroundColor: colors.white},
  draftButtonText: {color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.bold},
  publishButton: {minHeight: touchTarget.comfortable, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.flameRed},
  publishButtonText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.bold},
  footerNote: {color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 17, textAlign: 'center'},
  disabled: {opacity: 0.45},
});
