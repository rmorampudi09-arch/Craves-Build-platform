import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {colors, spacing, textDefaults, typography} from '../../../design/tokens';
import {ChefActionButton, ChefSheet, useChefToast} from '../../chefShell/components/ui';
import {shortOrderNumber} from '../../chefShell/domain/chefFormat';
import {buildCreateChefSupportCaseRequest, chefSupportCasesApi} from '../../chefSupport/api/chefSupportCasesApi';
import {NOT_PICKED_UP_REASONS, buildNotPickedUpCase, type NotPickedUpReasonId} from '../domain/chefOrderReasons';
import {ReasonNote, ReasonOptions} from './ReasonOptions';

export const SUPPORT_COMING_SOON = 'Support is coming soon. Call Craves support.';

export interface NotPickedUpSheetProps {
  /** The order the courier did not collect; the sheet is open while this is set. */
  orderId: string | null;
  onClose: () => void;
}

/** "What happened with #0E7CD?": sends the answer to Craves support with the order attached. */
export function NotPickedUpSheet({orderId, onClose}: NotPickedUpSheetProps) {
  const toast = useChefToast();
  const [pick, setPick] = React.useState<NotPickedUpReasonId>('late');
  const [note, setNote] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const sendingRef = React.useRef(false);
  React.useEffect(() => {
    if (orderId) {
      setPick('late');
      setNote('');
      setFailed(false);
    }
  }, [orderId]);

  const send = async () => {
    if (!orderId || sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setFailed(false);
    try {
      await chefSupportCasesApi.create(buildCreateChefSupportCaseRequest(buildNotPickedUpCase(orderId, pick, note)));
      toast.show('Sent to Craves support');
      onClose();
    } catch (error) {
      if (isRouteNotPublished(error)) {
        toast.show(SUPPORT_COMING_SOON);
        onClose();
      } else {
        setFailed(true);
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <ChefSheet
      onClose={sending ? () => undefined : onClose}
      title={`What happened with ${orderId ? shortOrderNumber(orderId) : 'this order'}?`}
      visible={orderId !== null}>
      <ReasonOptions onChange={setPick} options={NOT_PICKED_UP_REASONS} value={pick} />
      <ReasonNote label="Details for support" onChangeText={setNote} placeholder="Add details (optional)" value={note} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
        Craves support gets this with the order attached and will call you if needed.
      </Text>
      {failed ? (
        <Text accessibilityLiveRegion="polite" allowFontScaling={textDefaults.allowFontScaling} style={styles.error}>
          We couldn't send this. Check your connection and try again.
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <ChefActionButton disabled={sending} label="Cancel" onPress={onClose} style={styles.cancel} tone="neutral" />
        <ChefActionButton busy={sending} label="Send to support" onPress={send} style={styles.send} />
      </View>
    </ChefSheet>
  );
}

const styles = StyleSheet.create({
  hint: {color: colors.textSecondary, fontSize: typography.small},
  error: {color: colors.error, fontSize: typography.small},
  buttons: {flexDirection: 'row', gap: spacing.sm},
  cancel: {flex: 1},
  send: {flex: 2},
});
