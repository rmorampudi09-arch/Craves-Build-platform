import React from 'react';
import {Linking} from 'react-native';
import {
  CommonActions,
  NavigationContainer,
  createNavigationContainerRef,
  type ParamListBase,
} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {RootStackParamList} from './types';
import {
  inboundRouteDedupe,
  parseInboundUrl,
  resolveInboundRoute,
  type InboundRouteCandidate,
  type InboundRouteContext,
  type InboundRouteDestination,
} from './inboundRouting';
import {
  captureProcessRestorationSnapshot,
  toRestorationNavigatePayload,
  type NavigationStateLike,
  type ProcessRestorationSnapshot,
  type ProductRole,
} from './processRestoration';
import {processRestorationStorage} from './processRestorationStorage';
import {CustomerRootNavigator} from './CustomerRootNavigator';
import {ChefRootNavigator} from './ChefRootNavigator';
import {useAppSelector} from '../store/hooks';
import {useBootstrap} from '../../features/auth/hooks/useBootstrap';
import {useSessionLifecycle} from '../../features/auth/hooks/useSessionLifecycle';
import {SplashScreen} from '../../features/auth/screens/SplashScreen';
import {RoleSelectionScreen} from '../../features/auth/screens/RoleSelectionScreen';
import {PhoneSignInScreen} from '../../features/auth/screens/PhoneSignInScreen';
import {EmailSignInScreen} from '../../features/auth/screens/EmailSignInScreen';
import {OtpVerificationScreen} from '../../features/auth/screens/OtpVerificationScreen';
import {ForgotPasswordScreen} from '../../features/auth/screens/ForgotPasswordScreen';
import {PasswordResetSentScreen} from '../../features/auth/screens/PasswordResetSentScreen';
import {CustomerRegistrationScreen} from '../../features/auth/screens/CustomerRegistrationScreen';
import {CustomerAccountStatusScreen} from '../../features/auth/screens/CustomerAccountStatusScreen';
import {ChefRegistrationScreen} from '../../features/auth/screens/ChefRegistrationScreen';
import {ChefAccountStatusScreen} from '../../features/auth/screens/ChefAccountStatusScreen';
import {StartupErrorScreen} from '../../features/auth/screens/StartupErrorScreen';
import {AccountRouterScreen} from '../../features/auth/screens/AccountRouterScreen';
import type {
  AccountResolution,
  ChefApplicationStatus,
} from '../../features/auth/domain/types';
import type {AuthState} from '../../features/auth/state/authSlice';

const AuthStack = createNativeStackNavigator<RootStackParamList>();
const ResolutionStack = createNativeStackNavigator<RootStackParamList>();
const CustomerStack = createNativeStackNavigator<RootStackParamList>();
const ChefStack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<ParamListBase>();

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

function AccountResolutionNavigator() {
  return (
    <ResolutionStack.Navigator screenOptions={screenOptions} initialRouteName="AccountRouter">
      <ResolutionStack.Screen name="AccountRouter" component={AccountRouterScreen} />
    </ResolutionStack.Navigator>
  );
}

function CustomerAccountNavigator({
  resolution,
}: {
  resolution: Extract<AccountResolution, {flow: 'CUSTOMER'}>;
}) {
  if (resolution.onboardingStatus === 'READY') {
    return <CustomerRootNavigator />;
  }

  return (
    <CustomerStack.Navigator
      screenOptions={screenOptions}
      initialRouteName="CustomerRegistration">
      <CustomerStack.Screen name="CustomerRegistration" component={CustomerRegistrationScreen} />
      <CustomerStack.Screen name="CustomerAccountStatus" component={CustomerAccountStatusScreen} />
    </CustomerStack.Navigator>
  );
}

function ChefAccountNavigator({
  resolution,
}: {
  resolution: Exclude<AccountResolution, {flow: 'CUSTOMER'}>;
}) {
  if (resolution.flow === 'CHEF') {
    return <ChefRootNavigator />;
  }

  const status: ChefApplicationStatus = resolution.onboardingStatus;
  const initialRouteName =
    status === 'NOT_SUBMITTED' ? 'ChefRegistration' : 'ChefAccountStatus';

  return (
    <ChefStack.Navigator screenOptions={screenOptions} initialRouteName={initialRouteName}>
      <ChefStack.Screen name="ChefRegistration" component={ChefRegistrationScreen} />
      <ChefStack.Screen
        name="ChefAccountStatus"
        component={ChefAccountStatusScreen}
        initialParams={{status}}
      />
    </ChefStack.Navigator>
  );
}

function AuthenticatedNavigator({resolution}: {resolution: AccountResolution | null}) {
  if (!resolution) {
    return <AccountResolutionNavigator />;
  }

  if (resolution.flow === 'CUSTOMER') {
    return <CustomerAccountNavigator resolution={resolution} />;
  }

  return <ChefAccountNavigator resolution={resolution} />;
}

