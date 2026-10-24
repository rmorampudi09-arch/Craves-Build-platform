import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {CustomerMealPlanStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {
  Badge,
  Button,
  Icon,
  ListSkeleton,
  RecoverableErrorBanner,
  ScreenShell,
  type IconName,
} from '../../../shared/components';
import {
  customerAddressDisplayLine,
  customerAddressLabel,
  type CustomerAddress,
} from '../../customerAddresses/domain/customerAddressContract';
import {useCustomerAddressesQuery} from '../../customerAddresses/query/customerAddressQueries';
import {CustomerAddressEditorModal} from '../../customerAddresses/screens/CustomerAddressEditorModal';
import {MealPlanHeader, RadioMark} from '../components/MealPlanUi';
import {addressAreaLine} from '../domain/mealPlanPresentation';
import {
  useMealPlanCheckout,
  useSelectedDeliveryAddress,
} from '../state/MealPlanCheckoutContext';

type Props = NativeStackScreenProps<CustomerMealPlanStackParamList, 'MealPlanAddress'>;
type EditorTarget = {mode: 'add'} | {mode: 'edit'; address: CustomerAddress};

const LABEL_ICONS: Record<string, IconName> = {HOME: 'home', WORK: 'work'};

function AddressCard({
  address,
  selected,
  onSelect,
  onEdit,
}: {
  address: CustomerAddress;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const label = customerAddressLabel(address);
  const displayLine = customerAddressDisplayLine(address);
  return (
    <Pressable
      accessibilityActions={[{name: 'edit', label: 'Edit'}]}
      accessibilityLabel={`${label}${address.isDefault ? ', default' : ''}, ${displayLine}`}
      accessibilityRole="radio"
      accessibilityState={{checked: selected}}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'edit') {
          onEdit();
        }
      }}
      onPress={onSelect}
      style={({pressed}) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}
      testID={`meal-plan-address-${address.id}`}>
      <View style={styles.tile}>
        <Icon
          name={LABEL_ICONS[address.addressLabel ?? ''] ?? 'location-outline'}
          size={iconSize.lg}
          color={selected ? colors.flameRedAccessible : colors.textPrimary}
          surface={false}
        />
      </View>
      <View style={styles.cardText}>
        <View style={styles.labelRow}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
            {label}
          </Text>
          {address.isDefault ? <Badge label="Default" /> : null}
        </View>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.area}>
          {addressAreaLine(address)}
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
          {displayLine}
        </Text>
      </View>
      <View style={styles.cardSide}>
        <RadioMark checked={selected} />
        <Pressable
          accessibilityLabel={`Edit ${label}`}
          accessibilityRole="button"
          onPress={onEdit}
          style={({pressed}) => [styles.edit, pressed && styles.pressed]}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.link}>
            Edit
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export function MealPlanAddressScreen({navigation}: Props) {
  const {setDeliveryAddressId} = useMealPlanCheckout();
  const {address, addresses, loading, isError} = useSelectedDeliveryAddress();
  const addressesQuery = useCustomerAddressesQuery();
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<EditorTarget | null>(null);
  // A pick that is no longer delivery-ready (or not loaded yet) falls back to the current choice.
  const selectedId = addresses.some(candidate => candidate.id === pickedId)
    ? pickedId
    : address?.id ?? null;

  const deliverHere = () => {
    if (selectedId) {
      setDeliveryAddressId(selectedId);
      navigation.goBack();
    }
  };

  return (
    <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="meal-plan-address">
      <MealPlanHeader
        title="Delivery Address"
        subtitle="Select where you want your meals delivered"
        onBack={navigation.goBack}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <ListSkeleton count={3} /> : null}
        {isError ? (
          <RecoverableErrorBanner
            message="Your saved addresses could not be loaded. Check your connection and try again."
            onRetry={() => {
              addressesQuery.refetch();
            }}
          />
        ) : null}
        <View accessibilityRole="radiogroup" style={styles.list}>
          {addresses.map(candidate => (
            <AddressCard
              key={candidate.id}
              address={candidate}
              selected={candidate.id === selectedId}
              onSelect={() => setPickedId(candidate.id)}
              onEdit={() => setEditor({mode: 'edit', address: candidate})}
            />
          ))}
        </View>
        {loading ? null : (
          <Pressable
            accessibilityLabel="Add new address"
            accessibilityRole="button"
            onPress={() => setEditor({mode: 'add'})}
            style={({pressed}) => [styles.card, styles.addCard, pressed && styles.pressed]}>
            <View style={[styles.tile, styles.round]}>
              <Icon
                name="plus"
                size={iconSize.lg}
                color={colors.flameRedAccessible}
                surface={false}
              />
            </View>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.addText}>
              Add new address
            </Text>
          </Pressable>
        )}
      </ScrollView>
      <View style={styles.bar}>
        <Button label="Deliver here" onPress={deliverHere} disabled={!selectedId} />
      </View>

      {editor ? (
        <CustomerAddressEditorModal
          mode={editor.mode}
          address={editor.mode === 'edit' ? editor.address : undefined}
          addresses={addressesQuery.addresses}
          onSaved={saved => {
            if (editor.mode === 'add') {
              setPickedId(saved.id);
            }
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.xl},
  list: {gap: spacing.sm},
  card: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  cardSelected: {borderWidth: borderWidth.focus, borderColor: colors.flameRed},
  pressed: {opacity: 0.8},
  tile: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  round: {borderRadius: radius.pill},
  cardText: {flex: 1, minWidth: 0, gap: spacing.xxs},
  labelRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  label: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  area: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  line: {color: colors.textSecondary, fontSize: typography.small},
  cardSide: {alignItems: 'flex-end', justifyContent: 'space-between'},
  edit: {
    minWidth: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  link: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  addCard: {
    alignItems: 'center',
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    ...elevation.none,
  },
  addText: {
    color: colors.flameRedAccessible,
    fontSize: typography.button,
    fontWeight: fontWeight.semibold,
  },
  bar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
