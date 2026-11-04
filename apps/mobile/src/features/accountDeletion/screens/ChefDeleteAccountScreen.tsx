import React from 'react';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {ChefScreen, ChefTopBar} from '../../chefShell/components/ui';
import {DeleteAccountScreen, type DeleteAccountScaffoldProps} from './DeleteAccountScreen';

function ChefScaffold({title, children, footer}: DeleteAccountScaffoldProps) {
  const navigation = useNavigation<NavigationProp<ChefProfileStackParamList>>();
  return (
    <ChefScreen footer={footer} header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title={title} />}>
      {children}
    </ChefScreen>
  );
}

/** Delete my account, inside the chef app's page. */
export function ChefDeleteAccountScreen() {
  return <DeleteAccountScreen mode="CHEF" Scaffold={ChefScaffold} />;
}
