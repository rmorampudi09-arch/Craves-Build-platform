import React, {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View} from 'react-native';
import Svg, {Path, Rect} from 'react-native-svg';
import {ReferralMobileError, type ReferralNativeApi} from './api';
import {invitation, money, toPaise, uuid, type CashoutsPage, type ReferralOverview, type RewardsPage, type WithdrawalAttempt} from './model';
import {createOperationGate, mayDiscardRejectedAttempt} from './operation-safety';
import {secureReferralRecovery, type ReferralRecovery} from './recovery';

type Props = {accountId: string; api: ReferralNativeApi; newRequestId: () => string; recovery?: ReferralRecovery; brand?: ReactNode; onBack?: () => void};
const message = (error: unknown) => error instanceof Error ? error.message : 'This request could not be verified.';
const time = (value: string) => new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value)) + ' IST';
export function ReferralRewardsScreen(props: Props) { return <ReferralRewardsContent key={props.accountId} {...props} />; }
function ReferralRewardsContent({accountId, api, newRequestId, recovery = secureReferralRecovery, brand, onBack}: Props) {
  const [operations] = useState(createOperationGate);
  const [summary, setSummary] = useState<ReferralOverview | null>(null), [rewards, setRewards] = useState<RewardsPage>({items: [], nextCursor: null});
  const [cashouts, setCashouts] = useState<CashoutsPage>({items: [], nextCursor: null}), [qr, setQr] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [amount, setAmount] = useState(''), [confirmed, setConfirmed] = useState(false), [pending, setPending] = useState<WithdrawalAttempt | null>(null), [ready, setReady] = useState(false), [now, setNow] = useState(0);
  const epoch = useRef(0), mounted = useRef(false), abort = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {epoch.current++; mounted.current = false; abort.current?.abort();}, []);
  const load = useCallback(async () => {
    const current = ++epoch.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError('');
    try {
      const [s, r, c] = await Promise.all([api.overview(controller.signal), api.rewards(null, controller.signal), api.cashouts(null, controller.signal)]);
      if (current !== epoch.current || !mounted.current) { return; }
      invitation(s); setSummary(s); setRewards(r); setCashouts(c); setNow(Date.now());
      try {const path = await api.qr(controller.signal); if (current === epoch.current && mounted.current) {setQr(path);}} catch {if (current === epoch.current && mounted.current) {setQr('');}}
    } catch (failure) {
      if (current !== epoch.current || !mounted.current) { return; }
      if (failure instanceof ReferralMobileError && [401, 403].includes(failure.status)) {setSummary(null); setRewards({items: [], nextCursor: null}); setCashouts({items: [], nextCursor: null}); setQr('');}
      setError(message(failure));
    } finally {if (current === epoch.current && mounted.current) {setLoading(false);}}
  }, [api]);
  useEffect(() => {
    mounted.current = true; setReady(false);
    recovery.load(accountId).then(value => {if (mounted.current) {setPending(value); setReady(true);}}).catch(failure => {if (mounted.current) {setNotice(message(failure));}});
    void load(); const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {invalidate(); clearInterval(timer);};
  }, [accountId, recovery, load, invalidate]);
  const fresh = Boolean(summary && now >= Date.parse(summary.asOf) - 30000 && now - Date.parse(summary.asOf) < 300000 && !error && !loading);
  async function share() {
    if (!summary) { return; }
    try {await Share.share({message: `Explore Craves. Rewards apply to qualifying delivered sales, not signups. ${invitation(summary)}`});}
    catch {if (mounted.current) {setNotice('Sharing is unavailable. Copy the selectable invitation link.');}}
  }
  async function withdraw() {
    if (busy || !ready || !summary || (!pending && (!fresh || !confirmed || !summary.cashout.eligible))) { return; }
    if (!operations.enter()) { return; }
    const recovering = Boolean(pending);
    setBusy(true); setNotice('');
    try {
      const operation = pending ?? {id: uuid.parse(newRequestId()), amountPaise: toPaise(amount)};
      if (BigInt(operation.amountPaise) <= BigInt(0)) { throw new Error('Enter an amount above zero.'); }
      await recovery.save(accountId, operation); if (!mounted.current) { return; } setPending(operation);
      const result = await api.withdraw(operation.id, operation.amountPaise); if (!mounted.current) { return; }
      await recovery.clear(accountId); if (!mounted.current) { return; }
      setPending(null); setAmount(''); setConfirmed(false); setNotice(`Withdrawal ${result.status.toLowerCase()}. This is not proof of a completed bank payment.`); await load();
    } catch (failure) {
      if (!mounted.current) { return; }
      if (failure instanceof ReferralMobileError && mayDiscardRejectedAttempt(recovering, failure.status, failure.uncertain)) {try {await recovery.clear(accountId); if (mounted.current) {setPending(null);}} catch {if (mounted.current) {setReady(false);}}}
      if (mounted.current) {setNotice(message(failure));}
    } finally {operations.leave(); if (mounted.current) {setBusy(false);}}
  }
  async function cancel(id: string) {
    if (busy || !fresh || !operations.enter()) { return; } setBusy(true);
    try {await api.cancel(id); if (mounted.current) {setNotice('Reservation cancelled before submission.'); await load();}}
    catch (failure) {if (mounted.current) {setNotice(message(failure));}}
    finally {operations.leave(); if (mounted.current) {setBusy(false);}}
  }
  async function older(kind: 'rewards' | 'cashouts') {
    if (busy) { return; } setBusy(true); const current = epoch.current;
    try {
      if (kind === 'rewards' && rewards.nextCursor) {const page = await api.rewards(rewards.nextCursor); if (mounted.current && current === epoch.current) {setRewards(page);}}
      if (kind === 'cashouts' && cashouts.nextCursor) {const page = await api.cashouts(cashouts.nextCursor); if (mounted.current && current === epoch.current) {setCashouts(page);}}
    } catch (failure) {if (mounted.current) {setNotice(message(failure));}}
    finally {if (mounted.current) {setBusy(false);}}
  }
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {if (!busy) {void load();}}} />}>
    {onBack && <Button label="Back" onPress={onBack} />}{brand}<Text style={s.eyebrow}>CRAVES · REFERRAL REWARDS</Text><Text accessibilityRole="header" style={s.title}>Good food.{ '\n' }Great connections.</Text><Text style={s.body}>Invite people to Craves. Earn from qualifying delivered sales, never from signing someone up.</Text>
    {error !== '' && <Text accessibilityRole="alert" style={s.warning}>{error}</Text>}{notice !== '' && <Text accessibilityLiveRegion="polite" style={s.warning}>{notice}</Text>}
    {loading && !summary && <ActivityIndicator accessibilityLabel="Loading verified referral balances" />}
    {summary && <>
      {!fresh && !loading && <Text style={s.warning}>This snapshot is stale. Pull to refresh before a financial request.</Text>}
      {summary.onReviewHold && <Text style={s.warning}>This account is under review. Held rewards cannot be spent or withdrawn.</Text>}
      <View style={s.card}><Text style={s.label}>Available rewards</Text><Text style={s.balance}>{money(summary.availablePaise)}</Text><Text style={s.body}>Pending {money(summary.pendingPaise)} · Reserved {money(summary.reservedPaise)}</Text>{BigInt(summary.availablePaise) < BigInt(0) && <Text style={s.warning}>A refund clawback created a recoverable balance.</Text>}<Text style={s.small}>Updated {time(summary.balanceUpdatedAt)}</Text></View>
      <View style={s.card}><Text accessibilityRole="header" style={s.heading}>Your invitation</Text><Text selectable style={s.code}>{summary.code.code}</Text><Text selectable style={s.link}>{summary.code.link}</Text>{qr !== '' ? <View style={s.qr} accessibilityLabel="Your Craves invitation QR code"><Svg width={176} height={176} viewBox="0 0 256 256"><Rect width={256} height={256} fill="white" /><Path d={qr} fill="black" /></Svg></View> : <Text style={s.small}>QR unavailable. Your verified invitation link still works.</Text>}<Button label="Share invitation" onPress={() => void share()} /><Text style={s.small}>Attribution is fixed at account creation. Sharing alone creates no reward.</Text></View>
      <View style={s.card}><Text accessibilityRole="header" style={s.heading}>Three generations. One fair rule.</Text>{summary.levels.map(level => <View key={level.level} style={s.row}><View style={s.flex}><Text style={s.label}>Generation {level.level}</Text><Text style={s.small}>{summary.policy ? `${summary.policy.ratesBps[level.level - 1] / 100}% of qualifying food subtotal` : 'No active rate'} · {summary.downline.find(item => item.level === level.level)?.members ?? '0'} members</Text></View><Text style={s.label}>{money(level.netEarnedPaise)}</Text></View>)}<Text style={s.small}>Network counts are anonymised, not income forecasts. Unused shares stay with Craves; the selling chef’s earnings are not reduced.</Text></View>
      <View style={s.card}><Text accessibilityRole="header" style={s.heading}>Programme rules</Text>{summary.policy ? <><Text style={s.body}>Qualifying food subtotal: {money(summary.policy.minimumPaise)}. Refund hold: {summary.policy.holdDays} days. Seller-chain maximum: {summary.policy.capBps / 100}%.</Text><Text style={s.body}>First qualifying customer-order bonus: {money(summary.policy.customerBonusPaise)}. Invitee discount: {money(summary.policy.inviteeDiscountPaise)}. These use separate marketing budgets outside the 4% cap.</Text></> : <Text style={s.warning}>No programme policy is active.</Text>}<Text style={s.small}>Taxes, delivery and tips are not the reward basis. Refunds can reverse rewards, including credited balances. No earnings are guaranteed.</Text></View>
      <View style={s.card}><Text accessibilityRole="header" style={s.heading}>Request a withdrawal</Text><Text style={s.body}>Minimum {money(summary.cashout.minimumPaise)}. KYC, recipient and tax checks are verified by the server.</Text>{!summary.cashout.eligible && <Text style={s.warning}>Withdrawals are not available for this account or policy yet.</Text>}<Text style={s.label}>Amount in rupees</Text><TextInput accessibilityLabel="Withdrawal amount in rupees" style={s.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!busy && !pending && summary.cashout.eligible} placeholder="0.00" placeholderTextColor="#71665f" /><Pressable accessibilityRole="checkbox" accessibilityState={{checked: confirmed, disabled: busy || Boolean(pending)}} disabled={busy || Boolean(pending)} onPress={() => setConfirmed(!confirmed)} style={s.check}><Text style={s.body}>{confirmed ? '☑' : '☐'} This reserves rewards for review, not an instant bank payment.</Text></Pressable>{pending && <Text selectable style={s.warning}>Original request {pending.id}: {money(pending.amountPaise)}. Retry this reference; do not create a replacement.</Text>}<Button label={busy ? 'Checking…' : pending ? 'Retry original request' : 'Reserve withdrawal'} disabled={busy || !ready || (!pending && (!fresh || !confirmed || !summary.cashout.eligible))} onPress={() => void withdraw()} /></View>
      <View style={s.card}><Text accessibilityRole="header" style={s.heading}>Reward history</Text>{rewards.items.length === 0 && <Text style={s.body}>No qualifying rewards yet.</Text>}{rewards.items.map(item => <View style={s.history} key={item.id}><Text style={s.label}>{item.track === 'UPLINE' ? `Chef · level ${item.level}` : 'Customer bonus'} · {money(item.netPaise)}</Text><Text style={s.small}>{item.status.toLowerCase()} · Hold ends {time(item.holdUntil)}</Text>{item.reversedPaise !== '0' && <Text style={s.small}>{money(item.reversedPaise)} reversed</Text>}</View>)}{rewards.nextCursor && <Button label="Older rewards" disabled={busy} onPress={() => void older('rewards')} />}</View>
      <View style={s.card}><Text accessibilityRole="header" style={s.heading}>Withdrawal history</Text>{cashouts.items.length === 0 && <Text style={s.body}>No withdrawal requests.</Text>}{cashouts.items.map(item => <View style={s.history} key={item.id}><Text style={s.label}>{money(item.amountPaise)} · {item.status.toLowerCase()}</Text><Text selectable style={s.small}>{item.id}</Text><Text style={s.small}>{time(item.requestedAt)}</Text>{item.status === 'UNKNOWN' && <Text style={s.warning}>Do not request a replacement payment.</Text>}{['RESERVED', 'APPROVED'].includes(item.status) && <Button label="Cancel reservation" disabled={busy || !fresh} onPress={() => void cancel(item.id)} />}</View>)}{cashouts.nextCursor && <Button label="Older withdrawals" disabled={busy} onPress={() => void older('cashouts')} />}</View>
      <Text style={s.small}>Balances are funded by Craves, not deducted from the selling chef’s earnings. Pull to refresh to return to the newest history page.</Text>
    </>}
  </ScrollView>;
}
function Button({label, onPress, disabled = false}: {label: string; onPress: () => void; disabled?: boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({screen: {flex: 1, backgroundColor: '#fcfaf7'}, content: {padding: 20, paddingBottom: 44, gap: 16, width: '100%', maxWidth: 820, alignSelf: 'center'}, eyebrow: {color: '#b82c21', fontWeight: '800', fontSize: 11, letterSpacing: 1.5}, title: {fontSize: 34, lineHeight: 39, letterSpacing: -1, fontWeight: '800', color: '#251c19'}, body: {color: '#51463f', fontSize: 14, lineHeight: 22}, small: {color: '#665b55', fontSize: 12, lineHeight: 19}, card: {backgroundColor: 'white', borderColor: '#e8e0d9', borderWidth: 1, borderRadius: 20, padding: 20, gap: 12}, heading: {fontSize: 19, fontWeight: '700', color: '#251c19'}, label: {fontSize: 14, fontWeight: '700', color: '#251c19'}, balance: {fontSize: 34, fontWeight: '800', color: '#251c19', fontVariant: ['tabular-nums']}, row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee7df'}, flex: {flex: 1}, code: {fontSize: 18, fontWeight: '800', letterSpacing: 1, color: '#b82c21'}, link: {fontSize: 13, color: '#a12720', lineHeight: 21}, qr: {alignSelf: 'center', padding: 12, backgroundColor: 'white'}, warning: {color: '#735109', backgroundColor: '#fff4d8', padding: 12, borderRadius: 10, fontSize: 13, lineHeight: 20}, input: {minHeight: 48, borderWidth: 1, borderColor: '#cfc4bc', borderRadius: 12, paddingHorizontal: 14, color: '#251c19', fontSize: 18}, check: {minHeight: 48, justifyContent: 'center'}, button: {minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#c52e23', borderRadius: 12, padding: 13}, buttonText: {fontWeight: '700', color: 'white', fontSize: 14}, disabled: {opacity: 0.45}, history: {paddingVertical: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: '#eee7df'}});
