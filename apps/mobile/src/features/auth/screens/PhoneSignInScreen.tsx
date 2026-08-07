import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {AuthShell} from '../components/AuthShell';
import {AuthHero} from '../components/AuthHero';
import {RoleSelector} from '../components/RoleSelector';
import {AuthCard} from '../components/AuthCard';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {SecurityNote} from '../components/SecurityNote';
import {colors, spacing} from '../../../design/tokens';
import {authService} from '../state/authService';
import {phoneSchema,toIndianE164} from '../../../utils/validation';
import {toAppApiError} from '../../../core/http/apiError';
import {useAppDispatch} from '../../../app/store/hooks';
import {authActions} from '../state/authSlice';

type Props=NativeStackScreenProps<RootStackParamList,'PhoneSignIn'>;
export function PhoneSignInScreen({navigation,route}:Props){
  const dispatch=useAppDispatch(); const [role,setRole]=useState(route.params.role); const [phone,setPhone]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const parsed=phoneSchema.safeParse(phone);
  const switchRole=(next:typeof role)=>{setRole(next);dispatch(authActions.roleSelected(next));};
  const submit=async()=>{ if(!parsed.success||busy)return; setBusy(true);setError(null); try{const e164=toIndianE164(phone);await authService.beginPhone(role,e164);navigation.navigate('OtpVerification',{role,phone:e164});}catch(e){setError(toAppApiError(e).message);}finally{setBusy(false);} };
  return <AuthShell><AuthHero role={role}/><RoleSelector value={role} onChange={switchRole}/><AuthCard>
    <Text style={styles.title}>Verify your phone number</Text><Text style={styles.desc}>We use Firebase phone verification to keep your Craves account secure.</Text>
    <InputField value={phone} onChangeText={v=>setPhone(v.replace(/\D/g,'').slice(0,10))} placeholder="Phone Number" keyboardType="phone-pad" leftIcon="phone" prefix="+91" error={error ?? (!phone||parsed.success?undefined:'Enter a valid 10-digit mobile number.')}/>
    <PrimaryButton label="Continue" loading={busy} disabled={!parsed.success||busy} onPress={submit}/>
    <PrimaryButton variant="outline" label="Login with email/password" leftIcon="mail" rightIcon="chevron" onPress={()=>navigation.navigate('EmailSignIn',{role})}/>
    <SecurityNote/>
  </AuthCard></AuthShell>;
}
const styles=StyleSheet.create({title:{fontSize:18,fontWeight:'700',color:colors.espressoBrown},desc:{fontSize:13,lineHeight:19,color:colors.mutedText,marginTop:6,marginBottom:spacing.lg}});
