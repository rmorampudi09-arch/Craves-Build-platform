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

export type CustomerDishDetailRouteParams = {
  menuItemId: string;
};

export type CustomerDishIngredientsRouteParams = {
  menuItemId: string;
};

export type CustomerKitchenProfileRouteParams = {
  kitchenId: string;
};

export type CustomerKitchenDishesRouteParams = {
  kitchenId: string;
};

/** Shared typed subroutes owned by customer discovery/detail experiences. */
export type CustomerDishDetailStackParamList = {
  CustomerDishDetail: CustomerDishDetailRouteParams;
  CustomerDishIngredients: CustomerDishIngredientsRouteParams;
  CustomerKitchenProfile: CustomerKitchenProfileRouteParams;
  CustomerKitchenDishes: CustomerKitchenDishesRouteParams;
};

/**
 * P46 registers the cart as the first real customer transactional route. It is
 * shared by each customer tab stack so opening and closing Cart preserves the
 * originating tab stack and its scroll/filter state.
 */
export type CustomerCartStackParamList = {
  CustomerCart: undefined;
};

/**
 * P25 customer shell types. Each bottom tab owns a stack navigator so product
 * child routes can open without resetting sibling tab state.
 */
export type CustomerHomeStackParamList = {
  CustomerHomeRoot: undefined;
  CustomerFilterSort: CustomerFilterSortRouteParams;
} & CustomerDishDetailStackParamList &
  CustomerCartStackParamList;

export type CustomerChefsStackParamList = {
  CustomerChefsRoot: undefined;
  CustomerFilterSort: CustomerFilterSortRouteParams;
} & CustomerDishDetailStackParamList &
  CustomerCartStackParamList;

export type CustomerOrdersStackParamList = {
  CustomerOrdersRoot: undefined;
} & CustomerCartStackParamList;

export type CustomerProfileStackParamList = {
  CustomerProfileRoot: undefined;
} & CustomerCartStackParamList;

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
 * P46 promotes CustomerCart into the logical Transactional domain while keeping
 * the physical route inside the active customer tab stack so the reference
 * bottom navigation remains visible and back restores the exact origin.
 */
export type TransactionalStackParamList = CustomerCartStackParamList;

export type NavigationDomainParamLists = {
  Auth: AuthStackParamList;
  Customer: CustomerDomainParamList;
  Chef: ChefAccountStackParamList;
  Transactional: TransactionalStackParamList;
  Modal: never;
};

export type NavigationDomain = keyof NavigationDomainParamLists;
export type RegisteredRouteName =
  | keyof RootStackParamList
  | CustomerTabRouteName
  | CustomerStackRouteName;
