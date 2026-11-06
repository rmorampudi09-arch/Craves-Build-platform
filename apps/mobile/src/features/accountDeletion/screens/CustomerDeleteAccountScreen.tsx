import React from 'react';
import {ChildScaffold} from '../../customerSettings/screens/CustomerSettingsLegacyScreens';
import {DeleteAccountScreen} from './DeleteAccountScreen';

/** Delete account, inside the customer settings page. */
export function CustomerDeleteAccountScreen() {
  return <DeleteAccountScreen mode="CUSTOMER" Scaffold={ChildScaffold} />;
}
