import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {Provider} from 'react-redux';
import {QueryClientProvider} from '@tanstack/react-query';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {colors, loadRiderTheme, themedStyles, useRiderTheme} from '../../features/rider/theme';
import {RiderStringsProvider} from '../../features/rider/strings/StringsProvider';
import {appQueryClient} from '../query';
import {store} from '../store/store';
import {RiderNavigator} from './RiderNavigator';
import {RiderSessionContext, useRiderSessionState} from './useRiderSession';

function RiderStatusBar() {
  const night = useRiderTheme() === 'night';
  return <StatusBar barStyle={night ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />;
}

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
  useEffect(() => {
    loadRiderTheme();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Provider store={store}>
          <QueryClientProvider client={appQueryClient}>
            <RiderStringsProvider>
              <RiderStatusBar />
              <SessionRoot />
            </RiderStringsProvider>
          </QueryClientProvider>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = themedStyles(c => ({root: {flex: 1, backgroundColor: c.ground}}));
