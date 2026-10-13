import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../testing/screenTestKit';
import {ChefSecurityScreen} from './ChefSecurityScreen';

jest.setTimeout(20_000);

const mockNavigate = jest.fn();
let mockIdentity: Record<string, unknown> | null;

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: mockIdentity}}),
}));

let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

function mount() {
  act(() => {
    tree = renderer.create(
      <ChefToastProvider>
        <ChefSecurityScreen />
      </ChefToastProvider>,
    );
  });
}

describe('ChefSecurityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIdentity = {id: 'user-1', phoneNumber: '+919876543210', email: 'chef@gmail.com', emailVerified: true};
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows the mobile number and email from the account, with most digits hidden', () => {
    mount();
    expect(ui.has('Mobile number')).toBe(true);
    expect(ui.has('+91 ••••• 43210 · used to log in')).toBe(true);
    expect(ui.has('Email')).toBe(true);
    expect(ui.has('c•••@gmail.com')).toBe(true);
    expect(ui.lines().filter(line => line === 'Verified')).toHaveLength(2);
    expect(ui.anyText(/9876543210|chef@gmail/)).toBe(false);
  });

  it('says the email is not verified, or not added, instead of showing a Verified chip', () => {
    mockIdentity = {id: 'user-1', phoneNumber: '+919876543210', email: 'chef@gmail.com', emailVerified: false};
    mount();
    expect(ui.has('Not verified')).toBe(true);
    act(() => tree.unmount());
    mockIdentity = {id: 'user-1', phoneNumber: '+919876543210', email: null, emailVerified: false};
    mount();
    expect(ui.has('Not added')).toBe(true);
  });

  it('marks Log out of other devices as coming soon and not tappable', () => {
    mount();
    expect(ui.has('Log out of other devices')).toBe(true);
    expect(ui.byPrefix('Log out of other devices')).toBeUndefined();
    expect(ui.has('Coming soon')).toBe(true);
  });

  it('opens a support request for Delete my account', () => {
    mount();
    expect(ui.has('Asks Craves support to close your account')).toBe(true);
    act(() => {
      ui.byPrefix('Delete my account')!.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('ChefSupportTicket', {topic: 'Delete my account'});
  });

  it('explains how to change the number and that there is no password', () => {
    mount();
    expect(
      ui.has("To change your mobile number, contact support. You log in with a one-time code, so there's no password to manage."),
    ).toBe(true);
  });
});
