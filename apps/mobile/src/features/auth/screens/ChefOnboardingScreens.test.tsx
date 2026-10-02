import React from 'react';
import renderer, {act} from 'react-test-renderer';
import * as Location from 'expo-location';
import {AppApiError} from '../../../core/http/apiError';
import {EmailVerificationPanel} from '../../customerProfile/components/EmailVerificationPanel';
import {ChefKycEvidencePanel} from '../../chefBusinessInformation/components/ChefKycEvidencePanel';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {profileApi} from '../api/profileApi';
import type {AccountResolution, ChefApplication} from '../domain/types';
import {accountResolutionService} from '../state/accountResolutionService';
import {ChefRegistrationScreen} from './ChefRegistrationScreen';
import {ChefAccountStatusScreen} from './ChefAccountStatusScreen';
import {CustomerRegistrationScreen} from './CustomerRegistrationScreen';
import {completeLogout} from '../state/logoutCoordinator';
import {customerAddressesApi} from '../../customerAddresses/api/customerAddressesApi';

jest.setTimeout(15000);

const mockDispatch = jest.fn();
let mockResolution: AccountResolution;
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({auth: {accountResolution: mockResolution}}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({top: 24, bottom: 24, left: 0, right: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => true,
}));
jest.mock('../api/profileApi', () => ({
  profileApi: {getChefApplication: jest.fn(), submitChefApplication: jest.fn(), saveCustomerProfile: jest.fn()},
}));
jest.mock('../state/accountResolutionService', () => ({
  accountResolutionService: {resolve: jest.fn()},
}));
jest.mock('../state/logoutCoordinator', () => ({completeLogout: jest.fn()}));
jest.mock('expo-location', () => ({
  PermissionStatus: {GRANTED: 'granted'}, Accuracy: {High: 'high'},
  requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(),
}));
jest.mock('../../customerAddresses/api/customerAddressesApi', () => ({
  customerAddressesApi: {reverseGeocode: jest.fn()},
}));
jest.mock('../../customerProfile/components/EmailVerificationPanel', () => ({
  EmailVerificationPanel: () => null,
}));
jest.mock('../../chefBusinessInformation/components/ChefKycEvidencePanel', () => ({
  ChefKycEvidencePanel: () => null,
}));
jest.mock('../../chefBankOnboarding/components/ChefBankOnboardingPanel', () => ({
  ChefBankOnboardingPanel: () => null,
}));

const application: ChefApplication = {
  id: 'application-1', identityId: 'identity-1', phoneNumber: '+919876543210',
  email: 'chef@example.com', firstName: 'Asha', lastName: 'Rao',
  addressLine1: '12 Market Road', addressLine2: null, landmark: null,
  city: 'Hyderabad', state: 'Telangana', postalCode: '500001',
  latitude: null, longitude: null, status: 'PENDING', rejectionReason: null,
  submittedAt: '2026-10-02T00:00:00Z', reviewedAt: null,
  reviewedByIdentityId: null, documents: [],
};

