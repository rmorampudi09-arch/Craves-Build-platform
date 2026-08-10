import type {NavigatorScreenParams} from '@react-navigation/native';
import type {AuthRole, ChefApplicationStatus} from '../../features/auth/domain/types';

/**
 * Current registered route parameters. Existing auth/account screens intentionally
 * continue to consume this flat list while product navigators are introduced as
 * typed nested domains without creating a second navigation container.
 *
 * Privacy boundary: auth routes carry only non-sensitive flow context. Email,
 * phone, OTP, password and other credentials remain in component/module memory.
 */
export type RootStackParamList = {
  Splash: undefined;
  RoleSelection: undefined;
  PhoneSignIn: {role: AuthRole};
  EmailSignIn: {role: AuthRole};
  OtpVerification: {role: AuthRole};
  ForgotPassword: {role: AuthRole};
  PasswordResetSent: {role: AuthRole};
  AccountRouter: undefined;
  CustomerRegistration: undefined;
  CustomerAccountStatus: undefined;
  ChefRegistration: undefined;
  ChefAccountStatus: {status?: ChefApplicationStatus};
  StartupError: undefined;
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

/** P90 completes the authorized Chef Orders stack through read-only Completed history. */
export type ChefOrdersStackParamList = {
  ChefOrdersPreparing: undefined;
  ChefOrdersNew: undefined;
  ChefOrdersReady: undefined;
  ChefOrdersCompleted: undefined;
};

/** P108 adds the fail-closed Chef App Preferences route while preserving existing profile flows. */
export type ChefProfileStackParamList = {
  ChefProfileHome: undefined;
  ChefBusinessInformation: undefined;
  ChefPayoutHistory: undefined;
  ChefSubscriptionPlan: undefined;
  ChefAppPreferences: undefined;
  ChefEditProfile: undefined;
};

/** P80 establishes Chef product ownership without pre-implementing later Chef surfaces. */
export type ChefTabParamList = {
  Dashboard: undefined;
  Orders: NavigatorScreenParams<ChefOrdersStackParamList> | undefined;
  Menu: undefined;
  Analytics: undefined;
  Profile: NavigatorScreenParams<ChefProfileStackParamList> | undefined;
};

export type ChefOrderDetailRouteParams = {orderId: string};
export type ChefMenuItemDetailRouteParams = {menuItemId: string};
export type ChefMenuItemEditRouteParams = {menuItemId: string};

/** P95 adds the focused edit route while preserving the existing P94 create route. */
export type ChefProductStackParamList = {
  ChefTabs: NavigatorScreenParams<ChefTabParamList> | undefined;
  ChefOrderDetail: ChefOrderDetailRouteParams;
  ChefMenuItemDetail: ChefMenuItemDetailRouteParams;
  ChefAddMenuItem: undefined;
  ChefEditMenuItem: ChefMenuItemEditRouteParams;
};

export type ChefTabRouteName = keyof ChefTabParamList;
export type ChefOrdersStackRouteName = keyof ChefOrdersStackParamList;
export type ChefProfileStackRouteName = keyof ChefProfileStackParamList;
export type ChefProductStackRouteName = keyof ChefProductStackParamList;

export type CustomerDomainParamList = CustomerAccountStackParamList & CustomerTabParamList;
export type ChefDomainParamList =
  ChefAccountStackParamList &
  ChefTabParamList &
  ChefOrdersStackParamList &
  ChefProfileStackParamList &
  ChefProductStackParamList;
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
  | ChefTabRouteName
  | ChefOrdersStackRouteName
  | ChefProfileStackRouteName
  | ChefProductStackRouteName;
