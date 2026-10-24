import React, {useEffect, useState} from 'react';
import {Image, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, radius, spacing, typography, iconSize} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {getCartItemInitial} from '../cartUiModel';
import type {CartLine} from '../domain/cartTypes';
import {formatCartMoney} from '../viewCartOverlayModel';

const SHOWN_CART_LINES = 2;

export interface KitchenSwitchRequest {
  cartLines: readonly CartLine[];
  newDish: {name: string; kitchenName: string; priceLabel: string; imageUrl?: string | null};
  onReplace: () => void;
}

function DishRow({name, detail, imageUrl}: {name: string; detail: string; imageUrl?: string | null}) {
  return (
    <View style={styles.dishRow}>
      {imageUrl ? (
        <Image source={{uri: imageUrl}} resizeMode="cover" style={styles.dishImage} />
      ) : (
        <View style={[styles.dishImage, styles.dishFallback]}>
          <Text style={styles.dishInitial}>{getCartItemInitial(name)}</Text>
        </View>
      )}
      <View style={styles.dishCopy}>
        <Text numberOfLines={1} style={styles.dishName}>
          {name}
        </Text>
        <Text numberOfLines={1} style={styles.dishDetail}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

function KitchenSwitchDialog({
  request,
  onKeep,
  onReplace,
}: {
  request: KitchenSwitchRequest;
  onKeep: () => void;
  onReplace: () => void;
}) {
  const cartKitchen = request.cartLines[0]?.kitchenName ?? 'another kitchen';
  const hidden = request.cartLines.length - SHOWN_CART_LINES;
  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onKeep} visible>
      <Pressable accessibilityLabel="Keep current cart" onPress={onKeep} style={styles.backdrop}>
        {/* Swallow taps inside the card so only the backdrop dismisses. */}
        <Pressable accessibilityRole="alert" onPress={() => undefined} style={styles.card}>
          <View style={styles.iconTile}>
            <Icon name="cart" size={iconSize.md} color={colors.flameRed} surface={false} />
          </View>
          <Text style={styles.title}>Replace your cart?</Text>
          <Text style={styles.body}>
            Your cart has food from <Text style={styles.strong}>{cartKitchen}</Text>. Keep it, or
            replace it with this dish from{' '}
            <Text style={styles.strong}>{request.newDish.kitchenName}</Text>.
          </Text>

          <Text style={styles.label}>IN YOUR CART</Text>
          <View style={styles.group}>
            {request.cartLines.slice(0, SHOWN_CART_LINES).map(line => (
              <DishRow
                key={line.lineId}
                name={line.itemName}
                detail={`${line.quantity} × ${formatCartMoney(line.unitPrice)}`}
                imageUrl={line.imageUrl}
              />
            ))}
            {hidden > 0 ? (
              <Text style={styles.more}>
                + {hidden} more {hidden === 1 ? 'dish' : 'dishes'}
              </Text>
            ) : null}
          </View>

          <Text style={styles.label}>REPLACE WITH</Text>
          <View style={styles.group}>
            <DishRow
              name={request.newDish.name}
              detail={request.newDish.priceLabel}
              imageUrl={request.newDish.imageUrl}
            />
          </View>

          <View style={styles.actions}>
            <Button label="Keep cart" variant="outline" onPress={onKeep} style={styles.action} />
            <Button label="Replace" onPress={onReplace} style={styles.action} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

let showRequest: ((request: KitchenSwitchRequest) => void) | null = null;

/** Asks before an add would replace a cart that holds another kitchen's food (like Alert.alert). */
export function askKitchenSwitch(request: KitchenSwitchRequest): void {
  showRequest?.(request);
}

/** Mounted once under the customer navigator; renders the popup askKitchenSwitch requests. */
export function KitchenSwitchHost() {
  const [request, setRequest] = useState<KitchenSwitchRequest | null>(null);
  useEffect(() => {
    showRequest = setRequest;
    return () => {
      showRequest = null;
    };
  }, []);
  if (!request) return null;
  return (
    <KitchenSwitchDialog
      request={request}
      onKeep={() => setRequest(null)}
      onReplace={() => {
        setRequest(null);
        request.onReplace();
      }}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(20,14,11,0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: spacing.lg,
    backgroundColor: colors.white,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  title: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: 20,
    fontWeight: fontWeight.extrabold,
  },
  body: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.body},
  strong: {color: colors.espressoBrown, fontWeight: fontWeight.bold},
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
  },
  group: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dishRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  dishImage: {width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.muted},
  dishFallback: {alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream},
  dishInitial: {color: colors.flameRed, fontSize: typography.body, fontWeight: fontWeight.extrabold},
  dishCopy: {flex: 1, minWidth: 0},
  dishName: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.semibold},
  dishDetail: {color: colors.textSecondary, fontSize: typography.small},
  more: {color: colors.textSecondary, fontSize: typography.small, paddingLeft: 56},
  actions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg},
  action: {flex: 1},
});
