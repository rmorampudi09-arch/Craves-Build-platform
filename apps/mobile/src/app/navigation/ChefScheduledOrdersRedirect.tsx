import React from 'react';
import {useFocusEffect, useNavigation, type CompositeNavigationProp} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {ChefProfileStackParamList, ChefTabParamList} from './types';

type Navigation = CompositeNavigationProp<
  NativeStackNavigationProp<ChefProfileStackParamList, 'ChefScheduledOrders'>,
  BottomTabNavigationProp<ChefTabParamList>
>;

/** Scheduled orders now live in the Orders tab; this keeps the old Profile route working. */
export function ChefScheduledOrdersRedirect() {
  const navigation = useNavigation<Navigation>();
  useFocusEffect(
    React.useCallback(() => {
      // Leave this route first so Back from Orders, or the Profile tab, never lands here again.
      if (navigation.getState().routes.length > 1) navigation.goBack();
      else navigation.replace('ChefProfileHome');
      navigation.navigate('Orders', {screen: 'ChefOrdersScheduled'});
    }, [navigation]),
  );
  return null;
}
