import React, {useCallback, useEffect, useMemo} from 'react';
import {Alert} from 'react-native';
import {createNavigationContainerRef, DarkTheme, DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useQueryClient} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon} from '../../shared/components';
import {borderWidth, colors, font, iconSize, typography, useRiderTheme} from '../../features/rider/theme';
import {BottomAction} from '../../features/rider/components/BottomAction';
import {RiderRuntime} from '../../features/rider/components/RiderRuntime';
import {riderOnlineService, type NotificationTap} from '../../features/rider/native/riderOnlineService';
import {RiderSplash} from '../../features/rider/components/RiderSplash';
import {ProblemCard, StateCard} from '../../features/rider/components/StateCard';
import {RiderScreen, Title} from '../../features/rider/components/ui';
import {resolveGate} from '../../features/rider/domain/gate';
import type {ReceivedOffer} from '../../features/rider/domain/offerTiming';
import {RiderShellContext, takeAfterGate, type RiderStackParamList, type RiderTabParamList} from '../../features/rider/navigation';
import {isDemo, RIDER_APP_VERSION} from '../../features/rider/riderConfig';
import {useActiveTrip, useRiderHome, useRiderMe} from '../../features/rider/state/riderQueries';
import {riderSnapshot} from '../../features/rider/state/riderSnapshot';
import {tripQueue} from '../../features/rider/state/tripQueue';
import {useStrings} from '../../features/rider/strings/StringsProvider';
import {AccountStatusScreen} from '../../features/rider/screens/AccountStatusScreen';
import {DevPanelScreen} from '../../features/rider/screens/DevPanelScreen';
import {EarningsScreen} from '../../features/rider/screens/EarningsScreen';
import {GoOnlineScreen} from '../../features/rider/screens/GoOnlineScreen';
import {HelpScreen} from '../../features/rider/screens/HelpScreen';
import {HomeScreen} from '../../features/rider/screens/HomeScreen';
import {NoticeScreen} from '../../features/rider/screens/NoticeScreen';
import {RulesScreen} from '../../features/rider/screens/RulesScreen';
import {OfferScreen} from '../../features/rider/screens/OfferScreen';
import {PayoutsScreen} from '../../features/rider/screens/PayoutsScreen';
import {PhoneSetupScreen} from '../../features/rider/screens/PhoneSetupScreen';
import {PrivacyNoticeScreen} from '../../features/rider/screens/PrivacyNoticeScreen';
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
// The demo panel exists only in demo builds and on a developer's machine: a live APK has no route to it at all.
const DEMO_PANEL = isDemo || __DEV__;

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
        tabBarActiveTintColor: colors.redText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {fontSize: typography.small, fontFamily: font.bold},
        tabBarStyle: {
          height: 64 + bottom,
          backgroundColor: colors.surface,
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

/** GET /me decides where a signed-in rider lands: the privacy notice, account status, new terms, or work. */
function SignedIn() {
  const {strings, adoptServerLanguage} = useStrings();
  const session = useRiderSession();
  const me = useRiderMe();
  const home = useRiderHome();
  const trip = useActiveTrip();
  const queryClient = useQueryClient();
  const language = me.data?.language;

  useEffect(() => {
    if (language) {
      adoptServerLanguage(language);
    }
  }, [language, adoptServerLanguage]);

  // What a start without signal opens from (useRiderSession, WORKPLAN P2-12).
  useEffect(() => riderSnapshot.watch(queryClient), [queryClient]);

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
        // A next step still waiting belongs to this rider, not to whoever signs in next on this phone.
        takeAfterGate();
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
  // The trip notification's actions (R-04): SOS opens the SOS screen; a step action opens the trip, which posts the step.
  const openTap = useCallback((tap: NotificationTap) => {
    if (!navigationRef.isReady()) {
      return;
    }
    if (tap.sos) {
      navigationRef.navigate('Sos', {});
    } else if (tap.step) {
      riderOnlineService.keepStepTap(tap.step);
      navigationRef.navigate('Trip');
    }
  }, []);

  if (!me.data) {
    return me.isError ? (
      // No sign-out here: without the rider the app can't check for trip steps still waiting to sync (shell.signOut).
      <RiderScreen testID="rider-me-error">
        <Title>{strings.signIn.brand}</Title>
        <ProblemCard error={me.error} onRetry={() => me.refetch()} testID="rider-me-problem" />
      </RiderScreen>
    ) : (
      <RiderSplash />
    );
  }

  const busy = Boolean(home.data?.online || (trip.data && !ENDED.includes(trip.data.step)));
  const gate = resolveGate(me.data, RIDER_APP_VERSION, busy);

  return (
    <RiderShellContext.Provider value={shell}>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {/* navigationKey: when the gate opens (terms accepted, account approved), the gate screen leaves the stack
            instead of staying on top, because the working stack has screens with the same names. */}
        {gate.kind === 'account' ? (
          <Stack.Screen name="AccountStatus" component={AccountStatusScreen} navigationKey={gate.kind} />
        ) : gate.kind === 'terms' ? (
          <Stack.Screen name="Terms" component={TermsScreen} initialParams={{mode: 'accept'}} navigationKey={gate.kind} />
        ) : gate.kind === 'privacy' ? (
          <Stack.Screen name="Privacy" component={PrivacyNoticeScreen} navigationKey={gate.kind} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={RiderTabs} />
            <Stack.Screen name="Trip" component={TripScreen} options={{gestureEnabled: false}} />
            <Stack.Screen name="Offer" component={OfferScreen} options={{presentation: 'fullScreenModal', gestureEnabled: false}} />
            <Stack.Screen name="TripDetail" component={TripDetailScreen} />
            <Stack.Screen name="Payouts" component={PayoutsScreen} />
            <Stack.Screen name="PhoneSetup" component={PhoneSetupScreen} />
            <Stack.Screen name="GoOnline" component={GoOnlineScreen} options={{presentation: 'fullScreenModal'}} />
            <Stack.Screen name="Help" component={HelpScreen} />
            <Stack.Screen name="Notice" component={NoticeScreen} />
            <Stack.Screen name="AccountStatus" component={AccountStatusScreen} navigationKey={gate.kind} />
            <Stack.Screen name="Terms" component={TermsScreen} initialParams={{mode: 'view'}} navigationKey={gate.kind} />
            <Stack.Screen name="Sos" component={SosScreen} options={{presentation: 'modal'}} />
            {DEMO_PANEL ? <Stack.Screen name="DevPanel" component={DevPanelScreen} options={{presentation: 'modal'}} /> : null}
          </>
        )}
        {gate.kind !== 'ready' ? (
          // The account, terms and privacy screens show SOS and the demo chip too, and can read the rate card and the rules.
          <>
            <Stack.Screen name="Sos" component={SosScreen} options={{presentation: 'modal'}} />
            {gate.kind === 'terms' ? null : <Stack.Screen name="Terms" component={TermsScreen} initialParams={{mode: 'view'}} navigationKey={gate.kind} />}
            <Stack.Screen name="Rules" component={RulesScreen} navigationKey={gate.kind} />
            {DEMO_PANEL ? <Stack.Screen name="DevPanel" component={DevPanelScreen} options={{presentation: 'modal'}} /> : null}
          </>
        ) : null}
      </Stack.Navigator>
      {gate.kind === 'ready' ? (
        <RiderRuntime riderId={riderId} nativeOutbox={me.data.features?.nativeTripOutbox === true} openOffer={openOffer} openTap={openTap} />
      ) : null}
    </RiderShellContext.Provider>
  );
}

export function RiderNavigator() {
  const session = useRiderSession();
  const {strings} = useStrings();
  const theme = useRiderTheme();
  // Screens sit on the rider ground colour, Day or Night, never React Navigation's grey.
  const navTheme = useMemo(() => {
    const base = theme === 'night' ? DarkTheme : DefaultTheme;
    return {...base, colors: {...base.colors, background: colors.ground, card: colors.surface, text: colors.textPrimary, border: colors.border, primary: colors.flameRed}};
  }, [theme]);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {session.status === 'restoring' ? (
        <RiderSplash />
      ) : session.status === 'authenticated' ? (
        <SignedIn />
      ) : session.status === 'error' ? (
        // A rider with no signal at start keeps the session (and any unsynced trip steps); signing out is the second choice.
        <RiderScreen
          testID="rider-session-error"
          footer={
            <BottomAction label={strings.account.signOut} variant="neutral" onPress={() => session.signOut()} testID="rider-session-sign-out" />
          }>
          <Title>{strings.signIn.brand}</Title>
          <StateCard
            icon="wifi-off"
            title={strings.states.sessionTitle}
            body={strings.states.sessionBody}
            action={{label: strings.common.retry, onPress: session.retry, testID: 'rider-retry'}}
            testID="rider-session-problem"
          />
        </RiderScreen>
      ) : (
        <Stack.Navigator screenOptions={{headerShown: false}}>
          <Stack.Screen name="Phone" component={RiderPhoneScreen} />
          <Stack.Screen name="Otp" component={RiderOtpScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
