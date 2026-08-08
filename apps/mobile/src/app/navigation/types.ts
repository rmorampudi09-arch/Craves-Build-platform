import type {NavigatorScreenParams} from '@react-navigation/native';
import type {AuthRole, ChefApplicationStatus} from '../../features/auth/domain/types';

/**
 * Current registered route parameters. Existing auth/account screens intentionally
 * continue to consume this flat list while product navigators are introduced as
 * typed nested domains without creating a second navigation container.
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

export type CustomerFilterSortRouteParams = {
  origin: 'HOME' | 'CHEFS';
};

/**
 * P25 customer shell types. Each bottom tab owns a stack navigator so later
 * product phases can add child routes without resetting sibling tab state.
 */
export type CustomerHomeStackParamList = {
  CustomerHomeRoot: undefined;
  CustomerFilterSort: CustomerFilterSortRouteParams;
};

export type CustomerChefsStackParamList = {
  CustomerChefsRoot: undefined;
  CustomerFilterSort: CustomerFilterSortRouteParams;
};

export type CustomerOrdersStackParamList = {
  CustomerOrdersRoot: undefined;
};

export type CustomerProfileStackParamList = {
  CustomerProfileRoot: undefined;
};

export type CustomerTabParamList = {
  Home: NavigatorScreenParams<CustomerHomeStackParamList> | undefined;
  Chefs: NavigatorScreenParams<CustomerChefsStackParamList> | undefined;
  Orders: NavigatorScreenParams<CustomerOrdersStackParamList> | undefined;
  Profile: NavigatorScreenParams<CustomerProfileStackParamList> | undefined;
};

export type CustomerTabRouteName = keyof CustomerTabParamList;
export type CustomerStackRouteName =
  | keyof CustomerHomeStackParamList
  | keyof CustomerChefsStackParamList
  | keyof CustomerOrdersStackParamList
  | keyof CustomerProfileStackParamList;

export type CustomerDomainParamList = CustomerAccountStackParamList & CustomerTabParamList;

/**
 * P11/P25 domain model. Transactional and modal route lists remain deliberately
 * unregistered until their owning implementation phases add real screens.
 */
export type NavigationDomainParamLists = {
  Auth: AuthStackParamList;
  Customer: CustomerDomainParamList;
  Chef: ChefAccountStackParamList;
  Transactional: never;
  Modal: never;
};

export type NavigationDomain = keyof NavigationDomainParamLists;
export type RegisteredRouteName =
  | keyof RootStackParamList
  | CustomerTabRouteName
  | CustomerStackRouteName;
