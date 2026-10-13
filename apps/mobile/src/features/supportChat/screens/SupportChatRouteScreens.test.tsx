import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {SupportChatScreen} from './SupportChatScreen';
import {ChefSupportChatRouteScreen, CustomerSupportChatRouteScreen} from './SupportChatRouteScreens';

let mockParams: {orderId?: string} | undefined;
jest.mock('@react-navigation/native', () => ({useRoute: () => ({params: mockParams})}));
jest.mock('./SupportChatScreen', () => ({SupportChatScreen: jest.fn(() => null)}));

const orderId = '11111111-1111-4111-8111-111111111111';
const render = (screen: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(screen);
  });
  act(() => tree.unmount());
};

describe('support chat route screens', () => {
  beforeEach(() => jest.mocked(SupportChatScreen).mockClear());

  it('opens the customer chat with the order it was opened from, or none', () => {
    mockParams = {orderId};
    render(<CustomerSupportChatRouteScreen />);
    mockParams = undefined;
    render(<CustomerSupportChatRouteScreen />);

    expect(jest.mocked(SupportChatScreen).mock.calls.map(([props]) => props)).toEqual([
      {contextRole: 'CUSTOMER', orderId},
      {contextRole: 'CUSTOMER', orderId: undefined},
    ]);
  });

  it('opens the chef chat with the order it was opened from, or none', () => {
    mockParams = {orderId};
    render(<ChefSupportChatRouteScreen />);
    mockParams = undefined;
    render(<ChefSupportChatRouteScreen />);

    expect(jest.mocked(SupportChatScreen).mock.calls.map(([props]) => props)).toEqual([
      {contextRole: 'CHEF', orderId},
      {contextRole: 'CHEF', orderId: undefined},
    ]);
  });
});
