import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {FieldError, FormField, GroupLabel} from '../../chefMenu/components/DishFormField';
import {pickDishPhoto} from '../../chefMenu/components/dishPhoto';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ConfirmDialog,
  ListGroup,
  ListRow,
  SectionHeader,
  StatusChip,
  useChefToast,
} from '../../chefShell/components/ui';
import {chefProfileApi, type ChefKitchenPhotoKind} from '../api/chefProfileApi';
import {ChipPicker, PhotoTile} from '../components/KitchenFormParts';
import {ReadState} from '../components/ReadState';
import {
  canEditChefKitchenProfile,
  chefEditProfileFormSchema,
  type ChefEditProfileAddressSelection,
  type ChefEditProfileFormValues,
} from '../domain/chefEditProfileForm';
import {useChefEditProfileDraft} from '../state/ChefEditProfileDraftProvider';
import {synchronizeChefProfileAfterSave} from '../state/chefProfileSynchronization';
import {useChefEditProfileModel} from '../state/useChefEditProfileModel';
import {useChefKitchen} from '../state/useChefKitchen';

type FieldErrors = Partial<Record<keyof ChefEditProfileFormValues, string>>;

export const KITCHEN_SAVE_FAILED = "We couldn't save your changes. Please try again.";
const SUGGESTED_CUISINES = ['Andhra', 'Telangana', 'Biryani', 'Tiffins', 'North Indian', 'South Indian', 'Chinese', 'Snacks', 'Sweets', 'Desserts'];
const ADDRESS_FIELDS: readonly {field: keyof ChefEditProfileAddressSelection; label: string}[] = [
  {field: 'addressLine1', label: 'Flat / house number / building'},
  {field: 'addressLine2', label: 'Street / area'},
  {field: 'landmark', label: 'Landmark'},
  {field: 'areaName', label: 'Area'},
  {field: 'postalCode', label: 'PIN code'},
  {field: 'city', label: 'City'},
  {field: 'state', label: 'State'},
];

/** First message of each field, from a failed parse. */
function fieldErrors(values: ChefEditProfileFormValues): FieldErrors | null {
  const result = chefEditProfileFormSchema.safeParse(values);
  if (result.success) {
    return null;
  }
  const found: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof ChefEditProfileFormValues | undefined;
    if (field && !found[field]) {
      found[field] = issue.message;
    }
  }
  return found;
}

const addressLines = (values: ChefEditProfileFormValues) => ({
  street: [values.addressLine1, values.addressLine2].filter(part => part.trim()).join(', '),
  place: [values.areaName, values.city, values.state, values.postalCode].filter(part => part.trim()).join(', '),
});

function ComingSoonField({label}: {label: string}) {
  return (
    <View style={styles.soon}>
      <GroupLabel label={label} />
      <StatusChip label="Coming soon" tone="info" />
    </View>
  );
}

