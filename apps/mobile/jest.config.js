module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native.*|@react-native.*|@react-navigation.*|react-redux|@reduxjs/toolkit.*|@tanstack.*|expo.*|@expo.*)/)',
  ],
};
