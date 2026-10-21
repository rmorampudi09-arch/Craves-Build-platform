import React, {useState} from 'react';
import {Text} from 'react-native';
import {AppApiError} from '../../../core/http/apiError';
import {BottomAction} from '../../../features/rider/components/BottomAction';
import {Label, Title} from '../../../features/rider/components/ui';
import type {RiderScreenProps} from '../../../features/rider/navigation';
import {isDemo} from '../../../features/rider/riderConfig';
import {useStrings} from '../../../features/rider/strings/StringsProvider';
import {useRiderSession} from '../useRiderSession';
import {SignInField, SignInFrame, signInStyles} from './SignInFrame';

/** Rider wording only: no role picker and no email sign-in. Styled like the code step (01-SignIn.png). */
export function RiderPhoneScreen({navigation}: RiderScreenProps<'Phone'>) {
  const {strings} = useStrings();
  const s = strings.signIn;
  const session = useRiderSession();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string>();

  async function sendCode() {
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError(s.invalidPhone);
      return;
    }
    setError(undefined);
    try {
      const phone = `+91${digits}`;
      await session.beginPhone(phone);
      navigation.navigate('Otp', {phone});
    } catch (failure) {
      setError(failure instanceof AppApiError ? failure.message : strings.common.error);
    }
  }

  return (
    <SignInFrame
      testID="rider-sign-in-phone"
      footer={<BottomAction label={s.sendCode} onPress={sendCode} testID="rider-send-code" />}>
      <Title>{s.title}</Title>
      <Text style={signInStyles.line}>{s.phoneHint}</Text>
      <SignInField
        label={s.phoneLabel}
        prefix="+91"
        tracking={1}
        value={digits}
        onChangeText={value => setDigits(value.replace(/\D/g, '').slice(0, 10))}
        keyboardType="phone-pad"
        autoComplete="tel-national"
        maxLength={10}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={sendCode}
        error={error}
        testID="rider-phone-input"
      />
      {isDemo ? <Label>{s.demoHint}</Label> : null}
    </SignInFrame>
  );
}
