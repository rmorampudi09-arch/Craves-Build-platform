import React from 'react';
import {Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {Button} from '../../../shared/components/Button';
import {EMPTY_ONBOARDING, chefOnboardingApi, parseOnboardingState} from '../api/chefOnboardingApi';
import {DateOfBirthPicker} from '../components/ChefPickers';
import {ChefOnboardingScreen} from './ChefOnboardingScreen';

jest.setTimeout(20000);

jest.mock('../../../app/store/hooks', () => ({useAppDispatch: () => jest.fn()}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({top: 24, bottom: 24, left: 0, right: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => true}));
jest.mock('../api/chefOnboardingApi', () => ({
  ...jest.requireActual('../api/chefOnboardingApi'),
  chefOnboardingApi: {load: jest.fn(), save: jest.fn(), submit: jest.fn(), upload: jest.fn(), preview: jest.fn(), content: jest.fn()},
}));
jest.mock('../../chefBankOnboarding/api/chefBankOnboardingApi', () => ({chefBankOnboardingApi: {getStatus: jest.fn()}}));
jest.mock('../../customerProfile/components/EmailVerificationPanel', () => {
  const {useEffect} = jest.requireActual('react');
  // The signed-in account already has this verified email.
  return {
    EmailVerificationPanel: ({onVerified}: {onVerified: (email: string) => void}) => {
      useEffect(() => onVerified('asha@example.com'), [onVerified]);
      return null;
    },
  };
});
jest.mock('../../maps/OlaMapPicker', () => ({OlaMapPicker: () => null}));
jest.mock('expo-video', () => ({useVideoPlayer: jest.fn(), VideoView: () => null}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-location', () => ({PermissionStatus: {GRANTED: 'granted'}, Accuracy: {High: 'high'}}));
jest.mock('../../customerAddresses/api/customerAddressesApi', () => ({customerAddressesApi: {}}));
jest.mock('../../auth/state/accountResolutionService', () => ({accountResolutionService: {resolve: jest.fn()}}));
jest.mock('../../auth/state/logoutCoordinator', () => ({completeLogout: jest.fn()}));
jest.mock('../../chefProfile/state/chefProfileRoleSwitch', () => ({switchChefToCustomerRole: jest.fn()}));

const api = chefOnboardingApi as jest.Mocked<typeof chefOnboardingApi>;
const state = (overrides: Record<string, unknown> = {}) =>
  parseOnboardingState({
    enabled: true,
    legacy: false,
    version: 0,
    submitted: false,
    bankEnrollmentRequired: false,
    phoneNumber: '+919876543210',
    details: null,
    application: {id: null, status: 'NOT_SUBMITTED', rejectionReason: null, submittedAt: null, reviewedAt: null},
    documents: [],
    supportPhone: '+919000000000',
    supportEmail: 'support@craves.in',
    callbackRequest: null,
    ...overrides,
  })!;

describe('ChefOnboardingScreen', () => {
  let tree: renderer.ReactTestRenderer;
  const navigation = {replace: jest.fn()};
  const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
  const press = async (label: string) => {
    const button = tree.root.findAllByType(Button).find(node => node.props.label === label);
    if (!button) throw new Error(`No button "${label}"`);
    await act(async () => button.props.onPress());
  };
  const render = async () => {
    await act(async () => {
      tree = renderer.create(<ChefOnboardingScreen navigation={navigation as never} route={{} as never} />);
    });
  };
  beforeEach(() => jest.clearAllMocks());

  it('starts a new chef on Basic details and saves the step before moving to the kitchen', async () => {
    api.load.mockResolvedValue(state());
    await render();
    expect(texts()).toContain('Basic details');

    await press('Save and continue');
    expect(texts()).toContain('Enter your full name, including your first and last name.');
    expect(api.save).not.toHaveBeenCalled();

    const name = tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Full name')!;
    await act(async () => name.props.onChangeText('Asha Rao'));
    // Date of birth comes from the calendar sheet; set it the way its Done button does.
    await act(async () => tree.root.findByType(DateOfBirthPicker).props.onChange('1990-05-01'));
    api.save.mockResolvedValue(state({version: 1, details: {...EMPTY_ONBOARDING, firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-01', email: 'asha@example.com'}}));
    await press('Save and continue');

    expect(api.save).toHaveBeenCalledWith(0, expect.objectContaining({firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com'}), false);
    expect(texts()).toContain('Your kitchen');
    // Applicants are told before uploading that these two photos become public on their kitchen page.
    expect(texts()).toContain('Two clear photos of where you cook. Customers see them on your kitchen page.');
  });

  it('shows a submitted application on its status page', async () => {
    api.load.mockResolvedValue(
      state({submitted: true, details: EMPTY_ONBOARDING, application: {id: 'app-1', status: 'PENDING', rejectionReason: null, submittedAt: '2026-10-12T05:00:00Z', reviewedAt: null, referenceCode: 'CRV-10001'}}),
    );
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['Your application', 'Submitted', 'CRV-10001']));
    expect(tree.root.findAllByType(Button).map(node => node.props.label)).toContain('Refresh status');
  });

  it('keeps applications made with the older form on the older screens', async () => {
    api.load.mockResolvedValue(state({legacy: true, details: EMPTY_ONBOARDING}));
    await render();
    expect(navigation.replace).toHaveBeenCalledWith('ChefRegistration');
  });
});
