module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|@react-native-community|@react-navigation|react-redux|@reduxjs/toolkit|@tanstack|expo|@expo|expo-modules-core|@react-native-firebase)/)',
  ],
};
