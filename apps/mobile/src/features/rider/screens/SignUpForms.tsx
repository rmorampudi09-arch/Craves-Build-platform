import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {InputField} from '../../../shared/components';
import {borderWidth, colors, fontWeight, spacing, typography} from '../../../design/tokens';
import type {PayoutAccountInput, RiderMe, RiderProfile, RiderSignUp, VehicleKind} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {ChoiceChip, ChoiceRow, Segmented} from '../components/Choices';
import {StatusBadge} from '../components/StatusBadge';
import {Card} from '../components/ui';
import {vehicleModel} from '../domain/application';
import {riderMessage} from '../domain/problem';
import {riderKeys} from '../state/riderQueries';
import {RIDER_LANGUAGES, serverLanguage, useStrings} from '../strings/StringsProvider';

/** The same checks the server makes (FleetRules), so most mistakes never leave the phone. */
const PLATE = /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;
const UPI = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const VEHICLES: VehicleKind[] = ['PETROL', 'ELECTRIC', 'BICYCLE'];

/** The words of a name in any order or case: "Gopi K" is still "K Gopi" (the server's FleetRules.sameName). */
export const nameWords = (name: string) => name.toLowerCase().split(/[\s.,'-]+/).filter(Boolean).sort().join(' ');
/** "  Ravi   Kumar " is "Ravi Kumar". */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** What the rider rides: the kind and, for a motor vehicle, the plate and the make and model as typed. */
export interface VehicleDraft {
  kind: VehicleKind;
  plate: string;
  model: string;
}

/**
 * The sign-up's vehicle fields, checked like the server checks them; null when the plate is wrong. With `keepPlate` (a plate
 * is on file) an empty plate keeps it. An empty make and model is left out, which keeps the one on file.
 */
export function vehicleFields(draft: VehicleDraft, keepPlate: boolean): Pick<RiderSignUp, 'vehicleKind' | 'vehicleRegNumber' | 'vehicleModel'> | null {
  if (draft.kind === 'BICYCLE') {
    return {vehicleKind: 'BICYCLE'};
  }
  const plate = draft.plate.replace(/[\s-]/g, '').toUpperCase();
  if (!PLATE.test(plate) && !(plate === '' && keepPlate)) {
    return null;
  }
  const model = cleanName(draft.model);
  return {vehicleKind: draft.kind, vehicleRegNumber: plate, ...(model ? {vehicleModel: model} : {})};
}

/** The app's language, chosen in its own script; nothing to choose while only English is offered. */
export function LanguageField() {
  const {strings, language, setLanguage} = useStrings();
  const label = strings.account.join.language;
  if (RIDER_LANGUAGES.length < 2) {
    return null;
  }
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <ChoiceRow label={label}>
        {RIDER_LANGUAGES.map(code => (
          <ChoiceChip
            key={code}
            label={strings.languages[code]}
            selected={language === code}
            onPress={() => setLanguage(code)}
            testID={`rider-join-language-${code}`}
          />
        ))}
      </ChoiceRow>
    </>
  );
}

/** What will you ride, then the plate and the make and model for anything with an engine. */
export function VehicleFields({
  draft,
  onChange,
  keepPlate,
  plateError,
}: {
  draft: VehicleDraft;
  onChange(next: VehicleDraft): void;
  /** The masked plate on file, which an empty plate keeps. */
  keepPlate?: string;
  plateError?: string;
}) {
  const {strings} = useStrings();
  const j = strings.account.join;
  const ap = strings.account.apply;
  return (
    <>
      <Text style={styles.label}>{j.vehicle}</Text>
      <ChoiceRow label={j.vehicle}>
        {VEHICLES.map(kind => (
          <ChoiceChip
            key={kind}
            label={j.vehicles[kind]}
            selected={draft.kind === kind}
            onPress={() => onChange({...draft, kind})}
            testID={`rider-join-${kind}`}
          />
        ))}
      </ChoiceRow>
      {draft.kind === 'BICYCLE' ? null : (
        <>
          <InputField
            label={j.plate}
            placeholder="TS09EA1234"
            value={draft.plate}
            onChangeText={plate => onChange({...draft, plate})}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={14}
            error={plateError}
            helperText={keepPlate ? strings.account.details.keepPlate(keepPlate) : undefined}
            testID="rider-join-plate"
          />
          <InputField
            label={ap.model}
            placeholder="Honda Activa 6G"
            value={draft.model}
            onChangeText={model => onChange({...draft, model})}
            maxLength={40}
            helperText={ap.modelHint}
            testID="rider-join-model"
          />
        </>
      )}
    </>
  );
}

/** A PENDING rider correcting their details: what is on file now, and whether a payout account waits in the current name. */
interface Correction {
  name: string;
  vehicle?: VehicleKind;
  model?: string;
  plateMasked?: string;
  payoutSent: boolean;
  onClose(saved: boolean): void;
}

/** Corrects the name, language and vehicle until ops activates the rider; an empty plate keeps the one on file. */
function DetailsForm({edit}: {edit: Correction}) {
  const {strings, language} = useStrings();
  const d = strings.account.details;
  const ap = strings.account.apply;
  const queryClient = useQueryClient();
  const [name, setName] = useState(edit.name);
  const [vehicle, setVehicle] = useState<VehicleDraft>({kind: edit.vehicle ?? 'PETROL', plate: '', model: edit.model ?? ''});
  const [nameError, setNameError] = useState<string>();
  const [plateError, setPlateError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const renamed = edit.payoutSent && nameWords(name) !== nameWords(edit.name);

  async function save() {
    const fullName = cleanName(name);
    const fields = vehicleFields(vehicle, Boolean(edit.plateMasked));
    setNameError(fullName.length < 2 ? ap.nameMissing : undefined);
    setPlateError(fields ? undefined : ap.plateMissing);
    if (fullName.length < 2 || !fields) {
      return;
    }
    setError(null);
    try {
      const me = await riderApi.signUp({name: fullName, language: serverLanguage(language), ...fields, adult: true});
      queryClient.setQueryData(riderKeys.me, me);
      await queryClient.invalidateQueries({queryKey: riderKeys.profile});
      edit.onClose(true);
    } catch (caught) {
      setError(riderMessage(caught, strings, language));
    }
  }

  return (
    <Card style={styles.form}>
      <Text accessibilityRole="header" style={styles.strong}>
        {d.title}
      </Text>
      <InputField
        label={ap.name}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        maxLength={120}
        error={nameError}
        helperText={d.nameHint}
        testID="rider-join-name"
      />
      {renamed ? <Banner tone="warning" inset text={d.resendPayout} testID="rider-join-resend-payout" /> : null}
      <LanguageField />
      <VehicleFields draft={vehicle} onChange={setVehicle} keepPlate={edit.plateMasked} plateError={plateError} />
      {error ? <Banner tone="warning" inset text={error} testID="rider-join-error" /> : null}
      <BottomAction label={d.save} variant="outline" size="compact" onPress={save} testID="rider-join-submit" />
      <BottomAction label={strings.common.cancel} variant="neutral" size="compact" onPress={() => edit.onClose(false)} testID="rider-join-cancel" />
    </Card>
  );
}

/** What a PENDING rider applied with, which they can correct until ops activates them. */
export function DetailsCard({me, profile}: {me: RiderMe; profile: RiderProfile}) {
  const {strings, language} = useStrings();
  const d = strings.account.details;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const {vehicle} = profile;
  const model = vehicleModel(vehicle.label);

  if (editing) {
    return (
      <DetailsForm
        edit={{
          name: me.name,
          vehicle: vehicle.kind,
          model,
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
    // The language the app shows; the server keeps English for a Kannada reader (serverLanguage).
    [d.language, strings.languages[language]],
    // The make and model when the rider gave one; else the kind they ride.
    [d.vehicle, model ?? (vehicle.kind ? strings.account.join.vehicles[vehicle.kind] : vehicle.label)],
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
 * A UPI ID or bank account typed in, checked like the server checks it, and sent; submit() says whether it went, and calls
 * `onSent` before the profile reloads, so a screen the reload replaces can still say it went.
 */
export function usePayoutForm(kycName: string) {
  const {strings, language} = useStrings();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<PayoutAccountInput['method']>('UPI');
  const [upiId, setUpiId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holder, setHolder] = useState(kycName);
  const [error, setError] = useState<string | null>(null);

  async function submit(onSent?: () => void): Promise<boolean> {
    const input: PayoutAccountInput =
      method === 'UPI'
        ? {method, holderName: holder.trim(), upiId: upiId.trim()}
        : {method, holderName: holder.trim(), accountNumber: accountNumber.replace(/\s/g, ''), ifsc: ifsc.trim().toUpperCase()};
    const valid = input.method === 'UPI' ? UPI.test(input.upiId) : /^[0-9]{9,18}$/.test(input.accountNumber) && IFSC.test(input.ifsc);
    if (!valid || input.holderName.length < 2) {
      setError(strings.account.payout.incomplete);
      return false;
    }
    setError(null);
    try {
      await riderApi.submitPayoutAccount(input);
    } catch (caught) {
      setError(riderMessage(caught, strings, language));
      return false;
    }
    onSent?.();
    await queryClient.invalidateQueries({queryKey: riderKeys.profile});
    return true;
  }

  return {method, setMethod, upiId, setUpiId, accountNumber, setAccountNumber, ifsc, setIfsc, holder, setHolder, error, setError, submit};
}

export type PayoutForm = ReturnType<typeof usePayoutForm>;

/** The payout account fields; the caller puts the button that sends them where its flow needs it. */
export function PayoutFields({form, kycName}: {form: PayoutForm; kycName: string}) {
  const p = useStrings().strings.account.payout;
  return (
    <>
      <Text style={styles.secondary}>{p.body(kycName)}</Text>
      <Segmented
        value={form.method}
        options={(['UPI', 'BANK'] as const).map(value => ({value, label: p.methods[value]}))}
        onChange={form.setMethod}
        label={p.title}
        testID="rider-payout-method"
      />
      {form.method === 'UPI' ? (
        <InputField
          label={p.upiId}
          placeholder="name@okaxis"
          value={form.upiId}
          onChangeText={form.setUpiId}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          maxLength={100}
          helperText={p.upiHint}
          testID="rider-payout-upi"
        />
      ) : (
        <>
          <InputField
            label={p.accountNumber}
            value={form.accountNumber}
            onChangeText={form.setAccountNumber}
            keyboardType="number-pad"
            maxLength={22}
            testID="rider-payout-account-number"
          />
          <InputField
            label={p.ifsc}
            placeholder="SBIN0001234"
            value={form.ifsc}
            onChangeText={form.setIfsc}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={11}
            testID="rider-payout-ifsc"
          />
        </>
      )}
      <InputField
        label={p.holder}
        value={form.holder}
        onChangeText={form.setHolder}
        maxLength={120}
        helperText={p.holderHint}
        testID="rider-payout-holder"
      />
      {form.error ? <Banner tone="warning" inset text={form.error} testID="rider-payout-error" /> : null}
    </>
  );
}

/**
 * The rider's own UPI ID or bank account, in their KYC name. It waits for ops to check it against the bank proof before
 * anything is paid. Remount it (key) when the name changes, so the holder name follows.
 */
export function PayoutAccountCard({profile, kycName, onSent}: {profile: RiderProfile; kycName: string; onSent?: () => void}) {
  const {strings} = useStrings();
  const a = strings.account;
  const p = a.payout;
  const form = usePayoutForm(kycName);
  const hasAccount = Boolean(profile.payoutAccountSubmitted || profile.payoutAccountMasked);
  const [changing, setChanging] = useState(false);
  // No account yet (or the one sent was set aside): the form is the only thing to show.
  const editing = changing || !hasAccount;

  return (
    <Card style={styles.form}>
      <Text accessibilityRole="header" style={styles.strong}>
        {p.title}
      </Text>
      {profile.payoutAccountReturned && !hasAccount ? (
        <Banner tone="warning" inset text={a.apply.payoutAgain} testID="rider-payout-returned" />
      ) : null}
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
          <PayoutFields form={form} kycName={kycName} />
          <BottomAction
            label={p.submit}
            variant="outline"
            size="compact"
            onPress={async () => {
              if (await form.submit(onSent)) {
                setChanging(false);
              }
            }}
            testID="rider-payout-submit"
          />
          {hasAccount ? (
            <BottomAction
              label={strings.common.cancel}
              variant="neutral"
              size="compact"
              onPress={() => {
                setChanging(false);
                form.setError(null);
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
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  detail: {paddingVertical: spacing.xs},
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  flex: {flex: 1},
  value: {flexShrink: 1, textAlign: 'right'},
  // Names a group of choices as InputField names a field (shared/components/InputField.tsx), so the form reads as one.
  label: {fontSize: typography.small, fontWeight: fontWeight.semibold, color: colors.textPrimary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  secondary: {fontSize: typography.body, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
