import React, {useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {AuthShell} from '../components/AuthShell';
import {ScreenHeader} from '../components/ScreenHeader';
import {AuthCard} from '../components/AuthCard';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {SecurityNote} from '../components/SecurityNote';
import {colors,spacing} from '../../../design/tokens';
import {otpSchema} from '../../../utils/validation';
import {authService} from '../state/authService';
import {toAppApiError} from '../../../core/http/apiError';
import {useAppDispatch} from '../../../app/store/hooks';
import {authActions} from '../state/authSlice';

type Props=NativeStackScreenProps<RootStackParamList,'OtpVerification'>;
export function OtpVerificationScreen({navigation,route}:Props){
 const dispatch=useAppDispatch(); const [code,setCode]=useState(''); const [busy,setBusy]=useState(false); const [seconds,setSeconds]=useState(30); const [error,setError]=useState<string|null>(null);
 useEffect(()=>{if(seconds<=0)return;const id=setInterval(()=>setSeconds(s=>Math.max(0,s-1)),1000);return()=>clearInterval(id);},[seconds]);
 const finish=async()=>{if(!otpSchema.safeParse(code).success||busy)return;setBusy(true);setError(null);try{const tokens=await authService.confirmOtp(code);dispatch(authActions.authenticated(tokens.identity));}catch(e){setError(toAppApiError(e).message);}finally{setBusy(false);}};
 const resend=async()=>{if(seconds>0||busy)return;setBusy(true);setError(null);try{await authService.beginPhone(route.params.role,route.params.phone);setCode('');setSeconds(30);}catch(e){setError(toAppApiError(e).message);}finally{setBusy(false);}};
 return <AuthShell><ScreenHeader title="Verify OTP" onBack={()=>navigation.goBack()}/><AuthCard><Text style={styles.title}>Enter verification code</Text><Text style={styles.desc}>We sent a 6-digit code to {route.params.phone}.</Text><InputField value={code} onChangeText={v=>setCode(v.replace(/\D/g,'').slice(0,6))} placeholder="6-digit OTP" keyboardType="number-pad" error={error??undefined}/><PrimaryButton label="Verify & Continue" loading={busy} disabled={!otpSchema.safeParse(code).success||busy} onPress={finish}/><Pressable disabled={seconds>0||busy} onPress={resend} accessibilityRole="button"><Text style={[styles.resend,seconds>0&&styles.muted]}>{seconds>0?`Resend code in ${seconds}s`:'Resend verification code'}</Text></Pressable><SecurityNote/></AuthCard></AuthShell>;
}
const styles=StyleSheet.create({title:{fontSize:20,fontWeight:'700',color:colors.espressoBrown},desc:{fontSize:14,lineHeight:21,color:colors.mutedText,marginTop:7,marginBottom:spacing.lg},resend:{textAlign:'center',fontSize:14,fontWeight:'600',color:colors.flameRed,marginTop:spacing.sm},muted:{color:colors.mutedText}});
