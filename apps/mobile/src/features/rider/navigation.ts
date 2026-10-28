import {createContext, useContext} from 'react';
import type {NavigatorScreenParams} from '@react-navigation/native';
import type {NativeStackNavigationProp, NativeStackScreenProps} from '@react-navigation/native-stack';
import type {Offer} from './api/contract';

export type RiderStackParamList = {
  Phone: undefined;
  Otp: {phone: string};
  AccountStatus: undefined;
  Terms: {mode: 'accept' | 'view'};
  Privacy: undefined;
  Tabs: NavigatorScreenParams<RiderTabParamList> | undefined;
  PhoneSetup: undefined;
  GoOnline: undefined;
  Offer: {offer: Offer; receivedAtMs: number};
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
