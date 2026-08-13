const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Keep the customer-address location bridge local to CRAVES so the native GPS
 * implementation does not introduce a package-lock dependency.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    extraNodeModules: {
      'expo-location': path.resolve(
        __dirname,
        'src/features/customerAddresses/location/currentLocation.ts',
      ),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
