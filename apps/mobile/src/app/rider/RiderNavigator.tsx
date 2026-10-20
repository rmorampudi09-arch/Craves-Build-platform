import React, {useCallback, useEffect, useMemo} from 'react';
import {Alert} from 'react-native';
import {createNavigationContainerRef, NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon, TerminalState} from '../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, typography} from '../../design/tokens';
import {SplashScreen} from '../../features/auth/screens/SplashScreen';
import {RiderRuntime} from '../../features/rider/components/RiderRuntime';
import {resolveGate} from '../../features/rider/domain/gate';
import type {ReceivedOffer} from '../../features/rider/domain/offerTiming';
import {RiderShellContext, type RiderStackParamList, type RiderTabParamList} from '../../features/rider/navigation';
import {RIDER_APP_VERSION} from '../../features/rider/riderConfig';
import {useActiveTrip, useRiderHome, useRiderMe} from '../../features/rider/state/riderQueries';
import {tripQueue} from '../../features/rider/state/tripQueue';
import {useStrings} from '../../features/rider/strings/StringsProvider';
import {AccountStatusScreen} from '../../features/rider/screens/AccountStatusScreen';
import {DevPanelScreen} from '../../features/rider/screens/DevPanelScreen';
import {EarningsScreen} from '../../features/rider/screens/EarningsScreen';
import {HelpScreen} from '../../features/rider/screens/HelpScreen';
import {HomeScreen} from '../../features/rider/screens/HomeScreen';
import {OfferScreen} from '../../features/rider/screens/OfferScreen';
import {PayoutsScreen} from '../../features/rider/screens/PayoutsScreen';
import {PhoneSetupScreen} from '../../features/rider/screens/PhoneSetupScreen';
import {ProfileScreen} from '../../features/rider/screens/ProfileScreen';
import {SosScreen} from '../../features/rider/screens/SosScreen';
import {TermsScreen} from '../../features/rider/screens/TermsScreen';
import {TripDetailScreen} from '../../features/rider/screens/TripDetailScreen';
import {TripScreen} from '../../features/rider/screens/TripScreen';
import {RiderOtpScreen} from './signIn/RiderOtpScreen';
import {RiderPhoneScreen} from './signIn/RiderPhoneScreen';
import {useRiderSession} from './useRiderSession';

const Stack = createNativeStackNavigator<RiderStackParamList>();
const Tabs = createBottomTabNavigator<RiderTabParamList>();
const navigationRef = createNavigationContainerRef<RiderStackParamList>();
const ENDED = ['DELIVERED', 'FAILED', 'CANCELLED'];

type TabIconProps = {color: string};
const homeIcon = ({color}: TabIconProps) => <Icon name="home-outline" color={color} size={iconSize.lg} surface={false} />;
const walletIcon = ({color}: TabIconProps) => <Icon name="wallet" color={color} size={iconSize.lg} surface={false} />;
const accountIcon = ({color}: TabIconProps) => <Icon name="account-outline" color={color} size={iconSize.lg} surface={false} />;

/** 64 dp above the system bar, a 1 dp top line, no shadow; the active tab is red (docs/riders/SCREENS.md 0.6). */
function RiderTabs() {
  const {strings} = useStrings();
  const {bottom} = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.flameRedAccessible,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {fontSize: typography.small, fontWeight: fontWeight.bold},
        tabBarStyle: {
          height: 64 + bottom,
          backgroundColor: colors.white,
          borderTopWidth: borderWidth.standard,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}>
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{title: strings.tabs.home, tabBarIcon: homeIcon}}
      />
      <Tabs.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{title: strings.tabs.earnings, tabBarIcon: walletIcon}}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{title: strings.tabs.profile, tabBarIcon: accountIcon}}
      />
    </Tabs.Navigator>
  );
}