function inboundContextFromAuth(auth: AuthState): InboundRouteContext {
  if (auth.bootstrapStatus !== 'authenticated') {
    return {
      authenticated: false,
      authorizedRole: null,
      productReady: false,
    };
  }

  const resolution = auth.accountResolution;
  if (!resolution) {
    return {
      authenticated: true,
      authorizedRole: null,
      productReady: false,
    };
  }

  if (resolution.flow === 'CUSTOMER') {
    return {
      authenticated: true,
      authorizedRole: 'CUSTOMER',
      productReady: resolution.onboardingStatus === 'READY',
    };
  }

  if (resolution.flow === 'CHEF') {
    return {
      authenticated: true,
      authorizedRole: 'CHEF',
      productReady: true,
    };
  }

  return {
    authenticated: true,
    authorizedRole: resolution.authorizedRole,
    productReady: false,
  };
}

function productRoleFromAuth(auth: AuthState): ProductRole | null {
  const context = inboundContextFromAuth(auth);
  return context.productReady ? context.authorizedRole : null;
}

function currentRouteMatches(destination: InboundRouteDestination): boolean {
  const currentRoute = navigationRef.getCurrentRoute();
  if (!currentRoute) {
    return false;
  }
  const params = currentRoute.params as Record<string, unknown> | undefined;

  switch (destination.kind) {
    case 'CUSTOMER_HOME':
      return currentRoute.name === 'CustomerHomeRoot';
    case 'CHEF_HOME':
      return currentRoute.name === 'Dashboard';
    case 'CUSTOMER_ORDER_DETAIL':
      return (
        currentRoute.name === 'CustomerOrderDetail' &&
        params?.orderId === destination.orderId
      );
    case 'CUSTOMER_ORDER_TRACKING':
      return (
        currentRoute.name === 'CustomerOrderTracking' &&
        params?.orderId === destination.orderId
      );
    case 'CHEF_ORDER_DETAIL':
      return currentRoute.name === 'ChefOrderDetail' && params?.orderId === destination.orderId;
    case 'CUSTOMER_KITCHEN_PROFILE':
      return (
        currentRoute.name === 'CustomerKitchenProfile' &&
        params?.kitchenId === destination.kitchenId
      );
  }
}

function dispatchInboundDestination(destination: InboundRouteDestination) {
  switch (destination.kind) {
    case 'CUSTOMER_HOME':
      navigationRef.dispatch(CommonActions.navigate({name: 'Home'}));
      return;
    case 'CHEF_HOME':
      navigationRef.dispatch(
        CommonActions.navigate({name: 'ChefTabs', params: {screen: 'Dashboard'}}),
      );
      return;
    case 'CUSTOMER_ORDER_DETAIL':
      navigationRef.dispatch(
        CommonActions.navigate({
          name: 'Orders',
          params: {
            screen: 'CustomerOrderDetail',
            params: {orderId: destination.orderId},
          },
        }),
      );
      return;
    case 'CUSTOMER_ORDER_TRACKING':
      navigationRef.dispatch(
        CommonActions.navigate({
          name: 'Orders',
          params: {
            screen: 'CustomerOrderTracking',
            params: {orderId: destination.orderId},
          },
        }),
      );
      return;
    case 'CHEF_ORDER_DETAIL':
      navigationRef.dispatch(
        CommonActions.navigate({
          name: 'ChefOrderDetail',
          params: {orderId: destination.orderId},
        }),
      );
      return;
    case 'CUSTOMER_KITCHEN_PROFILE':
      navigationRef.dispatch(
        CommonActions.navigate({
          name: 'Chefs',
          params: {
            screen: 'CustomerKitchenProfile',
            params: {kitchenId: destination.kitchenId},
          },
        }),
      );
  }
}

