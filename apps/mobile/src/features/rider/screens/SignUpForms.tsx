import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {Chip, InputField, SegmentedControl} from '../../../shared/components';
import {borderWidth, colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import type {PayoutAccountInput, RiderMe, RiderProfile, VehicleKind} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {StatusBadge} from '../components/StatusBadge';
import {Card} from '../components/ui';
import {riderKeys} from '../state/riderQueries';
import {RIDER_LANGUAGES, useStrings} from '../strings/StringsProvider';

/** The same checks the server makes (FleetRules), so most mistakes never leave the phone. */
const PLATE = /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;
const UPI = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const VEHICLES: VehicleKind[] = ['PETROL', 'ELECTRIC', 'BICYCLE'];

const message = (error: unknown, fallback: string) => (error instanceof AppApiError ? error.message : fallback);
/** The words of a name in any order or case: "Gopi K" is still "K Gopi" (the server's FleetRules.sameName). */
const nameWords = (name: string) => name.toLowerCase().split(/[\s.,'-]+/).filter(Boolean).sort().join(' ');

/** A PENDING rider correcting their sign-up: what is on file now, and whether a payout account waits in the current name. */
interface Correction {
  name: string;
  vehicle?: VehicleKind;
  plateMasked?: string;
  payoutSent: boolean;
  onClose(saved: boolean): void;
}

/**
 * Sign-up for anyone signed in with an Indian number, like the chef app: name, language, vehicle, 18+.
 * With `edit`, a PENDING rider corrects the same details; an empty plate keeps the one on file.
 */
export function JoinForm({edit}: {edit?: Correction}) {
  const {strings, language, setLanguage} = useStrings();
  const j = strings.account.join;
  const d = strings.account.details;
  const queryClient = useQueryClient();
  const [name, setName] = useState(edit?.name ?? '');
  const [vehicle, setVehicle] = useState<VehicleKind>(edit?.vehicle ?? 'PETROL');
  const [plate, setPlate] = useState('');
  const [adult, setAdult] = useState(Boolean(edit));
  const [error, setError] = useState<string | null>(null);
  const renamed = Boolean(edit?.payoutSent) && nameWords(name) !== nameWords(edit?.name ?? '');

  async function submit() {
    const regNumber = plate.replace(/[\s-]/g, '').toUpperCase();
    const fullName = name.trim().replace(/\s+/g, ' ');
    const plateOk = vehicle === 'BICYCLE' || PLATE.test(regNumber) || (!regNumber && Boolean(edit?.plateMasked));
    if (fullName.length < 2 || !adult || !plateOk) {
      setError(edit ? d.incomplete : j.incomplete);
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
      edit?.onClose(true);
    } catch (caught) {
      setError(message(caught, strings.common.error));
    }
  }

  return (
    <Card style={styles.form}>
      {edit ? (
        <Text accessibilityRole="header" style={styles.strong}>
          {d.title}
        </Text>
      ) : null}
      <InputField
        label={j.name}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        maxLength={120}
        helperText={d.nameHint}
        testID="rider-join-name"
      />
      {renamed ? <Banner tone="warning" inset text={d.resendPayout} testID="rider-join-resend-payout" /> : null}
      {RIDER_LANGUAGES.length > 1 ? (
        <>
          <Text style={styles.label}>{j.language}</Text>
          <SegmentedControl
            value={language}
            options={RIDER_LANGUAGES.map(value => ({value, label: strings.languages[value]}))}
            onChange={setLanguage}
            accessibilityOptionRole="radio"
            testID="rider-join-language"
          />
        </>
      ) : null}
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
          helperText={edit?.plateMasked ? d.keepPlate(edit.plateMasked) : undefined}
          testID="rider-join-plate"
        />
      )}
      {edit ? null : (
        <View style={styles.chips}>
          <Chip label={j.adult} selected={adult} onPress={() => setAdult(!adult)} testID="rider-join-adult" />
        </View>
      )}
      {error ? <Banner tone="warning" inset text={error} testID="rider-join-error" /> : null}
      {edit ? (
        <>
          <BottomAction label={d.save} variant="outline" size="compact" onPress={submit} testID="rider-join-submit" />
          <BottomAction
            label={strings.common.cancel}
            variant="neutral"
            size="compact"
            onPress={() => edit.onClose(false)}
            testID="rider-join-cancel"
          />
        </>
      ) : (
        <>
          <Text style={styles.secondary}>{j.next}</Text>
          <BottomAction label={j.submit} onPress={submit} testID="rider-join-submit" />
        </>
      )}
    </Card>
  );
}

/** What a PENDING rider signed up with, which they can correct until ops activates them. */
export function DetailsCard({me, profile}: {me: RiderMe; profile: RiderProfile}) {
  const {strings} = useStrings();
  const d = strings.account.details;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const {vehicle} = profile;

  if (editing) {
    return (
      <JoinForm
        edit={{
          name: me.name,
          vehicle: vehicle.kind,
          plateMasked: vehicle.regNumberMasked,
          payoutSent: Boolean(profile.payoutAccountSubmitted),
          onClose: done => {
            setEditing(false);
            setSaved(done);
          },
        }}
      />
    );
  }
  const rows: Array<[string, string]> = [
    [d.name, me.name],
    [d.language, strings.languages[me.language]],
    [d.vehicle, vehicle.kind ? strings.account.join.vehicles[vehicle.kind] : vehicle.label],
  ];
  if (vehicle.regNumberMasked) {
    rows.push([d.plate, vehicle.regNumberMasked]);
  }
  return (
    <Card style={styles.form}>
      <Text accessibilityRole="header" style={styles.strong}>
        {d.title}
      </Text>
      <View>
        {rows.map(([label, value], index) => (
          <View key={label} style={[styles.row, styles.detail, index > 0 && styles.divider]}>
            <Text style={[styles.secondary, styles.flex]}>{label}</Text>
            <Text style={[styles.strong, styles.value]}>{value}</Text>
          </View>
        ))}
      </View>
      {saved ? <Banner tone="success" inset text={d.saved} testID="rider-details-saved" /> : null}
      <BottomAction
        label={d.change}
        variant="outline"
        size="compact"
        onPress={() => {
          setSaved(false);
          setEditing(true);
        }}
        testID="rider-details-change"
      />
    </Card>
  );
}

/**
 * The rider's own UPI ID or bank account, in their KYC name. It waits for ops to check it against the bank proof before
 * anything is paid. Remount it (key) when the name changes, so the holder name follows.
 */
export function PayoutAccountCard({profile, kycName}: {profile: RiderProfile; kycName: string}) {
  const {strings} = useStrings();
  const a = strings.account;
  const p = a.payout;
  const queryClient = useQueryClient();
  const hasAccount = Boolean(profile.payoutAccountSubmitted || profile.payoutAccountMasked);
  const [changing, setChanging] = useState(false);
  const [method, setMethod] = useState<PayoutAccountInput['method']>('UPI');
  const [upiId, setUpiId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holder, setHolder] = useState(kycName);
  const [error, setError] = useState<string | null>(null);
  // No account yet (or the one sent was set aside after a new name): the form is the only thing to show.
  const editing = changing || !hasAccount;

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
      setChanging(false);
      await queryClient.invalidateQueries({queryKey: riderKeys.profile});
    } catch (caught) {
      setError(message(caught, strings.common.error));
    }
  }

  return (
    <Card style={styles.form}>
      <Text accessibilityRole="header" style={styles.strong}>
        {p.title}
      </Text>
      {profile.payoutAccountMasked ? (
        <View style={styles.row}>
          <Text style={[styles.body, styles.flex]}>{p.current(profile.payoutAccountMasked)}</Text>
          <StatusBadge status="VERIFIED" label={a.docStatus.VERIFIED} />
        </View>
      ) : null}
      {profile.payoutAccountSubmitted ? (
        <>
          <View style={styles.row}>
            <Text style={[styles.body, styles.flex]}>{p.sent(profile.payoutAccountSubmitted)}</Text>
            <StatusBadge status="PENDING" label={a.docStatus.PENDING} />
          </View>
          <Text style={styles.secondary}>{p.sentBody}</Text>
        </>
      ) : null}
      {editing ? (
        <>
          <Text style={styles.secondary}>{p.body(kycName)}</Text>
          <SegmentedControl
            value={method}
            options={(['UPI', 'BANK'] as const).map(value => ({value, label: p.methods[value]}))}
            onChange={setMethod}
            accessibilityOptionRole="radio"
            testID="rider-payout-method"
          />
          {method === 'UPI' ? (
            <InputField
              label={p.upiId}
              placeholder="name@okaxis"
              value={upiId}
              onChangeText={setUpiId}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              maxLength={100}
              helperText={p.upiHint}
              testID="rider-payout-upi"
            />
          ) : (
            <>
              <InputField label={p.accountNumber} value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" maxLength={22} testID="rider-payout-account-number" />
              <InputField label={p.ifsc} placeholder="SBIN0001234" value={ifsc} onChangeText={setIfsc} autoCapitalize="characters" autoCorrect={false} maxLength={11} testID="rider-payout-ifsc" />
            </>
          )}
          <InputField label={p.holder} value={holder} onChangeText={setHolder} maxLength={120} helperText={p.holderHint} testID="rider-payout-holder" />
          {error ? <Banner tone="warning" inset text={error} testID="rider-payout-error" /> : null}
          <BottomAction label={p.submit} variant="outline" size="compact" onPress={submit} testID="rider-payout-submit" />
          {hasAccount ? (
            <BottomAction
              label={strings.common.cancel}
              variant="neutral"
              size="compact"
              onPress={() => {
                setChanging(false);
                setError(null);
              }}
              testID="rider-payout-cancel"
            />
          ) : null}
        </>
      ) : (
        <BottomAction label={p.change} variant="ghost" size="compact" onPress={() => setChanging(true)} testID="rider-payout-change" />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  form: {gap: spacing.sm},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  detail: {paddingVertical: spacing.xs},
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  flex: {flex: 1},
  value: {flexShrink: 1, textAlign: 'right'},
  label: {fontSize: typography.small, color: colors.textSecondary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  secondary: {fontSize: typography.body, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
