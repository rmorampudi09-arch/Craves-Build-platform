import React from 'react';
import {Image, InteractionManager, Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {usePreventRemove} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {IconButton} from '../../../shared/components/IconButton';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {
  ChefActionButton,
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ConfirmDialog,
  ListGroup,
  ListRow,
  VegMark,
  useChefToast,
} from '../../chefShell/components/ui';
import {CHEF_MENU_FOOD_TYPES, CHEF_MENU_SPICE_LEVELS, type ChefMenuItem} from '../api/chefMenuApi';
import {ChefMenuCategorySelector} from '../components/ChefMenuCategorySelector';
import {FormField, GroupLabel, OptionChip} from '../components/DishFormField';
import {pickDishPhoto, uploadDishPhoto, type DishPhoto, type DishPhotoSource} from '../components/dishPhoto';
import {
  EMPTY_CHEF_MENU_FORM,
  chefMenuFormSchema,
  chefMenuItemToFormValues,
  type ChefMenuFormValues,
  type ChefMenuSubmitIntent,
} from '../domain/chefMenuForm';
import {getChefMenuPrimaryImageUrl} from '../domain/chefMenuPresentation';
import {useChefAddMenuItemModel} from '../state/useChefAddMenuItemModel';
import {useChefEditMenuItemModel} from '../state/useChefEditMenuItemModel';
import {useChefMenuModel, type ChefMenuModel} from '../state/useChefMenuModel';
import {useDishSwitch} from '../state/useDishSwitch';

export type ChefDishFormScreenProps =
  | ({mode: 'add'} & NativeStackScreenProps<ChefProductStackParamList, 'ChefAddMenuItem'>)
  | ({mode: 'edit'} & NativeStackScreenProps<ChefProductStackParamList, 'ChefEditMenuItem'>);

type Navigation = ChefDishFormScreenProps['navigation'];

const FOOD_LABELS = {VEG: 'Veg', NON_VEG: 'Non-veg', EGG: 'Egg'} as const;
const SPICE_LABELS = {MILD: 'Mild', MEDIUM: 'Medium', SPICY: 'Spicy'} as const;

/** What the on/off card says about a dish, and whether it has a switch. */
function statusCopy(dish: ChefMenuItem): {title: string; subtitle: string; tone: 'on' | 'plain'; canSwitch: boolean} {
  if (dish.status === 'DRAFT') {
    return {title: "Draft · customers can't see it yet", subtitle: "Publish it when it's ready", tone: 'plain', canSwitch: false};
  }
  if (dish.status === 'INACTIVE') {
    return {title: 'Off · not on your kitchen page', subtitle: 'Customers cannot order it', tone: 'plain', canSwitch: false};
  }
  return dish.available
    ? {title: 'On · customers can order', subtitle: 'Live on your kitchen page', tone: 'on', canSwitch: true}
    : {title: "Off · customers can't order", subtitle: 'Switch on to show it on your kitchen page', tone: 'plain', canSwitch: true};
}

/**
 * One form for adding and editing a dish. Add asks for the photo, the required fields and offers Save draft or Publish dish;
 * edit opens the dish with its photo and on/off switch on top and Save changes at the bottom.
 */
export function ChefDishFormScreen(props: ChefDishFormScreenProps) {
  const {mode, navigation} = props;
  const menu = useChefMenuModel();
  const wantedId = props.mode === 'edit' ? props.route.params.menuItemId : props.route.params?.copyOfMenuItemId;
  const found = wantedId ? menu.items.find(item => item.id === wantedId) : undefined;
  // A deleted dish leaves the list before this screen has gone back: keep showing it until it has.
  const lastKnown = React.useRef<ChefMenuItem | undefined>(undefined);
  if (found) {
    lastKnown.current = found;
  }
  const dish = found ?? (lastKnown.current?.id === wantedId ? lastKnown.current : undefined);
  const waiting = menu.status === 'pending' && menu.items.length === 0;

  if (wantedId && !dish && (mode === 'edit' || waiting)) {
    return <DishUnavailable mode={mode} navigation={navigation} menu={menu} waiting={waiting} />;
  }
  return <DishForm dish={dish} menu={menu} mode={mode} navigation={navigation} />;
}

function DishUnavailable({
  mode,
  navigation,
  menu,
  waiting,
}: {
  mode: 'add' | 'edit';
  navigation: Navigation;
  menu: ChefMenuModel;
  waiting: boolean;
}) {
  const failed = menu.status === 'error';
  return (
    <ChefScreen
      header={
        <ChefTopBar
          backIcon={mode === 'add' ? 'close' : 'arrow-left'}
          onBack={() => navigation.goBack()}
          showBell={false}
          title={mode === 'add' ? 'New dish' : 'Dish'}
        />
      }>
      {waiting ? (
        <View style={styles.loading}>
          <SkeletonBlock borderRadius={radius.md} height={170} width="100%" />
          <SkeletonBlock height={26} width="60%" />
          <SkeletonBlock borderRadius={radius.md} height={48} width="100%" />
        </View>
      ) : (
        <View style={styles.unavailable}>
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.unavailableTitle}>
            {failed ? "Couldn't load this dish" : 'This dish is not on your menu any more'}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.unavailableMessage}>
            {failed ? 'Check your connection and try again.' : 'It may have been deleted.'}
          </Text>
          <ChefActionButton
            label={failed ? 'Try again' : 'Back to menu'}
            onPress={() => (failed ? menu.refresh().catch(() => undefined) : navigation.goBack())}
          />
        </View>
      )}
    </ChefScreen>
  );
}