export function AppNavigator() {
  const status = useBootstrap();
  useSessionLifecycle();
  const auth = useAppSelector(state => state.auth);
  const authRef = React.useRef(auth);
  const pendingInboundRef = React.useRef<InboundRouteCandidate | null>(null);
  const pendingRestorationRef = React.useRef<ProcessRestorationSnapshot | null>(null);
  const restorationLoadedRef = React.useRef(false);
  const restorationSettledRef = React.useRef(false);
  const initialLinkCheckedRef = React.useRef(false);
  const initialInboundWinsRef = React.useRef(false);
  authRef.current = auth;

  const attemptInboundRoute = React.useCallback((candidate: InboundRouteCandidate) => {
    const resolution = resolveInboundRoute(candidate, inboundContextFromAuth(authRef.current));

    if (resolution.status === 'DEFER') {
      pendingInboundRef.current = candidate;
      return;
    }

    if (resolution.status === 'BLOCKED') {
      pendingInboundRef.current = null;
      return;
    }

    if (!navigationRef.isReady()) {
      pendingInboundRef.current = candidate;
      return;
    }

    const {destination} = resolution;
    pendingInboundRef.current = null;

    if (currentRouteMatches(destination) || !inboundRouteDedupe.claim(destination)) {
      return;
    }

    try {
      dispatchInboundDestination(destination);
    } catch {
      inboundRouteDedupe.release(destination);
      pendingInboundRef.current = candidate;
    }
  }, []);

  const flushPendingInboundRoute = React.useCallback(() => {
    const pending = pendingInboundRef.current;
    if (pending) {
      attemptInboundRoute(pending);
    }
  }, [attemptInboundRoute]);

  const flushPendingRestoration = React.useCallback(() => {
    if (
      restorationSettledRef.current ||
      !restorationLoadedRef.current ||
      !initialLinkCheckedRef.current ||
      !navigationRef.isReady()
    ) {
      return;
    }

    const role = productRoleFromAuth(authRef.current);
    if (!role) return;

    if (initialInboundWinsRef.current) {
      restorationSettledRef.current = true;
      return;
    }

    const snapshot = pendingRestorationRef.current;
    if (!snapshot) {
      restorationSettledRef.current = true;
      return;
    }

    if (snapshot.role !== role) {
      pendingRestorationRef.current = null;
      restorationSettledRef.current = true;
      processRestorationStorage.clear().catch(() => undefined);
      return;
    }

    const payload = toRestorationNavigatePayload(snapshot);
    pendingRestorationRef.current = null;
    restorationSettledRef.current = true;
    if (!payload) {
      processRestorationStorage.clear().catch(() => undefined);
      return;
    }

    navigationRef.dispatch(CommonActions.navigate(payload));
  }, []);

  const persistCurrentRestoration = React.useCallback(() => {
    if (!restorationSettledRef.current || !navigationRef.isReady()) return;
    const role = productRoleFromAuth(authRef.current);
    if (!role) return;

    const snapshot = captureProcessRestorationSnapshot(
      navigationRef.getRootState() as unknown as NavigationStateLike,
      role,
    );
    if (snapshot) {
      processRestorationStorage.write(snapshot).catch(() => undefined);
    }
  }, []);

  const handleNavigationReadyOrChange = React.useCallback(() => {
    flushPendingInboundRoute();
    flushPendingRestoration();
    persistCurrentRestoration();
  }, [flushPendingInboundRoute, flushPendingRestoration, persistCurrentRestoration]);

  React.useEffect(() => {
    let active = true;
    processRestorationStorage
      .read()
      .then(snapshot => {
        if (!active) return;
        pendingRestorationRef.current = snapshot;
        restorationLoadedRef.current = true;
        flushPendingRestoration();
      })
      .catch(() => {
        if (!active) return;
        pendingRestorationRef.current = null;
        restorationLoadedRef.current = true;
        flushPendingRestoration();
      });

    return () => {
      active = false;
    };
  }, [flushPendingRestoration]);

  React.useEffect(() => {
    flushPendingInboundRoute();

    if (auth.bootstrapStatus === 'anonymous') {
      pendingRestorationRef.current = null;
      restorationSettledRef.current = true;
      inboundRouteDedupe.reset();
      processRestorationStorage.clear().catch(() => undefined);
      return;
    }

    flushPendingRestoration();
  }, [
    auth.bootstrapStatus,
    auth.accountResolution,
    flushPendingInboundRoute,
    flushPendingRestoration,
  ]);

  React.useEffect(() => {
    let active = true;

    const handleUrl = (url: string, initial: boolean) => {
      const candidate = parseInboundUrl(url);
      if (!candidate) return;
      if (initial) {
        initialInboundWinsRef.current = true;
      }
      attemptInboundRoute(candidate);
    };

    Linking.getInitialURL()
      .then(url => {
        if (!active) return;
        if (url) {
          handleUrl(url, true);
        }
        initialLinkCheckedRef.current = true;
        flushPendingRestoration();
      })
      .catch(() => {
        if (!active) return;
        initialLinkCheckedRef.current = true;
        flushPendingRestoration();
      });

    const subscription = Linking.addEventListener('url', event => handleUrl(event.url, false));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attemptInboundRoute, flushPendingRestoration]);

  if (status === 'idle' || status === 'restoring') {
    return <SplashScreen />;
  }

  if (status === 'error') {
    return <StartupErrorScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={handleNavigationReadyOrChange}
      onStateChange={handleNavigationReadyOrChange}>
      {auth.bootstrapStatus === 'authenticated' ? (
        <AuthenticatedNavigator resolution={auth.accountResolution} />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