/** GET /me decides where a signed-in rider lands: account status, new terms, or work. */
function SignedIn() {
  const {strings, adoptServerLanguage} = useStrings();
  const session = useRiderSession();
  const me = useRiderMe();
  const home = useRiderHome();
  const trip = useActiveTrip();
  const language = me.data?.language;

  useEffect(() => {
    if (language) {
      adoptServerLanguage(language);
    }
  }, [language, adoptServerLanguage]);

  const riderId = me.data?.riderId ?? '';
  const blockedMessage = strings.profile.signOutBlocked;
  const shell = useMemo(
    () => ({
      riderId,
      // Never sign out over unsynced trip steps: they would be lost or replayed for the wrong rider.
      async signOut() {
        if (riderId && (await tripQueue.pending(riderId)) > 0) {
          Alert.alert(blockedMessage);
          return;
        }
        await session.signOut();
      },
    }),
    [riderId, session, blockedMessage],
  );
  const openOffer = useCallback((offer: ReceivedOffer) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Offer', offer);
    }
  }, []);

  if (!me.data) {
    return me.isError ? (
      <TerminalState title={strings.common.error} actionLabel={strings.common.retry} onAction={() => me.refetch()} />
    ) : (
      <SplashScreen />
    );
  }

  const busy = Boolean(home.data?.online || (trip.data && !ENDED.includes(trip.data.step)));
  const gate = resolveGate(me.data, RIDER_APP_VERSION, busy);

  return (
    <RiderShellContext.Provider value={shell}>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {gate.kind === 'account' ? (
          <Stack.Screen name="AccountStatus" component={AccountStatusScreen} />
        ) : gate.kind === 'terms' ? (
          <Stack.Screen name="Terms" component={TermsScreen} initialParams={{mode: 'accept'}} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={RiderTabs} />
            <Stack.Screen name="Trip" component={TripScreen} options={{gestureEnabled: false}} />
            <Stack.Screen name="Offer" component={OfferScreen} options={{presentation: 'fullScreenModal', gestureEnabled: false}} />
            <Stack.Screen name="TripDetail" component={TripDetailScreen} />
            <Stack.Screen name="Payouts" component={PayoutsScreen} />
            <Stack.Screen name="PhoneSetup" component={PhoneSetupScreen} />
            <Stack.Screen name="Help" component={HelpScreen} />
            <Stack.Screen name="AccountStatus" component={AccountStatusScreen} />
            <Stack.Screen name="Terms" component={TermsScreen} initialParams={{mode: 'view'}} />
            <Stack.Screen name="Sos" component={SosScreen} options={{presentation: 'modal'}} />
            <Stack.Screen name="DevPanel" component={DevPanelScreen} options={{presentation: 'modal'}} />
          </>
        )}
        {gate.kind !== 'ready' ? (
          // The account and terms screens show SOS and the demo chip too.
          <>
            <Stack.Screen name="Sos" component={SosScreen} options={{presentation: 'modal'}} />
            <Stack.Screen name="DevPanel" component={DevPanelScreen} options={{presentation: 'modal'}} />
          </>
        ) : null}
      </Stack.Navigator>
      {gate.kind === 'ready' ? <RiderRuntime riderId={riderId} openOffer={openOffer} /> : null}
    </RiderShellContext.Provider>
  );
}

export function RiderNavigator() {
  const session = useRiderSession();
  const {strings} = useStrings();

  return (
    <NavigationContainer ref={navigationRef}>
      {session.status === 'restoring' ? (
        <SplashScreen />
      ) : session.status === 'authenticated' ? (
        <SignedIn />
      ) : session.status === 'error' ? (
        <TerminalState title={strings.common.error} actionLabel={strings.account.signOut} onAction={() => session.signOut()} />
      ) : (
        <Stack.Navigator screenOptions={{headerShown: false}}>
          <Stack.Screen name="Phone" component={RiderPhoneScreen} />
          <Stack.Screen name="Otp" component={RiderOtpScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
