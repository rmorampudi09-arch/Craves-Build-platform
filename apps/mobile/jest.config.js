module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(ttf|otf)$':
      '<rootDir>/node_modules/@react-native/jest-preset/jest/assetFileTransformer.js',
  },
  moduleNameMapper: {
    '^lucide-react-native/icons/(.*)$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
    '^expo-location$':
      '<rootDir>/src/features/customerAddresses/location/currentLocation.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native.*|@react-native.*|@react-navigation.*|react-redux|@reduxjs/toolkit.*|redux|redux-thunk|reselect|immer|@tanstack.*|expo.*|@expo.*)/)',
  ],
};
