import {createContext, useContext} from 'react';
import type {NavigatorScreenParams} from '@react-navigation/native';
import type {NativeStackNavigationProp, NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ReceivedOffer} from './domain/offerTiming';

export type RiderStackParamList = {
  Phone: undefined;
  Otp: {phone: string};
  AccountStatus: undefined;
  Terms: {mode: 'accept' | 'view'};
  Privacy: undefined;
  Tabs: NavigatorScreenParams<RiderTabParamList> | undefined;
  PhoneSetup: undefined;
  GoOnline: undefined;
  Offer: ReceivedOffer;
  Trip: undefined;
  TripDetail: {tripId: string};
  Payouts: undefined;
  Help: undefined;
  Notice: undefined;
  Sos: {tripId?: string};
  DevPanel: undefined;
};

export type RiderTabParamList = {
  Home: undefined;
  Earnings: undefined;
  Profile: undefined;
};

export type RiderNav = NativeStackNavigationProp<RiderStackParamList>;
export type RiderScreenProps<T extends keyof RiderStackParamList> = NativeStackScreenProps<
  RiderStackParamList,
  T
>;

// P6-04: accepting the first pay terms opens the next step by itself (phone setup) instead of leaving the rider on Home.
let afterGate: 'PhoneSetup' | null = null;
/** Set by the terms screen once the first terms are accepted; Home opens it when the working screens appear. */
export const openAfterGate = (screen: 'PhoneSetup') => {
  afterGate = screen;
};
/** The step to open now, once (null when none). */
export const takeAfterGate = () => {
  const screen = afterGate;
  afterGate = null;
  return screen;
};

/** What the app shell (src/app/rider) gives rider screens, so they never import features/auth. */
export interface RiderShell {
  riderId: string;
  signOut(): Promise<void>;
}

export const RiderShellContext = createContext<RiderShell>({
  riderId: '',
  signOut: async () => undefined,
});

export const useRiderShell = () => useContext(RiderShellContext);