describe('Chef onboarding screen journey', () => {
  let tree: renderer.ReactTestRenderer;
  const navigation = {replace: jest.fn()};
  const button = (label: string) => tree.root.findAllByType(PrimaryButton)
    .find(node => node.props.label === label)!;
  const render = async (element: React.ReactElement) => {
    await act(async () => {tree = renderer.create(element);});
  };
  const registration = () => render(<ChefRegistrationScreen navigation={navigation as never} route={{} as never} />);
  const status = () => render(<ChefAccountStatusScreen navigation={navigation as never} route={{params: {status: 'PENDING'}} as never} />);
  const fill = async () => {
    const values: Record<string, string> = {
      'First name': ' Asha ', 'Last name': ' Rao ', 'Chef email': 'chef@example.com',
      'Address line 1': ' 12 Market Road ', 'City': ' Hyderabad ', 'State': ' Telangana ',
      'Postal code (optional)': '500001',
    };
    await act(async () => {
      for (const [placeholder, value] of Object.entries(values)) {
        tree.root.findAllByType(InputField).find(node => node.props.placeholder === placeholder)!.props.onChangeText(value);
      }
    });
  };
  const verifyEmail = async () => {
    await act(async () => tree.root.findByType(EmailVerificationPanel).props.onVerified('chef@example.com'));
  };
  beforeEach(() => {
    jest.clearAllMocks();
    (profileApi.getChefApplication as jest.Mock).mockReset();
    (profileApi.submitChefApplication as jest.Mock).mockReset();
    (accountResolutionService.resolve as jest.Mock).mockReset();
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockReset()
      .mockResolvedValue({status: 'granted', canAskAgain: true});
    (Location.getCurrentPositionAsync as jest.Mock).mockReset()
      .mockResolvedValue({coords: {latitude: 17.385, longitude: 78.4867}});
    (customerAddressesApi.reverseGeocode as jest.Mock).mockReset().mockResolvedValue({
      formattedAddress: '14, Lake Road, Hyderabad', houseNumber: '14', street: 'Lake Road',
      area: 'Central', city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana',
      postalCode: '500002', country: 'India', confidence: 'High', preciseHouseNumber: true,
    });
    mockResolution = {flow: 'CHEF_ONBOARDING', requestedRole: 'CHEF', authorizedRole: 'CUSTOMER', onboardingStatus: 'NOT_SUBMITTED'};
    (profileApi.getChefApplication as jest.Mock).mockResolvedValue(application);
    (profileApi.submitChefApplication as jest.Mock).mockResolvedValue(application);
  });
  afterEach(() => {act(() => tree?.unmount());});

  it('keeps submission disabled until the exact application email is verified', async () => {
    await registration();
    await fill();
    expect(button('Submit for review').props.disabled).toBe(true);
    await verifyEmail();
    expect(button('Submit for review').props.disabled).toBe(false);
    await act(async () => tree.root.findAllByType(InputField).find(node => node.props.placeholder === 'Chef email')!.props.onChangeText('other@example.com'));
    expect(button('Submit for review').props.disabled).toBe(true);
    expect(profileApi.submitChefApplication).not.toHaveBeenCalled();
  });

  it('requests location only on an explicit tap and submits the mapped address and coordinates', async () => {
    await registration(); await fill();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    await act(async () => {await button('Use my current location').props.onPress();});
    expect(customerAddressesApi.reverseGeocode).toHaveBeenCalledWith(17.385, 78.4867);
    expect(tree.root.findAllByType(InputField).find(node => node.props.placeholder === 'Address line 1')!.props.value).toBe('14, Lake Road');
    expect(tree.root.findAllByType(InputField).find(node => node.props.placeholder === 'First name')!.props.value).toBe(' Asha ');
    expect(button('Submit for review').props.disabled).toBe(true);
    await verifyEmail();
    await act(async () => {await button('Submit for review').props.onPress();});
    expect(profileApi.submitChefApplication).toHaveBeenCalledWith(expect.objectContaining({
      addressLine1: '14, Lake Road', postalCode: '500002', latitude: 17.385, longitude: 78.4867,
    }));
  });

  it('keeps manual address entry available after permission denial', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({status: 'denied', canAskAgain: false});
    await registration(); await fill(); await verifyEmail();
    await act(async () => {await button('Use my current location').props.onPress();});
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(customerAddressesApi.reverseGeocode).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('phone settings');
    expect(button('Submit for review').props.disabled).toBe(false);
    await act(async () => {await button('Submit for review').props.onPress();});
    expect(profileApi.submitChefApplication).toHaveBeenCalledWith(expect.objectContaining({addressLine1: '12 Market Road'}));
    expect((profileApi.submitChefApplication as jest.Mock).mock.calls[0][0]).not.toHaveProperty('latitude');
  });

  it('retains the address and allows a retry when reverse lookup fails', async () => {
    (customerAddressesApi.reverseGeocode as jest.Mock).mockRejectedValueOnce(new AppApiError('SERVICE_UNAVAILABLE', 'Try again.', 503));
    await registration(); await fill();
    await act(async () => {await button('Use my current location').props.onPress();});
    expect(JSON.stringify(tree.toJSON())).toContain('Try again.');
    expect(tree.root.findAllByType(InputField).find(node => node.props.placeholder === 'Address line 1')!.props.value).toBe(' 12 Market Road ');
    expect(button('Use my current location').props.loading).toBe(false);
    await act(async () => {await button('Use my current location').props.onPress();});
    expect(JSON.stringify(tree.toJSON())).toContain('Location found.');
  });

  it('does not send malformed GPS coordinates to the backend', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({coords: {latitude: 91, longitude: 78}});
    await registration();
    await act(async () => {await button('Use my current location').props.onPress();});
    expect(customerAddressesApi.reverseGeocode).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Current location could not be determined.');
  });

  it('handles disabled device location without a crash or address overwrite', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue({code: 'LOCATION_PROVIDER_DISABLED'});
    await registration(); await fill();
    await act(async () => {await button('Use my current location').props.onPress();});
    expect(customerAddressesApi.reverseGeocode).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Turn on phone location services');
    expect(button('Use my current location').props.loading).toBe(false);
  });

  it('blocks duplicate location requests and submission/sign-out while locating', async () => {
    let releasePermission!: (value: unknown) => void;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockReturnValue(new Promise(resolve => {releasePermission = resolve;}));
    await registration(); await fill(); await verifyEmail();
    let request!: Promise<void>;
    await act(async () => {
      request = button('Use my current location').props.onPress();
      await button('Use my current location').props.onPress();
    });
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(button('Submit for review').props.disabled).toBe(true);
    expect(button('Sign out').props.disabled).toBe(true);
    await act(async () => {await button('Submit for review').props.onPress();});
    expect(profileApi.submitChefApplication).not.toHaveBeenCalled();
    await act(async () => {releasePermission({status: 'granted'}); await request;});
    expect(button('Submit for review').props.disabled).toBe(false);
  });

  it('does not continue location work after the form is unmounted', async () => {
    let releasePermission!: (value: unknown) => void;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockReturnValue(new Promise(resolve => {releasePermission = resolve;}));
    await registration();
    let request!: Promise<void>;
    await act(async () => {request = button('Use my current location').props.onPress();});
    act(() => tree.unmount());
    await act(async () => {releasePermission({status: 'granted'}); await request;});
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(customerAddressesApi.reverseGeocode).not.toHaveBeenCalled();
  });

  it('does not reuse a detected pin when the user changes the city', async () => {
    await registration(); await fill(); await verifyEmail();
    await act(async () => {await button('Use my current location').props.onPress();});
    await act(async () => tree.root.findAllByType(InputField).find(node => node.props.placeholder === 'City')!.props.onChangeText('Bengaluru'));
    await act(async () => {await button('Submit for review').props.onPress();});
    expect((profileApi.submitChefApplication as jest.Mock).mock.calls[0][0]).not.toHaveProperty('latitude');
  });

  it('preserves an existing rejected application pin on resubmission', async () => {
    mockResolution = {flow: 'CHEF_ONBOARDING', requestedRole: 'CHEF', authorizedRole: 'CUSTOMER', onboardingStatus: 'REJECTED'};
    (profileApi.getChefApplication as jest.Mock).mockResolvedValue({...application, status: 'REJECTED', latitude: 17.385, longitude: 78.4867});
    await registration(); await verifyEmail();
    await act(async () => {await button('Resubmit for review').props.onPress();});
    expect(profileApi.submitChefApplication).toHaveBeenCalledWith(expect.objectContaining({latitude: 17.385, longitude: 78.4867}));
  });

  it('sends normalized address fields and opens pending only after confirmed submission', async () => {
    await registration();
    await fill();
    await verifyEmail();
    await act(async () => {await button('Submit for review').props.onPress();});
    expect(profileApi.submitChefApplication).toHaveBeenCalledWith({
      firstName: 'Asha', lastName: 'Rao', email: 'chef@example.com',
      addressLine1: '12 Market Road', city: 'Hyderabad', state: 'Telangana', postalCode: '500001',
    });
    expect(navigation.replace).toHaveBeenCalledWith('ChefAccountStatus', {status: 'PENDING'});
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({type: 'auth/chefApplicationStatusObserved', payload: 'PENDING'}));
  });

  it('does not claim successful submission when the backend fails', async () => {
    (profileApi.submitChefApplication as jest.Mock).mockRejectedValue(new AppApiError('SERVICE_UNAVAILABLE', 'Please try again.', 503));
    await registration(); await fill(); await verifyEmail();
    await act(async () => {await button('Submit for review').props.onPress();});
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Please try again.');
    expect(button('Submit for review').props.loading).toBe(false);
  });

  it('renders backend address validation errors without discarding the draft', async () => {
    (profileApi.submitChefApplication as jest.Mock).mockRejectedValue(new AppApiError('VALIDATION_FAILED', 'Invalid input.', 400, undefined, false, false, ['addressLine1: invalid']));
    await registration(); await fill(); await verifyEmail();
    await act(async () => {await button('Submit for review').props.onPress();});
    const address = tree.root.findAllByType(InputField).find(node => node.props.placeholder === 'Address line 1')!;
    expect(address.props.error).toBe('Check your address and try again.');
    expect(address.props.value).toBe(' 12 Market Road ');
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('does not advance if a submission response is not pending', async () => {
    (profileApi.submitChefApplication as jest.Mock).mockResolvedValue({...application, status: 'REJECTED'});
    await registration(); await fill(); await verifyEmail();
    await act(async () => {await button('Submit for review').props.onPress();});
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('We could not confirm your application as pending.');
  });

  it('prefills a rejected application and resubmits through the same endpoint', async () => {
    mockResolution = {flow: 'CHEF_ONBOARDING', requestedRole: 'CHEF', authorizedRole: 'CUSTOMER', onboardingStatus: 'REJECTED'};
    (profileApi.getChefApplication as jest.Mock).mockResolvedValue({...application, status: 'REJECTED', rejectionReason: 'Check address'});
    await registration();
    expect(JSON.stringify(tree.toJSON())).toContain('Review note:');
    expect(tree.root.findAllByType(InputField).find(node => node.props.placeholder === 'Address line 1')!.props.value).toBe(application.addressLine1);
    await verifyEmail();
    await act(async () => {await button('Resubmit for review').props.onPress();});
    expect(navigation.replace).toHaveBeenCalledWith('ChefAccountStatus', {status: 'PENDING'});
  });

  it('restores pending status with proof uploads available but without Chef access', async () => {
    mockResolution = {flow: 'CHEF_ONBOARDING', requestedRole: 'CHEF', authorizedRole: 'CUSTOMER', onboardingStatus: 'PENDING'};
    await status();
    expect(JSON.stringify(tree.toJSON())).toContain('Chef application under review');
    expect(tree.root.findByType(ChefKycEvidencePanel).props.applicationStatus).toBe('PENDING');
    expect(accountResolutionService.resolve).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('returns an unsubmitted account to registration on status refresh', async () => {
    (profileApi.getChefApplication as jest.Mock).mockResolvedValue({...application, id: null, status: 'NOT_SUBMITTED'});
    await status();
    expect(navigation.replace).toHaveBeenCalledWith('ChefRegistration');
  });

  it('leaves pending locked on a failed status refresh and supports retry', async () => {
    (profileApi.getChefApplication as jest.Mock).mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'Connection unavailable.', 0));
    await status();
    expect(JSON.stringify(tree.toJSON())).toContain('Connection unavailable.');
    expect(accountResolutionService.resolve).not.toHaveBeenCalled();
    await act(async () => {await button('Refresh status').props.onPress();});
    expect(JSON.stringify(tree.toJSON())).not.toContain('Connection unavailable.');
    expect(profileApi.getChefApplication).toHaveBeenCalledTimes(2);
  });

  it('requires fresh account authorization before opening approved Chef mode', async () => {
    (profileApi.getChefApplication as jest.Mock).mockResolvedValue({...application, status: 'APPROVED'});
    const resolution: AccountResolution = {flow: 'CHEF', requestedRole: 'CHEF', authorizedRole: 'CHEF', onboardingStatus: 'APPROVED'};
    const resolved = {
      identity: {id: application.identityId, status: 'ACTIVE', roles: ['CUSTOMER', 'CHEF']},
      resolution,
    };
    (accountResolutionService.resolve as jest.Mock).mockResolvedValue(resolved);
    await status();
    expect(accountResolutionService.resolve).toHaveBeenCalledWith('CHEF');
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({type: 'auth/accountResolved', payload: resolved}));
  });

  it('lets an unsubmitted Chef leave onboarding without submitting an application', async () => {
    await registration();
    await act(async () => {await button('Sign out').props.onPress();});
    expect(completeLogout).toHaveBeenCalledWith(mockDispatch);
    expect(profileApi.submitChefApplication).not.toHaveBeenCalled();
  });

  it('lets a wrong-role Customer registration exit without creating a profile', async () => {
    mockResolution = {flow: 'CUSTOMER', requestedRole: 'CUSTOMER', authorizedRole: 'CUSTOMER', onboardingStatus: 'PROFILE_REQUIRED'};
    await render(<CustomerRegistrationScreen navigation={navigation as never} route={{} as never} />);
    await act(async () => {await button('Sign out').props.onPress();});
    expect(completeLogout).toHaveBeenCalledWith(mockDispatch);
    expect(profileApi.saveCustomerProfile).not.toHaveBeenCalled();
    expect(profileApi.submitChefApplication).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
