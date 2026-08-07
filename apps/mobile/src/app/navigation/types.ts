import type {AuthRole, ChefApplicationStatus} from '../../features/auth/domain/types';

export type RootStackParamList = {
  Splash: undefined;
  RoleSelection: undefined;
  PhoneSignIn: {role: AuthRole};
  EmailSignIn: {role: AuthRole; email?: string};
  OtpVerification: {role: AuthRole; phone: string};
  ForgotPassword: {role: AuthRole; email?: string};
  PasswordResetSent: {role: AuthRole; email: string};
  AccountRouter: undefined;
  CustomerRegistration: undefined;
  CustomerAccountStatus: undefined;
  ChefRegistration: undefined;
  ChefAccountStatus: {status?: ChefApplicationStatus};
  StartupError: {message: string};
};
