import React from 'react';
import {useRoute, type RouteProp} from '@react-navigation/native';
import type {ChefProductStackParamList, CustomerProfileStackParamList} from '../../../app/navigation/types';
import {SupportChatScreen} from './SupportChatScreen';

export function CustomerSupportChatRouteScreen() {
  const route = useRoute<RouteProp<CustomerProfileStackParamList, 'CustomerSupportChat'>>();
  return <SupportChatScreen contextRole="CUSTOMER" orderId={route.params?.orderId} />;
}

export function ChefSupportChatRouteScreen() {
  const route = useRoute<RouteProp<ChefProductStackParamList, 'ChefSupportChat'>>();
  return <SupportChatScreen contextRole="CHEF" orderId={route.params?.orderId} />;
}
