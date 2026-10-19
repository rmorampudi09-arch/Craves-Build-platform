import React, {useState} from 'react';
import {Button, type ButtonVariant} from '../../../shared/components';

/**
 * A full-width 56 dp button that ignores repeat taps until its async action settles,
 * so a double tap never sends a trip step twice.
 */
export function BottomAction({
  label,
  onPress,
  disabled,
  variant = 'primary',
  testID,
}: {
  label: string;
  onPress: () => Promise<unknown> | void;
  disabled?: boolean;
  variant?: ButtonVariant;
  testID?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label={label}
      variant={variant}
      loading={busy}
      disabled={disabled}
      testID={testID}
      onPress={() => {
        if (busy) {
          return;
        }
        const result = onPress();
        if (result instanceof Promise) {
          setBusy(true);
          result.finally(() => setBusy(false));
        }
      }}
    />
  );
}
