import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {AppNavigator} from './AppNavigator';

let mockAuth: Record<string, unknown>;

// Every screen and hook is replaced: only where the delete-request strip is mounted matters here.
function mockStub() {
  return new Proxy({__esModule: true} as Record<string, unknown>, {get: (target, key) => (key in target ? target[key as string] : () => null)});
}
jest.mock('../store/hooks', () => ({useAppSelector: (select: (state: unknown) => unknown) => select({auth: mockAuth})}));
jest.mock('../../features/auth/hooks/useBootstrap', () => ({useBootstrap: () => 'authenticated'}));
jest.mock('../../features/auth/hooks/useSessionLifecycle', () => ({useSessionLifecycle: () => undefined}));
jest.mock('../../features/accountDeletion/state/useIdentitySync', () => ({useIdentitySync: () => undefined}));
jest.mock('../../features/accountDeletion/state/AccountDeletionProvider', () => {
  const {Text: T} = require('react-native');
  const R = require('react');
  return {AccountDeletionProvider: ({children}: {children: React.ReactNode}) => R.createElement(R.Fragment, null, R.createElement(T, null, 'STRIP PROVIDER'), children)};
});
jest.mock('./CustomerRootNavigator', () => ({CustomerRootNavigator: () => require('react').createElement(require('react-native').Text, null, 'CUSTOMER HOME')}));
jest.mock('./ChefRootNavigator', () => ({ChefRootNavigator: () => require('react').createElement(require('react-native').Text, null, 'CHEF HOME')}));
jest.mock('../../features/auth/screens/AccountRouterScreen', () => ({AccountRouterScreen: () => require('react').createElement(require('react-native').Text, null, 'RESOLVING')}));
jest.mock('../../features/auth/screens/SplashScreen', () => mockStub());
jest.mock('../../features/auth/components/CravesWordmark', () => ({SplashDoneContext: require('react').createContext(false)}));
jest.mock('../../features/auth/screens/RoleSelectionScreen', () => mockStub());
jest.mock('../../features/auth/screens/PhoneSignInScreen', () => mockStub());
jest.mock('../../features/auth/screens/EmailSignInScreen', () => mockStub());
jest.mock('../../features/auth/screens/OtpVerificationScreen', () => mockStub());
jest.mock('../../features/auth/screens/ForgotPasswordScreen', () => mockStub());
jest.mock('../../features/auth/screens/PasswordResetSentScreen', () => mockStub());
jest.mock('../../features/auth/screens/CustomerRegistrationScreen', () => mockStub());
jest.mock('../../features/auth/screens/CustomerAccountStatusScreen', () => mockStub());
jest.mock('../../features/auth/screens/ChefRegistrationScreen', () => mockStub());
jest.mock('../../features/auth/screens/ChefAccountStatusScreen', () => mockStub());
jest.mock('../../features/chefOnboarding/screens/ChefOnboardingScreen', () => mockStub());
jest.mock('../../features/auth/screens/StartupErrorScreen', () => mockStub());
jest.mock('../../features/auth/components/AuthVideoBackground', () => mockStub());
jest.mock('../../features/auth/components/loginVisuals', () => ({loginFontAssets: {}}));
jest.mock('../../design/iosType', () => ({useIosFonts: () => true}));
jest.mock('expo-font', () => ({useFonts: () => [true, null]}));
jest.mock('../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('./processRestorationStorage', () => ({processRestorationStorage: {read: () => Promise.resolve(null), write: () => Promise.resolve(), clear: () => Promise.resolve()}}));

let tree: renderer.ReactTestRenderer;
const shown = () => tree.root.findAllByType(Text).map(t => t.props.children);

async function mount(auth: Record<string, unknown>) {
  mockAuth = auth;
  await act(async () => {
    tree = renderer.create(<AppNavigator />);
  });
}

describe('AppNavigator delete-request strip', () => {
  afterEach(() => act(() => tree.unmount()));

  it('mounts for a ready customer', async () => {
    await mount({bootstrapStatus: 'authenticated', accountResolution: {flow: 'CUSTOMER', onboardingStatus: 'READY', authorizedRole: 'CUSTOMER'}});
    expect(shown()).toEqual(expect.arrayContaining(['STRIP PROVIDER', 'CUSTOMER HOME']));
  });

  it('mounts for a chef', async () => {
    await mount({bootstrapStatus: 'authenticated', accountResolution: {flow: 'CHEF', onboardingStatus: 'APPROVED', authorizedRole: 'CHEF'}});
    expect(shown()).toEqual(expect.arrayContaining(['STRIP PROVIDER', 'CHEF HOME']));
  });

  it('does not mount on the sign-in screens', async () => {
    await mount({bootstrapStatus: 'anonymous', accountResolution: null});
    expect(shown()).not.toContain('STRIP PROVIDER');
  });

  it('does not mount while the account is still being resolved', async () => {
    await mount({bootstrapStatus: 'authenticated', accountResolution: null});
    expect(shown()).toContain('RESOLVING');
    expect(shown()).not.toContain('STRIP PROVIDER');
  });
});