type Sheet = 'photo' | 'options' | null;

function DishForm({
  dish,
  menu,
  mode,
  navigation,
}: {
  /** Edit: the dish being edited. Add: the dish being copied, if any. */
  dish: ChefMenuItem | undefined;
  menu: ChefMenuModel;
  mode: 'add' | 'edit';
  navigation: Navigation;
}) {
  const editing = mode === 'edit' && dish !== undefined;
  const toast = useChefToast();
  const addModel = useChefAddMenuItemModel();
  const editModel = useChefEditMenuItemModel();
  const setOn = useDishSwitch(menu.updateAvailability);

  const [photo, setPhoto] = React.useState<DishPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [pendingLeave, setPendingLeave] = React.useState<unknown>(null);
  const [leaving, setLeaving] = React.useState(false);

  const initialValues = React.useMemo<ChefMenuFormValues>(() => {
    if (!dish) {
      return EMPTY_CHEF_MENU_FORM;
    }
    const values = chefMenuItemToFormValues(dish);
    return editing ? values : {...values, itemName: `Copy of ${dish.itemName}`, available: false};
    // Only the first dish counts: later list refreshes must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const {
    control,
    handleSubmit,
    reset,
    formState: {errors, isDirty},
  } = useForm<ChefMenuFormValues>({
    resolver: zodResolver(chefMenuFormSchema),
    defaultValues: initialValues,
    mode: 'onBlur',
  });

  const model = editing ? editModel : addModel;
  const busy = model.submitState === 'submitting' || photoBusy;
  const changed = isDirty || photo !== null;

  // Leaving with something typed asks first; every way out (X, Back, the system back) goes through here.
  usePreventRemove(changed && !leaving, ({data}) => setPendingLeave(data.action));
  React.useEffect(() => {
    if (leaving) {
      navigation.goBack();
    }
  }, [leaving, navigation]);
  const finish = (message: string) => {
    toast.show(message);
    setLeaving(true);
  };

  // Two Modals swapping in one tick misbehave on Android: close the sheet first, then do what it was for.
  const afterSheet = React.useRef<(() => void) | null>(null);
  const closeSheetThen = (next: () => void) => {
    afterSheet.current = next;
    setSheet(null);
  };
  React.useEffect(() => {
    if (sheet !== null || !afterSheet.current) {
      return undefined;
    }
    const next = afterSheet.current;
    afterSheet.current = null;
    const task = InteractionManager.runAfterInteractions(next);
    return () => task.cancel();
  }, [sheet]);

  const choosePhoto = async (source: DishPhotoSource) => {
    const picked = await pickDishPhoto(source);
    if (!picked) {
      return;
    }
    if ('error' in picked) {
      setPhotoError(picked.error);
      return;
    }
    setPhotoError(null);
    setPhoto(picked.photo);
  };

  const sendPhoto = async (menuItemId: string): Promise<boolean> => {
    if (!photo) {
      return true;
    }
    setPhotoBusy(true);
    try {
      return await uploadDishPhoto(menuItemId, photo);
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveNew = (intent: ChefMenuSubmitIntent) =>
    handleSubmit(async values => {
      addModel.clearError();
      setPhotoError(null);
      const created = await addModel.submit(values, intent);
      if (!created) {
        return;
      }
      const uploaded = await sendPhoto(created.id);
      if (photo) {
        await menu.refresh().catch(() => undefined);
      }
      finish(
        !uploaded
          ? `${created.itemName} is saved, but the photo didn't upload. Open the dish to add it again.`
          : intent === 'ADD_ITEM'
            ? `${created.itemName} is live`
            : 'Draft saved',
      );
    })();

  const saveEdit = (publish: boolean) =>
    handleSubmit(async values => {
      if (!dish) {
        return;
      }
      editModel.clearError();
      setPhotoError(null);
      let saved = dish;
      if (isDirty || publish) {
        // The switch saves by itself, so what it holds now wins over what the form opened with.
        const submitted = await editModel.submit({...values, available: dish.available}, dish, publish);
        if (!submitted) {
          return;
        }
        saved = submitted;
      }
      if (photo) {
        const uploaded = await sendPhoto(dish.id);
        await menu.refresh().catch(() => undefined);
        if (!uploaded) {
          reset(chefMenuItemToFormValues(saved));
          setPhotoError("The new photo didn't upload. Your other changes are saved. Try the photo again.");
          return;
        }
      }
      setPhoto(null);
      reset(chefMenuItemToFormValues(saved));
      finish(publish ? `${saved.itemName} is live` : 'Changes saved');
    })();

  const deleteDish = async () => {
    if (!dish) {
      return;
    }
    const outcome = await editModel.remove(dish);
    if (outcome === null) {
      return;
    }
    setConfirmingDelete(false);
    if (outcome === 'deleted') {
      finish(`${dish.itemName} deleted`);
    } else if (outcome === 'coming-soon') {
      toast.show('Deleting dishes is coming soon.');
    } else {
      toast.show(`We couldn't delete ${dish.itemName}. If it's in a meal plan, change the plan first.`);
    }
  };

  const shownPhoto = photo?.uri ?? (editing && dish ? getChefMenuPrimaryImageUrl(dish) : null);
  const status = editing && dish ? statusCopy(dish) : null;
  const isDraft = editing && dish?.status === 'DRAFT';

  return (
    <ChefScreen
      footer={
        editing ? (
          <View style={styles.buttons}>
            <ChefActionButton
              busy={busy && !isDraft}
              disabled={!changed || busy}
              label="Save changes"
              onPress={() => saveEdit(false)}
              style={styles.flex}
              tone={isDraft ? 'neutral' : 'primary'}
            />
            {isDraft ? (
              <ChefActionButton busy={busy} label="Publish dish" onPress={() => saveEdit(true)} style={styles.flex2} />
            ) : null}
          </View>
        ) : (
          <View style={styles.buttons}>
            <ChefActionButton disabled={busy} label="Save draft" onPress={() => saveNew('SAVE_DRAFT')} style={styles.flex} tone="neutral" />
            <ChefActionButton busy={busy} label="Publish dish" onPress={() => saveNew('ADD_ITEM')} style={styles.flex2} />
          </View>
        )
      }
      header={
        <ChefTopBar
          backIcon={editing ? 'arrow-left' : 'close'}
          onBack={() => navigation.goBack()}
          right={
            editing ? <IconButton accessibilityLabel="Dish options" icon="more" onPress={() => setSheet('options')} /> : undefined
          }
          showBell={false}
          title={editing && dish ? dish.itemName : 'New dish'}
        />
      }>
      {model.errorMessage ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorBanner}>
          <Icon color={colors.flameRedAccessible} name="alert" size={iconSize.md} surface={false} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorBannerText}>
            {model.errorMessage}
          </Text>
        </View>
      ) : null}

      <View>
        {shownPhoto ? (
          <View>
            <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{uri: shownPhoto}} style={styles.photo} />
            <Pressable
              accessibilityLabel="Change photo"
              accessibilityRole="button"
              disabled={busy}
              hitSlop={{top: 4, bottom: 4}}
              onPress={() => setSheet('photo')}
              style={styles.changePhoto}>
              <Icon color={colors.white} name="camera" size={iconSize.sm} surface={false} />
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.changePhotoText}>
                Change photo
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel="Add a photo"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => setSheet('photo')}
            style={styles.photoEmpty}>
            <Icon color={colors.flameRedAccessible} name="camera-plus" size={iconSize.xl} surface={false} />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.photoTitle}>
              Add a photo
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.photoHint}>
              Take a photo or choose from gallery
            </Text>
          </Pressable>
        )}
        {photoError ? (
          <Text accessibilityLiveRegion="assertive" style={styles.photoError}>
            {photoError}
          </Text>
        ) : null}
      </View>

      {status && dish ? (
        <View style={[styles.statusCard, status.tone === 'on' && styles.statusCardOn]}>
          <View style={styles.statusText}>
            <Text
              allowFontScaling={textDefaults.allowFontScaling}
              style={[styles.statusTitle, status.tone === 'on' && styles.statusTitleOn]}>
              {status.title}
            </Text>
            <Text
              allowFontScaling={textDefaults.allowFontScaling}
              style={[styles.statusSubtitle, status.tone === 'on' && styles.statusTitleOn]}>
              {status.subtitle}
            </Text>
          </View>
          {status.canSwitch ? (
            <Switch
              accessibilityLabel={`${dish.itemName} availability`}
              accessibilityState={{busy: Boolean(menu.availabilityStateByItem[dish.id]), checked: dish.available}}
              disabled={Boolean(menu.availabilityStateByItem[dish.id])}
              onValueChange={on => setOn(dish, on)}
              thumbColor={colors.white}
              trackColor={{false: colors.borderStrong, true: colors.success}}
              value={dish.available}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.form}>
        <Controller
          control={control}
          name="itemName"
          render={({field}) => (
            <FormField
              autoCapitalize="sentences"
              editable={!busy}
              error={errors.itemName?.message}
              label="Dish name"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="e.g. Homestyle dal rice"
              required
              value={field.value}
            />
          )}
        />
        <View style={styles.group}>
          <GroupLabel label="Veg or non-veg" required />
          <Controller
            control={control}
            name="foodType"
            render={({field}) => (
              <View style={styles.options}>
                {CHEF_MENU_FOOD_TYPES.map(type => (
                  <OptionChip
                    disabled={busy}
                    key={type}
                    label={FOOD_LABELS[type]}
                    mark={<VegMark type={type} />}
                    onPress={() => field.onChange(type)}
                    selected={field.value === type}
                  />
                ))}
              </View>
            )}
          />
        </View>
        <Controller
          control={control}
          name="category"
          render={({field}) => (
            <ChefMenuCategorySelector
              disabled={busy}
              error={errors.category?.message}
              onChange={category => {
                field.onChange(category);
                field.onBlur();
              }}
              value={field.value}
            />
          )}
        />
        <View style={styles.columns}>
          <View style={styles.flex}>
            <Controller
              control={control}
              name="price"
              render={({field}) => (
                <FormField
                  editable={!busy}
                  error={errors.price?.message}
                  keyboardType="decimal-pad"
                  label="Price"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="180"
                  prefix="₹"
                  required
                  value={field.value}
                />
              )}
            />
          </View>
          <View style={styles.flex}>
            <Controller
              control={control}
              name="preparationTimeMinutes"
              render={({field}) => (
                <FormField
                  editable={!busy}
                  error={errors.preparationTimeMinutes?.message}
                  keyboardType="number-pad"
                  label="Ready in"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="25"
                  suffix="min"
                  value={field.value}
                />
              )}
            />
          </View>
        </View>
        <Controller
          control={control}
          name="unitPackageWeightGrams"
          render={({field}) => (
            <FormField
              editable={!busy}
              error={errors.unitPackageWeightGrams?.message}
              helper="Weight of one packed portion, in grams."
              keyboardType="number-pad"
              label="Packed weight"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="450"
              required
              suffix="g"
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({field}) => (
            <FormField
              editable={!busy}
              error={errors.description?.message}
              label="Description"
              multiline
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="What's in it, how it's cooked"
              value={field.value}
            />
          )}
        />

        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.groupTitle}>
          More details <Text style={styles.optional}>(optional)</Text>
        </Text>
        <Controller
          control={control}
          name="servesCount"
          render={({field}) => (
            <FormField
              editable={!busy}
              error={errors.servesCount?.message}
              keyboardType="number-pad"
              label="Serves"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="1"
              suffix="people"
              value={field.value}
            />
          )}
        />
        <View style={styles.group}>
          <GroupLabel label="Spice level" />
          <Controller
            control={control}
            name="spiceLevel"
            render={({field}) => (
              <View style={styles.options}>
                <OptionChip disabled={busy} label="Not set" onPress={() => field.onChange('')} selected={field.value === ''} />
                {CHEF_MENU_SPICE_LEVELS.map(level => (
                  <OptionChip
                    disabled={busy}
                    key={level}
                    label={SPICE_LABELS[level]}
                    onPress={() => field.onChange(level)}
                    selected={field.value === level}
                  />
                ))}
              </View>
            )}
          />
        </View>
        <Controller
          control={control}
          name="thermoboxRequired"
          render={({field}) => (
            <ListGroup>
              <ListRow
                right={
                  <Switch
                    accessibilityLabel="Needs hot box"
                    disabled={busy}
                    onValueChange={field.onChange}
                    thumbColor={colors.white}
                    trackColor={{false: colors.borderStrong, true: colors.success}}
                    value={field.value}
                  />
                }
                subtitle="For dishes that must stay hot"
                title="Needs hot box"
              />
            </ListGroup>
          )}
        />
      </View>

      <ChefSheet onClose={() => setSheet(null)} title="Dish photo" visible={sheet === 'photo'}>
        <ListGroup>
          <ListRow icon="camera" onPress={() => closeSheetThen(() => choosePhoto('camera'))} title="Take photo" />
          <ListRow icon="image" onPress={() => closeSheetThen(() => choosePhoto('gallery'))} title="Choose from gallery" />
          {photo ? (
            <ListRow
              destructive
              icon="trash"
              onPress={() =>
                closeSheetThen(() => {
                  setPhoto(null);
                  setPhotoError(null);
                })
              }
              title="Remove photo"
            />
          ) : null}
        </ListGroup>
      </ChefSheet>
      <ChefSheet onClose={() => setSheet(null)} title="Dish options" visible={sheet === 'options'}>
        <ListGroup>
          <ListRow
            icon="copy"
            onPress={() => closeSheetThen(() => dish && navigation.replace('ChefAddMenuItem', {copyOfMenuItemId: dish.id}))}
            title="Duplicate dish"
          />
          <ListRow destructive icon="trash" onPress={() => closeSheetThen(() => setConfirmingDelete(true))} title="Delete dish" />
        </ListGroup>
      </ChefSheet>
      <ConfirmDialog
        busy={editModel.deleting}
        cancelLabel="Cancel"
        confirmLabel="Delete dish"
        message="Customers won't see it any more. If it's in a meal plan, change the plan first."
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => deleteDish()}
        title={`Delete ${dish?.itemName ?? 'this dish'}?`}
        tone="danger"
        visible={confirmingDelete}
      />
      <ConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        message="What you changed won't be saved."
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          const action = pendingLeave;
          setPendingLeave(null);
          navigation.dispatch(action as never);
        }}
        title="Discard changes?"
        tone="danger"
        visible={pendingLeave !== null}
      />
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  flex2: {flex: 2},
  loading: {gap: spacing.md},
  unavailable: {gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.xl},
  unavailableTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  unavailableMessage: {color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
  buttons: {flexDirection: 'row', gap: spacing.sm},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
  },
  errorBannerText: {flex: 1, color: colors.flameRedAccessible, fontSize: typography.body},
  photo: {width: '100%', height: 170, borderRadius: radius.md},
  changePhoto: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.espresso,
  },
  changePhotoText: {color: colors.white, fontSize: typography.small, fontWeight: fontWeight.bold},
  photoEmpty: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  photoTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  photoHint: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  photoError: {marginTop: spacing.xs, color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.semibold},
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md + 2,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  statusCardOn: {borderColor: colors.successSoft, backgroundColor: colors.successSoft},
  statusText: {flex: 1, minWidth: 0},
  statusTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  statusSubtitle: {color: colors.textSecondary, fontSize: typography.small},
  statusTitleOn: {color: colors.successText},
  form: {gap: spacing.sm + 2},
  group: {gap: 6},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  columns: {flexDirection: 'row', gap: spacing.sm},
  groupTitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  optional: {fontWeight: fontWeight.medium, textTransform: 'none', letterSpacing: 0},
});
