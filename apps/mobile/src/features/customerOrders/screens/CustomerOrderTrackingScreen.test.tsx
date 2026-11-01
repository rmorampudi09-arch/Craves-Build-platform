import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {CustomerOrderTracking} from '../domain/customerOrderTrackingTypes';
import {CustomerOrderTrackingScreen} from './CustomerOrderTrackingScreen';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
let mockTracking: CustomerOrderTracking;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
  useRoute: () => ({params: {orderId: '11111111-1111-4111-8111-111111111111'}}),
}));
jest.mock('../../../shared/components/ScreenShell', () => ({
  ScreenShell: ({children}: React.PropsWithChildren) => children,
}));
jest.mock('../query/customerOrdersQueries', () => ({
  useCustomerOrderTrackingQuery: () => ({
    data: mockTracking,
    error: null,
    isPending: false,
    isFetching: false,
    isRefetching: false,
    invalidOrderId: false,
    sessionRequired: false,
    refetch: jest.fn(() => Promise.resolve()),
  }),
}));

function tracking(deliveryCode: string | null): CustomerOrderTracking {
  return {
    orderId: ORDER_ID,
    deliveryJobId: '22222222-2222-4222-8222-222222222222',
    providerId: 'craves_fleet',
    status: 'IN_TRANSIT',
    trackingUrl: null,
    observedAt: '2026-10-20T12:10:00Z',
    history: [],
    deliveryCode,
  };
}

function mount(deliveryCode: string | null) {
  mockTracking = tracking(deliveryCode);
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<CustomerOrderTrackingScreen />);
  });
  return tree;
}

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).flatMap(node => [node.props.children].flat());

const card = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(node => node.props.testID === 'customer-order-delivery-code' && typeof node.type === 'string');

test('shows the delivery code while a Craves rider carries the order', () => {
  const tree = mount('4719');
  expect(card(tree)).toHaveLength(1);
  expect(texts(tree)).toContain('Delivery code');
  expect(texts(tree)).toContain('Tell this code to your Craves rider at the door. Craves never asks for it on a call.');
  expect(tree.root.findByProps({accessibilityLabel: '4 7 1 9'}).props.children).toBe('4719');
  act(() => tree.unmount());
});

test('shows no delivery code card without a code', () => {
  const tree = mount(null);
  expect(card(tree)).toHaveLength(0);
  expect(texts(tree)).not.toContain('Delivery code');
  act(() => tree.unmount());
});
