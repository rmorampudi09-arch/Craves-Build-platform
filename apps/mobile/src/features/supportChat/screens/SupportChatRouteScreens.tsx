import React from 'react';
import {useRoute, type RouteProp} from '@react-navigation/native';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {SupportChatScreen} from './SupportChatScreen';

export function CustomerSupportChatRouteScreen() {
  const route =
    useRoute<RouteProp<CustomerProfileStackParamList, 'CustomerSupportChat'>>();
  return (
    <SupportChatScreen contextRole="CUSTOMER" orderId={route.params?.orderId} />
  );
}

export function ChefSupportChatRouteScreen() {
  return <SupportChatScreen contextRole="CHEF" />;
}
