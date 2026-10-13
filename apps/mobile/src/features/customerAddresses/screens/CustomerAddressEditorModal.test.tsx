import React from 'react';
import {Alert} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import {Button} from '../../../shared/components/Button';
import {InputField} from '../../../shared/components/InputField';
import {customerAddressesApi} from '../api/customerAddressesApi';
import {CustomerAddressEditorModal} from './CustomerAddressEditorModal';

const mockCreate = jest.fn();

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({customerShell: {selectedLocation: null}}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../shared/components/ScreenShell', () => ({ScreenShell: 'ScreenShell'}));
jest.mock('../query/customerAddressQueries', () => ({
  useCreateCustomerAddressMutation: () => ({mutateAsync: mockCreate, isPending: false}),
  useUpdateCustomerAddressMutation: () => ({mutateAsync: jest.fn(), isPending: false}),
}));
jest.mock('../api/customerAddressesApi', () => ({
  customerAddressesApi: {searchLocations: jest.fn(), reverseGeocode: jest.fn()},
}));

const searchLocations = customerAddressesApi.searchLocations as jest.Mock;
const reverseGeocode = customerAddressesApi.reverseGeocode as jest.Mock;

const resolved = {
  formattedAddress: 'Ayyappa Society Main Road, Madhapur, Hyderabad, 500081',
  houseNumber: null,
  street: 'Ayyappa Society Main Road',
  area: 'Madhapur',
  city: 'Hyderabad',
  district: 'Rangareddy',
  state: 'Telangana',
  postalCode: '500081',
  country: 'India',
  confidence: 'Medium',
  preciseHouseNumber: false,
};

describe('Ola address editor flow', () => {
  let tree: renderer.ReactTestRenderer;
  const onSaved = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    searchLocations.mockResolvedValue([
      {id: 'ola:1', title: 'Madhapur', subtitle: 'Hyderabad, Telangana, India', latitude: 17.4483, longitude: 78.3915},
    ]);
    mockCreate.mockImplementation(async request => ({id: 'new-address', ...request}));
  });

  afterEach(() => {
    act(() => tree?.unmount());
    jest.useRealTimers();
  });

  const pressByLabel = async (label: string) => {
    const node = tree.root.findAll(
      item => item.props.accessibilityLabel === label && typeof item.props.onPress === 'function',
    )[0];
    await act(async () => node.props.onPress());
  };
  const pressButton = async (label: string) => {
    const node = tree.root.findAllByType(Button).find(item => item.props.label === label)!;
    await act(async () => node.props.onPress());
  };
  const input = (match: (props: Record<string, unknown>) => boolean) =>
    tree.root.findAllByType(InputField).find(item => match(item.props))!;
  const type = async (label: string, value: string) => {
    await act(async () => input(props => props.label === label).props.onChangeText(value));
  };

  const searchAndConfirm = async () => {
    await act(async () => {
      tree = renderer.create(
        <CustomerAddressEditorModal addresses={[]} mode="add" onClose={jest.fn()} onSaved={onSaved} />,
      );
    });
    await act(async () =>
      input(props => props.accessibilityLabel === 'Search for area, street or landmark')
        .props.onChangeText('Madhapur'),
    );
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(searchLocations).toHaveBeenCalledTimes(1);
    expect(searchLocations.mock.calls[0].slice(0, 2)).toEqual(['Madhapur', null]);
    await pressByLabel('Madhapur, Hyderabad, Telangana, India');
  };

  it('goes from search to pin to details and saves with the pin and an entered flat', async () => {
    reverseGeocode.mockResolvedValue(resolved);
    await searchAndConfirm();

    expect(reverseGeocode.mock.calls[0].slice(0, 2)).toEqual([17.4483, 78.3915]);
    await pressButton('Confirm location');

    const house = input(props => props.label === 'Flat, house or building');
    expect(house.props.value).toBe('');
    expect(house.props.helperText).toContain("can't find your exact door");

    await pressButton('Save address');
    expect(mockCreate).not.toHaveBeenCalled();

    await type('Flat, house or building', 'Flat 302');
    await type('Recipient name', 'Priya Reddy');
    await type('Phone number', '+919876543210');
    await pressButton('Save address');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        addressLine1: 'Flat 302',
        addressLine2: 'Ayyappa Society Main Road',
        areaName: 'Madhapur',
        postalCode: '500081',
        latitude: 17.4483,
        longitude: 78.3915,
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({id: 'new-address'}));
  });

  it('waits out Retry-After on a 429 and then looks the pin up once more', async () => {
    reverseGeocode
      .mockRejectedValueOnce(
        new AppApiError('LOCATION_RATE_LIMITED', 'Too many requests.', 429, undefined, true, false, [], 7),
      )
      .mockResolvedValueOnce(resolved);
    await searchAndConfirm();

    const confirm = () =>
      tree.root.findAllByType(Button).find(item => String(item.props.label).startsWith('Confirm location'))!;
    expect(confirm().props.label).toBe('Confirm location in 7 s');
    expect(confirm().props.disabled).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(reverseGeocode).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(reverseGeocode).toHaveBeenCalledTimes(2);
    expect(confirm().props.label).toBe('Confirm location');
    expect(confirm().props.disabled).toBe(false);
  });

  it('keeps the pin and offers manual entry when the address cannot be identified', async () => {
    reverseGeocode.mockRejectedValue(
      new AppApiError('REVERSE_GEOCODING_UNAVAILABLE', 'unavailable', 503),
    );
    await searchAndConfirm();

    await pressButton('Enter address manually');
    await type('Flat, house or building', 'Plot 12');
    await type('Area / locality', 'Madhapur');
    await type('Pincode', '500081');
    await type('City', 'Hyderabad');
    await type('District', 'Rangareddy');
    await type('State', 'Telangana');
    await type('Recipient name', 'Priya Reddy');
    await type('Phone number', '+919876543210');
    await pressButton('Save address');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({addressLine1: 'Plot 12', latitude: 17.4483, longitude: 78.3915}),
    );
  });
});
