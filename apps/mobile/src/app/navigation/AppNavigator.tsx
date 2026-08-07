import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {RootStackParamList} from './types';
import {useAppSelector} from '../store/hooks';
import {useBootstrap} from '../../features/auth/hooks/useBootstrap';
import {SplashScreen} from '../../features/auth/screens/SplashScreen';
import {RoleSelectionScreen} from '../../features/auth/screens/RoleSelectionScreen';
import {PhoneSignInScreen} from '../../features/auth/screens/PhoneSignInScreen';
import {EmailSignInScreen} from '../../features/auth/screens/EmailSignInScreen';
import {OtpVerificationScreen} from '../../features/auth/screens/OtpVerificationScreen';
import {ForgotPasswordScreen} from '../../features/auth/screens/ForgotPasswordScreen';
import {PasswordResetSentScreen} from '../../features/auth/screens/PasswordResetSentScreen';
import {CustomerRegistrationScreen} from '../../features/auth/screens/CustomerRegistrationScreen';
import {ChefRegistrationScreen} from '../../features/auth/screens/ChefRegistrationScreen';
import {CustomerAccountStatusScreen} from '../../features/auth/screens/CustomerAccountStatusScreen';
import {ChefAccountStatusScreen} from '../../features/auth/screens/ChefAccountStatusScreen';
import {StartupErrorScreen} from '../../features/auth/screens/StartupErrorScreen';
import {AccountRouterScreen} from '../../features/auth/screens/AccountRouterScreen';

const AuthStack = createNativeStackNavigator<RootStackParamList>();
const CustomerStack = createNativeStackNavigator<RootStackParamList>();
const ChefStack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerShown: false,
  animation: 'fade_from_bottom' as const,
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={screenOptions} initialRouteName="RoleSelection">
      <AuthStack.Screen name="RoleSelection" component={RoleSelectionScreen} />
      <AuthStack.Screen name="PhoneSignIn" component={PhoneSignInScreen} />
      <AuthStack.Screen name="EmailSignIn" component={EmailSignInScreen} />
      <AuthStack.Screen name="OtpVerification" component={OtpVerificationScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="PasswordResetSent" component={PasswordResetSentScreen} />
    </AuthStack.Navigator>
  );
}

function CustomerAccountNavigator() {
  return (
    <CustomerStack.Navigator screenOptions={screenOptions} initialRouteName="AccountRouter">
      <CustomerStack.Screen name="AccountRouter" component={AccountRouterScreen} />
      <CustomerStack.Screen name="CustomerRegistration" component={CustomerRegistrationScreen} />
      <CustomerStack.Screen name="CustomerAccountStatus" component={CustomerAccountStatusScreen} />
    </CustomerStack.Navigator>
  );
}

function ChefAccountNavigator() {
  return (
    <ChefStack.Navigator screenOptions={screenOptions} initialRouteName="AccountRouter">
      <ChefStack.Screen name="AccountRouter" component={AccountRouterScreen} />
      <ChefStack.Screen name="ChefRegistration" component={ChefRegistrationScreen} />
      <ChefStack.Screen name="ChefAccountStatus" component={ChefAccountStatusScreen} />
    </ChefStack.Navigator>
  );
}

export function AppNavigator() {
  const status = useBootstrap();
  const auth = useAppSelector(state => state.auth);

  if (status === 'idle' || status === 'restoring') {
    return <SplashScreen />;
  }

  if (status === 'error') {
    return <StartupErrorScreen />;
  }

  return (
    <NavigationContainer>
      {auth.bootstrapStatus === 'authenticated' ? (
        auth.selectedRole === 'CHEF' ? (
          <ChefAccountNavigator />
        ) : (
          <CustomerAccountNavigator />
        )
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