/** Kitchen details: photos, name, about, what you cook, contact, address, delivery areas and links in one form. */
export function ChefEditProfileScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const toast = useChefToast();
  const {kitchen, query, identityId} = useChefKitchen();
  const draft = useChefEditProfileDraft();
  const model = useChefEditProfileModel();
  const [errors, setErrors] = React.useState<FieldErrors>({});

  // Every visit starts from the kitchen as it is now: a stale draft could save an old status over a newer one.
  React.useEffect(() => {
    if (kitchen && !draft.formDraft) {
      draft.begin(kitchen);
    }
  }, [draft, kitchen]);
  const discard = React.useRef(draft.discard);
  discard.current = draft.discard;
  React.useEffect(() => () => discard.current(), []);

  const values = draft.formDraft;
  const readOnly = !draft.originalProfile || !canEditChefKitchenProfile(draft.originalProfile);
  const submitting = model.saveState === 'submitting';
  const [leaving, setLeaving] = React.useState<(() => void) | null>(null);
  const leaveFreely = React.useRef(false);

  React.useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (leaveFreely.current || !draft.dirtyState) {
          return;
        }
        event.preventDefault();
        setLeaving(() => () => {
          leaveFreely.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [draft.dirtyState, navigation],
  );

  const change = <K extends keyof ChefEditProfileFormValues>(field: K, value: ChefEditProfileFormValues[K]) => {
    if (!values || readOnly || submitting) {
      return;
    }
    draft.replaceDraft({...values, [field]: value});
    setErrors(current => ({...current, [field]: undefined}));
    model.clearError();
  };

  const save = async () => {
    if (!values || readOnly || submitting || !draft.dirtyState) {
      return;
    }
    const found = fieldErrors(values);
    setErrors(found ?? {});
    if (found) {
      return;
    }
    if (await model.save()) {
      leaveFreely.current = true;
      toast.show('Kitchen details saved');
      navigation.goBack();
    }
  };

  // Address: edited in a sheet and applied to the form with "Use this address".
  const [addressSheet, setAddressSheet] = React.useState<ChefEditProfileAddressSelection | null>(null);
  const [addressErrors, setAddressErrors] = React.useState<FieldErrors>({});
  const applyAddress = () => {
    if (!values || !addressSheet) {
      return;
    }
    const found = fieldErrors({...values, ...addressSheet});
    const mine: FieldErrors = {};
    for (const {field} of ADDRESS_FIELDS) {
      if (found?.[field]) {
        mine[field] = found[field];
      }
    }
    setAddressErrors(mine);
    if (Object.keys(mine).length === 0) {
      draft.applyAddressSelection(addressSheet);
      setAddressSheet(null);
    }
  };

  // Photos: saved the moment they are chosen, apart from the form.
  const [photoSheet, setPhotoSheet] = React.useState<ChefKitchenPhotoKind | null>(null);
  const [photoSaving, setPhotoSaving] = React.useState<ChefKitchenPhotoKind | null>(null);
  const photoBusy = React.useRef(false);
  /** One photo save at a time. `work` returns the toast to show, or null when the chef cancelled. */
  const runPhoto = async (kind: ChefKitchenPhotoKind, work: () => Promise<string | null>) => {
    if (photoBusy.current || !identityId) {
      return;
    }
    photoBusy.current = true;
    setPhotoSaving(kind);
    try {
      const done = await work();
      if (done) {
        toast.show(done);
      }
    } catch (error) {
      toast.show(isRouteNotPublished(error) ? 'Photos are coming soon.' : "We couldn't save that photo. Please try again.");
    } finally {
      photoBusy.current = false;
      setPhotoSaving(null);
    }
  };
  const choosePhoto = (kind: ChefKitchenPhotoKind, source: 'camera' | 'gallery') => {
    setPhotoSheet(null);
    return runPhoto(kind, async () => {
      const picked = await pickDishPhoto(source);
      if (!picked) {
        return null;
      }
      if ('error' in picked) {
        return picked.error;
      }
      const {photo} = picked;
      const updated = await chefProfileApi.uploadPhoto(kind, {
        uri: photo.uri,
        name: photo.fileName?.trim() || 'craves-photo.jpg',
        type: photo.mimeType || 'image/jpeg',
      });
      await synchronizeChefProfileAfterSave(queryClient, identityId as string, updated);
      return 'Photo saved';
    });
  };
  const removePhoto = (kind: ChefKitchenPhotoKind) => {
    setPhotoSheet(null);
    return runPhoto(kind, async () => {
      await synchronizeChefProfileAfterSave(queryClient, identityId as string, await chefProfileApi.deletePhoto(kind));
      return 'Photo removed';
    });
  };

  const photoUrl = (kind: ChefKitchenPhotoKind) => (kind === 'CHEF' ? kitchen?.chefPhotoUrl : kitchen?.kitchenPhotoUrl);
  const hasCuisines = values?.cuisines !== undefined;
  const hasAreas = values?.serviceAreas !== undefined;
  const hasLinks = values?.instagram !== undefined;
  const address = values ? addressLines(values) : null;

  return (
    <ChefScreen
      footer={
        values ? (
          <>
            {model.saveState === 'error' ? <FieldError message={KITCHEN_SAVE_FAILED} /> : null}
            <ChefActionButton
              busy={submitting}
              disabled={!draft.dirtyState || readOnly}
              label="Save changes"
              onPress={() => {
                save().catch(() => undefined);
              }}
            />
          </>
        ) : undefined
      }
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Kitchen details" />}
      withTabBar>
      <ReadState
        alwaysPublished
        comingSoon={{title: 'Kitchen details are on their way', message: 'You will be able to change your kitchen here soon.'}}
        query={query}>
        {() =>
          values && address ? (
            <>
              {readOnly ? (
                <View accessibilityRole="alert" style={styles.banner}>
                  <Icon color={colors.error} name="shield" size={iconSize.lg} surface={false} />
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerText}>
                    Craves has paused your kitchen, so its details cannot be changed right now.
                  </Text>
                </View>
              ) : null}

              <SectionHeader title="Photos" />
              <View style={styles.photos}>
                <PhotoTile
                  busy={photoSaving === 'CHEF'}
                  icon="account"
                  label="Your photo"
                  onPress={() => setPhotoSheet('CHEF')}
                  url={photoUrl('CHEF')}
                />
                <PhotoTile
                  busy={photoSaving === 'KITCHEN'}
                  icon="store"
                  label="Kitchen photo"
                  onPress={() => setPhotoSheet('KITCHEN')}
                  url={photoUrl('KITCHEN')}
                />
              </View>

              <FormField
                editable={!readOnly}
                error={errors.kitchenName}
                label="Kitchen name"
                maxLength={160}
                onChangeText={text => change('kitchenName', text)}
                required
                value={values.kitchenName}
              />
              <View>
                <FormField
                  editable={!readOnly}
                  error={errors.description}
                  label="About your kitchen"
                  maxLength={2000}
                  multiline
                  onChangeText={text => change('description', text)}
                  value={values.description}
                />
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.counter}>
                  {`${values.description.length} / 2000`}
                </Text>
              </View>

              {hasCuisines ? (
                <ChipPicker
                  addFieldLabel="Add a cuisine"
                  addLabel="+ Add"
                  disabled={readOnly}
                  error={errors.cuisines}
                  label="What you cook"
                  onChange={next => change('cuisines', next)}
                  options={SUGGESTED_CUISINES}
                  selected={values.cuisines ?? []}
                />
              ) : (
                <ComingSoonField label="What you cook" />
              )}

              <SectionHeader title="Contact" />
              <FormField
                autoCapitalize="words"
                editable={!readOnly}
                error={errors.displayName}
                label="Your name"
                maxLength={160}
                onChangeText={text => change('displayName', text)}
                value={values.displayName}
              />
              <FormField
                editable={!readOnly}
                error={errors.phoneNumber}
                keyboardType="phone-pad"
                label="Phone"
                maxLength={40}
                onChangeText={text => change('phoneNumber', text)}
                value={values.phoneNumber}
              />
              <FormField
                autoCapitalize="none"
                editable={!readOnly}
                error={errors.email}
                keyboardType="email-address"
                label="Email"
                maxLength={320}
                onChangeText={text => change('email', text)}
                value={values.email}
              />

              <SectionHeader title="Kitchen address" />
              <ChefCard style={styles.addressCard}>
                <Icon color={colors.flameRed} name="location" size={iconSize.lg} surface={false} />
                <View style={styles.addressText}>
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.addressStreet}>
                    {address.street}
                  </Text>
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                    {address.place}
                  </Text>
                </View>
                <ChefActionButton
                  compact
                  disabled={readOnly}
                  label="Change"
                  onPress={() => {
                    setAddressErrors({});
                    setAddressSheet({});
                  }}
                  tone="ghost"
                />
              </ChefCard>

              {hasAreas ? (
                <ChipPicker
                  addFieldLabel="Add a delivery area"
                  addLabel="+ Add area"
                  disabled={readOnly}
                  error={errors.serviceAreas}
                  label="Delivery areas"
                  onChange={next => change('serviceAreas', next)}
                  options={values.areaName.trim() ? [values.areaName.trim()] : []}
                  selected={values.serviceAreas ?? []}
                />
              ) : (
                <ComingSoonField label="Delivery areas" />
              )}

              {hasLinks ? (
                <>
                  <SectionHeader title="Social links" />
                  {(['instagram', 'facebook', 'youtube', 'website'] as const).map(field => (
                    <FormField
                      autoCapitalize="none"
                      editable={!readOnly}
                      error={errors[field]}
                      helper={field === 'instagram' ? 'Links start with https://' : undefined}
                      key={field}
                      keyboardType="url"
                      label={field === 'youtube' ? 'YouTube' : field.charAt(0).toUpperCase() + field.slice(1)}
                      maxLength={200}
                      onChangeText={text => change(field, text)}
                      value={values[field] ?? ''}
                    />
                  ))}
                </>
              ) : null}
            </>
          ) : null
        }
      </ReadState>

      <ChefSheet onClose={() => setAddressSheet(null)} title="Kitchen address" visible={addressSheet !== null}>
        {addressSheet && values ? (
          <View style={styles.sheet}>
            {ADDRESS_FIELDS.map(({field, label}) => (
              <FormField
                error={addressErrors[field]}
                key={field}
                keyboardType={field === 'postalCode' ? 'number-pad' : 'default'}
                label={label}
                onChangeText={text => setAddressSheet(current => ({...current, [field]: text}))}
                value={String(addressSheet[field] ?? values[field] ?? '')}
              />
            ))}
            <ChefActionButton label="Use this address" onPress={applyAddress} />
          </View>
        ) : null}
      </ChefSheet>

      <ChefSheet onClose={() => setPhotoSheet(null)} title={photoSheet === 'CHEF' ? 'Your photo' : 'Kitchen photo'} visible={photoSheet !== null}>
        {photoSheet ? (
          <ListGroup>
            <ListRow icon="camera" onPress={() => { choosePhoto(photoSheet, 'camera').catch(() => undefined); }} title="Take a photo" />
            <ListRow icon="image" onPress={() => { choosePhoto(photoSheet, 'gallery').catch(() => undefined); }} title="Choose from gallery" />
            {photoUrl(photoSheet) ? (
              <ListRow destructive icon="trash" onPress={() => { removePhoto(photoSheet).catch(() => undefined); }} title="Remove photo" />
            ) : null}
          </ListGroup>
        ) : null}
      </ChefSheet>

      <ConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Leave"
        message="Your changes to the kitchen details will be lost."
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          const leave = leaving;
          setLeaving(null);
          leave?.();
        }}
        title="Leave without saving?"
        tone="danger"
        visible={leaving !== null}
      />
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  banner: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.errorSoft},
  bannerText: {flex: 1, color: colors.error, fontSize: typography.small, fontWeight: fontWeight.semibold},
  photos: {flexDirection: 'row', gap: spacing.xs},
  counter: {marginTop: spacing.xxs, textAlign: 'right', color: colors.textSecondary, fontSize: typography.small},
  soon: {gap: spacing.xs, alignItems: 'flex-start'},
  addressCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm},
  addressText: {flex: 1, minWidth: 0},
  addressStreet: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  muted: {color: colors.textSecondary, fontSize: typography.small},
  sheet: {gap: spacing.sm, paddingBottom: spacing.sm},
});
