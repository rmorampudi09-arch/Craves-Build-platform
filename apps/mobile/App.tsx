import React from 'react';
import {StatusBar} from 'react-native';
import {AppProviders} from './src/app/providers/AppProviders';
import {AppNavigator} from './src/app/navigation/AppNavigator';
import {colors} from './src/design/tokens';
// restoredFromRecents comes from MainActivity: Android rebuilt the app from Recents.
export default function App({restoredFromRecents}:{restoredFromRecents?:boolean}){return <AppProviders><StatusBar barStyle="dark-content" backgroundColor={colors.cream}/><AppNavigator restoreLastScreen={restoredFromRecents===true}/></AppProviders>}
