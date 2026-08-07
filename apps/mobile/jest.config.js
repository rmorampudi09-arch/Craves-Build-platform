module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native.*|@react-native.*|@react-navigation.*|react-redux|@reduxjs/toolkit.*|@tanstack.*|expo.*|@expo.*)/)',
  ],
};
