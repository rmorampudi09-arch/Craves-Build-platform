import React from 'react';
import {Linking, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {authService} from '../../auth/state/authService';
import {AccountUnavailableScreen} from './AccountUnavailableScreen';

const mockDispatch = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({goBack: mockGoBack})}));
jest.mock('../../../app/store/hooks', () => ({useAppDispatch: () => mockDispatch}));
jest.mock('../../auth/state/authService', () => ({authService: {logout: jest.fn()}}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));

let tree: renderer.ReactTestRenderer;
const lines = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const button = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const mount = (signedIn: boolean) =>
  act(() => {
    tree = renderer.create(<AccountUnavailableScreen signedIn={signedIn} />);
  });

describe('AccountUnavailableScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authService.logout).mockResolvedValue();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => act(() => tree.unmount()));

  it('explains the account is not available and calls Craves support', () => {
    mount(false);
    expect(lines()).toEqual([
      "This account isn't available",
      "If you asked Craves to delete it, the deletion is finishing. You can sign up again with this phone number in a day or two. If you didn't, contact Craves support.",
      'Contact support',
      'Back',
    ]);
    act(() => {
      button('Contact support').props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+918367366787');
  });

  it('goes back on the sign-in screens, where nobody is signed in', () => {
    mount(false);
    act(() => {
      button('Back').props.onPress();
    });
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('signs out once when signed in, then clears the session', async () => {
    mount(true);
    expect(lines()).toContain('Sign out');
    expect(lines()).not.toContain('Back');
    await act(async () => {
      button('Sign out').props.onPress();
      button('Sign out').props.onPress();
    });
    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({type: 'auth/signedOut', payload: undefined});
    expect(jest.mocked(authService.logout).mock.invocationCallOrder[0]).toBeLessThan(
      mockDispatch.mock.invocationCallOrder[0],
    );
  });
});
