import {applyDetectedCustomerAddress, createCustomerAddressDraft} from '../domain/customerAddressEditor';
import {CustomerAddressesContractError, parseLocationSearchResponse} from './customerAddressesApi';

const madhapur = {
  id: 'ola-1',
  title: 'Cyber Towers',
  subtitle: 'Madhapur, Hyderabad, Telangana',
  formattedAddress: 'Cyber Towers, Hitech City Road, Madhapur, Hyderabad, Telangana 500081',
  latitude: 17.4504,
  longitude: 78.3808,
  houseNumber: null,
  street: 'Hitech City Road',
  area: 'Madhapur',
  district: 'Hyderabad',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500081',
};

describe('customer address search (handbook 009/012)', () => {
  it('reads the location-search answer the backend sends', () => {
    expect(parseLocationSearchResponse({results: [madhapur]})).toEqual([madhapur]);
  });

  it('leaves out unusable places instead of failing the whole search', () => {
    const results = parseLocationSearchResponse({
      results: [
        madhapur,
        {...madhapur, id: 'no-coordinates', latitude: null},
        {...madhapur, id: 'off-the-map', latitude: 120},
        {...madhapur, id: '', formattedAddress: 'No id'},
        'not a place',
      ],
    });

    expect(results.map(result => result.id)).toEqual(['ola-1']);
  });

  it('falls back to the first part of the address when a place has no title', () => {
    const [result] = parseLocationSearchResponse({results: [{...madhapur, title: null, subtitle: 42}]});

    expect(result.title).toBe('Cyber Towers');
    expect(result.subtitle).toBeNull();
  });

  it('refuses an answer that is not the agreed shape', () => {
    expect(() => parseLocationSearchResponse([madhapur])).toThrow(CustomerAddressesContractError);
    expect(() => parseLocationSearchResponse({items: [madhapur]})).toThrow(CustomerAddressesContractError);
  });

  it('fills the address and its map pin from the chosen place', () => {
    const filled = applyDetectedCustomerAddress(createCustomerAddressDraft(), madhapur);

    expect(filled.latitude).toBe(17.4504);
    expect(filled.longitude).toBe(78.3808);
    expect(filled.areaName).toBe('Madhapur');
    expect(filled.postalCode).toBe('500081');
    expect(filled.addressLine1).toBe('Hitech City Road');
  });
});
