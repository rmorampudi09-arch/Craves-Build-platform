import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, spacing, textDefaults, typography} from '../../../design/tokens';
import {ChefActionButton, ChefSheet} from '../../chefShell/components/ui';
import {deletionCopy} from '../domain/deletionCopy';
import type {SummaryKind} from '../domain/deletionModel';
import {DeletionNote} from './DeletionNote';

const {confirm} = deletionCopy;

function contentFor(kind: SummaryKind, shortDate: string, chefSideStays: boolean) {
  switch (kind) {
    case 'customerAll':
      return {title: confirm.customerAllTitle(shortDate), body: confirm.customerAllBody, info: confirm.customerInfo(shortDate), button: confirm.customerButton};
    case 'customerSide':
      return {title: confirm.customerSideTitle(shortDate), body: chefSideStays ? confirm.customerSideBody : confirm.customerSideBodyNoChef, info: confirm.customerInfo(shortDate), button: confirm.customerButton};
    case 'chefSide':
      return {title: confirm.chefTitle, body: confirm.chefSideBody, info: confirm.chefInfo, button: confirm.chefButton};
    case 'chefAll':
      return {title: confirm.chefTitle, body: confirm.chefAllBody, info: confirm.chefInfo, button: confirm.chefButton};
  }
}

interface Props {
  visible: boolean;
  kind: SummaryKind;
  /** Customer scopes: today + 30 days, "5 Dec". */
  shortDate: string;
  /** Customer side only: the person also has a chef side, which stays. */
  chefSideStays: boolean;
  /** The request is on its way: both buttons ignore taps. */
  busy: boolean;
  /** Why the last try did not go; sits above the buttons. */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** The last question before the request is sent. Cancel closes it; the red button sends. */
export function DeletionConfirmSheet({visible, kind, shortDate, chefSideStays, busy, error, onCancel, onConfirm}: Props) {
  const content = contentFor(kind, shortDate, chefSideStays);
  return (
    <ChefSheet
      footer={
        <View style={styles.footer}>
          {error ? (
            <Text accessibilityRole="alert" allowFontScaling={textDefaults.allowFontScaling} style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <ChefActionButton disabled={busy} label={confirm.cancel} onPress={onCancel} style={styles.cancel} tone="neutral" />
            <ChefActionButton busy={busy} label={content.button} onPress={onConfirm} style={styles.send} />
          </View>
        </View>
      }
      onClose={busy ? () => undefined : onCancel}
      title={content.title}
      visible={visible}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
        {content.body}
      </Text>
      <DeletionNote text={content.info} tone="warning" />
    </ChefSheet>
  );
}

const styles = StyleSheet.create({
  body: {color: colors.textSecondary, fontSize: typography.body},
  footer: {gap: spacing.sm},
  error: {color: colors.error, fontSize: typography.small},
  buttons: {flexDirection: 'row', gap: spacing.sm},
  cancel: {flex: 1},
  send: {flex: 2},
});
