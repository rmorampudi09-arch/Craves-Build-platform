/**
 * @format
 */

jest.mock('react-native-razorpay', () => ({
  __esModule: true,
  default: {open: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
