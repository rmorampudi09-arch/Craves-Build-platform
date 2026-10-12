import React from 'react';
import {Modal, Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {ChefHeader} from './ChefHeader';

const mockNavigate = jest.fn();
let mockUnread = 0;

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate})}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({counters: {unreadNotifications: mockUnread}}),
}));

let tree: renderer.ReactTestRenderer;
const textOf = (node: ReactTestInstance) => React.Children.toArray(node.props.children).join('');
const pressables = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

describe('ChefHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnread = 0;
  });
  afterEach(() => act(() => tree.unmount()));

  it('is a plain title bar whose bell opens the notifications screen, with no menu or sheet', () => {
    mockUnread = 2;
    act(() => {
      tree = renderer.create(<ChefHeader title="Orders" />);
    });
    expect(tree.root.findAllByType(Text).map(textOf)).toEqual(expect.arrayContaining(['Orders', '2']));
    expect(pressables('Open Chef menu')).toHaveLength(0);
    act(() => pressables('Notifications, 2 unread')[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('ChefNotifications');
    expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  });
});
