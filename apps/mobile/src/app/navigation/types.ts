import type {AuthRole, ChefApplicationStatus} from '../../features/auth/domain/types';

/**
 * Current registered route parameters. Existing auth/account screens intentionally
 * continue to consume this flat list while P11 separates navigator registration
 * by role. Later product phases can migrate screens into their domain lists without
 * introducing a second navigation container.
 */
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

export type AuthStackParamList = Pick<
  RootStackParamList,
  | 'Splash'
  | 'RoleSelection'
  | 'PhoneSignIn'
  | 'EmailSignIn'
  | 'OtpVerification'
  | 'ForgotPassword'
  | 'PasswordResetSent'
  | 'StartupError'
>;

export type CustomerAccountStackParamList = Pick<
  RootStackParamList,
  'AccountRouter' | 'CustomerRegistration' | 'CustomerAccountStatus'
>;

export type ChefAccountStackParamList = Pick<
  RootStackParamList,
  'AccountRouter' | 'ChefRegistration' | 'ChefAccountStatus'
>;

/**
 * P11 domain model. Customer/Chef currently expose only their accepted account
 * resolution routes. Transactional and modal route lists remain deliberately
 * unregistered until their owning implementation phases add real screens.
 */
export type NavigationDomainParamLists = {
  Auth: AuthStackParamList;
  Customer: CustomerAccountStackParamList;
  Chef: ChefAccountStackParamList;
  Transactional: never;
  Modal: never;
};

export type NavigationDomain = keyof NavigationDomainParamLists;
export type RegisteredRouteName = keyof RootStackParamList;
