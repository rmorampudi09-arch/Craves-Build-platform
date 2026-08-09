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

export type CustomerDishDetailRouteParams = {menuItemId: string};
export type CustomerDishIngredientsRouteParams = {menuItemId: string};
export type CustomerKitchenProfileRouteParams = {kitchenId: string};
export type CustomerKitchenDishesRouteParams = {kitchenId: string};
export type CustomerOrderRouteParams = {orderId: string};

export type CustomerDishDetailStackParamList = {
  CustomerDishDetail: CustomerDishDetailRouteParams;
  CustomerDishIngredients: CustomerDishIngredientsRouteParams;
  CustomerKitchenProfile: CustomerKitchenProfileRouteParams;
  CustomerKitchenDishes: CustomerKitchenDishesRouteParams;
};

export type CustomerOrderDetailStackParamList = {
  CustomerOrderDetail: CustomerOrderRouteParams;
  CustomerOrderTracking: CustomerOrderRouteParams;
};

export type CustomerCartStackParamList = {CustomerCart: undefined};
export type CustomerPaymentMethodsStackParamList = {CustomerPaymentMethods: undefined};

export type CustomerHomeStackParamList = {
  CustomerHomeRoot: undefined;
  CustomerFilterSort: CustomerFilterSortRouteParams;
} & CustomerDishDetailStackParamList &
  CustomerCartStackParamList &
  CustomerPaymentMethodsStackParamList;

export type CustomerChefsStackParamList = {
  CustomerChefsRoot: undefined;
  CustomerFilterSort: CustomerFilterSortRouteParams;
} & CustomerDishDetailStackParamList &
  CustomerCartStackParamList &
  CustomerPaymentMethodsStackParamList;

export type CustomerOrdersStackParamList = {
  CustomerOrdersRoot: undefined;
} & CustomerOrderDetailStackParamList &
  CustomerCartStackParamList &
  CustomerPaymentMethodsStackParamList;

/** P75 registers the complete customer Settings child-route surface. */
export type CustomerSettingsChildStackParamList = {
  CustomerSettingsNotifications: undefined;
  CustomerSettingsPrivacySecurity: undefined;
  CustomerSettingsChangePassword: undefined;
  CustomerSettingsLanguage: undefined;
  CustomerSettingsAppearance: undefined;
  CustomerSettingsAbout: undefined;
  CustomerSettingsShare: undefined;
  CustomerSettingsReferral: undefined;
  CustomerSettingsSupport: undefined;
  CustomerSettingsSubscription: undefined;
  CustomerSettingsLegal: undefined;
};

export type CustomerProfileStackParamList = {
  CustomerProfileRoot: undefined;
  CustomerProfileEdit: undefined;
  CustomerAddresses: undefined;
  CustomerFavorites: undefined;
  CustomerNotifications: undefined;
  CustomerSettings: undefined;
} & CustomerSettingsChildStackParamList &
  CustomerDishDetailStackParamList &
  CustomerOrderDetailStackParamList &
  CustomerCartStackParamList &
  CustomerPaymentMethodsStackParamList;

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

/** P80 establishes Chef product ownership without pre-implementing P81+ screens. */
export type ChefTabParamList = {
  Dashboard: undefined;
  Orders: undefined;
  Menu: undefined;
  Analytics: undefined;
  Profile: undefined;
};

export type ChefTabRouteName = keyof ChefTabParamList;

export type CustomerDomainParamList = CustomerAccountStackParamList & CustomerTabParamList;
export type ChefDomainParamList = ChefAccountStackParamList & ChefTabParamList;
export type TransactionalStackParamList = CustomerCartStackParamList & CustomerPaymentMethodsStackParamList;

export type NavigationDomainParamLists = {
  Auth: AuthStackParamList;
  Customer: CustomerDomainParamList;
  Chef: ChefDomainParamList;
  Transactional: TransactionalStackParamList;
  Modal: never;
};

export type NavigationDomain = keyof NavigationDomainParamLists;
export type RegisteredRouteName =
  | keyof RootStackParamList
  | CustomerTabRouteName
  | CustomerStackRouteName
  | ChefTabRouteName;
