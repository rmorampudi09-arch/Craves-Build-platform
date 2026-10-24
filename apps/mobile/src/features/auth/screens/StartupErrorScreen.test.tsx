import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {authActions} from '../state/authSlice';
import {StartupErrorScreen} from './StartupErrorScreen';

const mockDispatch = jest.fn();
const mockDiscard = jest.fn();

jest.mock('../../../app/store/hooks', () => ({useAppDispatch: () => mockDispatch}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 24, bottom: 24, left: 0, right: 0}),
}));
jest.mock('../state/authService', () => ({authService: {discardRestoredSession: () => mockDiscard()}}));

function press(tree: renderer.ReactTestRenderer, label: string) {
  const button = tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  return act(async () => {
    button.props.onPress();
  });
}

describe('StartupErrorScreen', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(async () => {
    jest.clearAllMocks();
    mockDiscard.mockResolvedValue(undefined);
    await act(async () => {
      tree = renderer.create(<StartupErrorScreen />);
    });
  });

  it('shows the sign-in drawing with plain words', () => {
    expect(tree.root.findAllByProps({testID: 'empty-illustration-session'})).not.toHaveLength(0);
    const text = tree.root.findAll(node => typeof node.props.children === 'string').map(node => node.props.children);
    expect(text).toContain("We couldn't sign you back in");
  });

  it('retries the restore', async () => {
    await press(tree, 'Try again');
    expect(mockDispatch).toHaveBeenCalledWith(authActions.bootstrapReset());
  });

  it('clears the saved session once and signs out, even on a double tap', async () => {
    await press(tree, 'Go to sign in');
    await press(tree, 'Signing you out…');
    expect(mockDiscard).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(authActions.signedOut());
    await press(tree, 'Try again');
    expect(mockDispatch).not.toHaveBeenCalledWith(authActions.bootstrapReset());
  });
});
