import React from 'react';
import {StatusBar, StyleSheet} from 'react-native';
import {Provider} from 'react-redux';
import {QueryClientProvider} from '@tanstack/react-query';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {colors} from '../../design/tokens';
import {RiderStringsProvider} from '../../features/rider/strings/StringsProvider';
import {appQueryClient} from '../query';
import {store} from '../store/store';
import {RiderNavigator} from './RiderNavigator';
import {RiderSessionContext, useRiderSessionState} from './useRiderSession';

function SessionRoot() {
  const session = useRiderSessionState();
  return (
    <RiderSessionContext.Provider value={session}>
      <RiderNavigator />
    </RiderSessionContext.Provider>
  );
}

/** The rider app's root. Same providers as AppProviders, without the customer favourites sync. */
export function RiderApp() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Provider store={store}>
          <QueryClientProvider client={appQueryClient}>
            <RiderStringsProvider>
              <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
              <SessionRoot />
            </RiderStringsProvider>
          </QueryClientProvider>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({root: {flex: 1}});
