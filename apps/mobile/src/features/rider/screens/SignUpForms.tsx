import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {Chip, InputField, SegmentedControl} from '../../../shared/components';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import type {PayoutAccountInput, RiderProfile, VehicleKind} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {Card} from '../components/ui';
import {riderKeys} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

/** The same checks the server makes (FleetRules), so most mistakes never leave the phone. */
const PLATE = /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;
const UPI = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const VEHICLES: VehicleKind[] = ['PETROL', 'ELECTRIC', 'BICYCLE'];
const LANGUAGES = ['en', 'te', 'hi'] as const;

const message = (error: unknown, fallback: string) => (error instanceof AppApiError ? error.message : fallback);

/** Sign-up for anyone signed in with an Indian number, like the chef app: name, language, vehicle, 18+. */
export function JoinForm() {
  const {strings, language, setLanguage} = useStrings();
  const j = strings.account.join;
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [vehicle, setVehicle] = useState<VehicleKind>('PETROL');
  const [plate, setPlate] = useState('');
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const regNumber = plate.replace(/[\s-]/g, '').toUpperCase();
    const fullName = name.trim().replace(/\s+/g, ' ');
    if (fullName.length < 2 || !adult || (vehicle !== 'BICYCLE' && !PLATE.test(regNumber))) {
      setError(j.incomplete);
      return;
    }
    setError(null);
    try {
      const me = await riderApi.signUp({
        name: fullName,
        language,
        vehicleKind: vehicle,
        ...(vehicle === 'BICYCLE' ? {} : {vehicleRegNumber: regNumber}),
        adult,
      });
      queryClient.setQueryData(riderKeys.me, me);
      await queryClient.invalidateQueries({queryKey: riderKeys.profile});
    } catch (caught) {
      setError(message(caught, strings.common.error));
    }
  }

  return (
    <Card style={styles.form}>
      <InputField label={j.name} value={name} onChangeText={setName} autoComplete="name" maxLength={120} testID="rider-join-name" />
      <Text style={styles.label}>{j.language}</Text>
      <SegmentedControl
        value={language}
        options={LANGUAGES.map(value => ({value, label: strings.languages[value]}))}
        onChange={setLanguage}
        accessibilityOptionRole="radio"
        testID="rider-join-language"
      />
      <Text style={styles.label}>{j.vehicle}</Text>
      <View style={styles.chips}>
        {VEHICLES.map(kind => (
          <Chip key={kind} label={j.vehicles[kind]} selected={vehicle === kind} onPress={() => setVehicle(kind)} testID={`rider-join-${kind}`} />
        ))}
      </View>
      {vehicle === 'BICYCLE' ? null : (
        <InputField
          label={j.plate}
          placeholder="TS09EA1234"
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={14}
          testID="rider-join-plate"
        />
      )}
      <View style={styles.chips}>
        <Chip label={j.adult} selected={adult} onPress={() => setAdult(!adult)} testID="rider-join-adult" />
      </View>
      {error ? <Banner tone="warning" inset text={error} testID="rider-join-error" /> : null}
      <Text style={styles.secondary}>{j.next}</Text>
      <BottomAction label={j.submit} onPress={submit} testID="rider-join-submit" />
    </Card>
  );
}

/** The rider's own UPI ID or bank account. It waits for ops to check it against the bank proof before anything is paid. */
export function PayoutAccountCard({profile, kycName}: {profile: RiderProfile; kycName: string}) {
  const {strings} = useStrings();
  const p = strings.account.payout;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!profile.payoutAccountSubmitted && !profile.payoutAccountMasked);
  const [method, setMethod] = useState<PayoutAccountInput['method']>('UPI');
  const [upiId, setUpiId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holder, setHolder] = useState(kycName);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const input: PayoutAccountInput =
      method === 'UPI'
        ? {method, holderName: holder.trim(), upiId: upiId.trim()}
        : {method, holderName: holder.trim(), accountNumber: accountNumber.replace(/\s/g, ''), ifsc: ifsc.trim().toUpperCase()};
    const valid = input.method === 'UPI' ? UPI.test(input.upiId) : /^[0-9]{9,18}$/.test(input.accountNumber) && IFSC.test(input.ifsc);
    if (!valid || input.holderName.length < 2) {
      setError(p.incomplete);
      return;
    }
    setError(null);
    try {
      await riderApi.submitPayoutAccount(input);
      setEditing(false);
      await queryClient.invalidateQueries({queryKey: riderKeys.profile});
    } catch (caught) {
      setError(message(caught, strings.common.error));
    }
  }

  return (
    <Card style={styles.form}>
      <Text style={styles.strong}>{p.title}</Text>
      {profile.payoutAccountMasked ? <Text style={styles.body}>{p.current(profile.payoutAccountMasked)}</Text> : null}
      {profile.payoutAccountSubmitted ? <Text style={styles.body}>{p.sent(profile.payoutAccountSubmitted)}</Text> : null}
      {editing ? (
        <>
          <Text style={styles.secondary}>{p.body}</Text>
          <SegmentedControl
            value={method}
            options={(['UPI', 'BANK'] as const).map(value => ({value, label: p.methods[value]}))}
            onChange={setMethod}
            accessibilityOptionRole="radio"
            testID="rider-payout-method"
          />
          {method === 'UPI' ? (
            <InputField label={p.upiId} placeholder="name@okaxis" value={upiId} onChangeText={setUpiId} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={100} testID="rider-payout-upi" />
          ) : (
            <>
              <InputField label={p.accountNumber} value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" maxLength={22} testID="rider-payout-account-number" />
              <InputField label={p.ifsc} placeholder="SBIN0001234" value={ifsc} onChangeText={setIfsc} autoCapitalize="characters" autoCorrect={false} maxLength={11} testID="rider-payout-ifsc" />
            </>
          )}
          <InputField label={p.holder} value={holder} onChangeText={setHolder} maxLength={120} testID="rider-payout-holder" />
          {error ? <Banner tone="warning" inset text={error} testID="rider-payout-error" /> : null}
          <BottomAction label={p.submit} variant="outline" size="compact" onPress={submit} testID="rider-payout-submit" />
        </>
      ) : (
        <BottomAction label={p.change} variant="ghost" size="compact" onPress={() => setEditing(true)} testID="rider-payout-change" />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  form: {gap: spacing.sm},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  label: {fontSize: typography.small, color: colors.textSecondary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  secondary: {fontSize: typography.body, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
