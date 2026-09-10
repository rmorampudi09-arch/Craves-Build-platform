module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^expo-location$':
      '<rootDir>/src/features/customerAddresses/location/currentLocation.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native.*|@react-native.*|@react-navigation.*|react-redux|@reduxjs/toolkit.*|redux|redux-thunk|reselect|immer|@tanstack.*|expo.*|@expo.*)/)',
  ],
};
