import {
  chefBusinessDocumentTypeLabel,
  chefKitchenStatusLabel,
  formatChefBusinessAddress,
  formatChefBusinessDate,
  formatChefBusinessFileSize,
  getChefBusinessVerificationPresentation,
} from './chefBusinessInformationPresentation';
import type {ChefBusinessVerificationRecord} from '../api/chefBusinessInformationApi';
import type {ChefKitchenProfile} from '../../chefProfile/api/chefProfileApi';

const baseVerification: ChefBusinessVerificationRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  phoneNumber: '+919999999999',
  email: 'chef@example.com',
  firstName: 'Test',
  lastName: 'Chef',
  addressLine1: '12 Market Road',
  addressLine2: null,
  landmark: null,
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  latitude: null,
  longitude: null,
  status: 'APPROVED',
  rejectionReason: null,
  submittedAt: '2026-08-01T10:00:00Z',
  reviewedAt: '2026-08-02T10:00:00Z',
  documents: [],
};

const kitchen: ChefKitchenProfile = {
  id: '22222222-2222-4222-8222-222222222222',
  identityId: '33333333-3333-4333-8333-333333333333',
  kitchenName: 'Test Kitchen',
  displayName: null,
  description: null,
  phoneNumber: null,
  email: null,
  addressLine1: '12 Market Road',
  addressLine2: 'First floor',
  landmark: null,
  areaName: 'Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560038',
  latitude: 12.97,
  longitude: 77.64,
  status: 'ACTIVE',
  createdAt: '2026-07-01T10:00:00Z',
  updatedAt: '2026-08-09T10:00:00Z',
};

describe('chef business information presentation', () => {
  it('does not reinterpret uploaded proof metadata as document verification', () => {
    expect(getChefBusinessVerificationPresentation(baseVerification)).toEqual(
      expect.objectContaining({label: 'Verified', tone: 'success'}),
    );
    expect(chefBusinessDocumentTypeLabel('AADHAAR_CARD')).toBe('Aadhaar card');
    expect(chefBusinessDocumentTypeLabel('PAN_CARD')).toBe('PAN card');
  });

  it('surfaces the backend application rejection reason', () => {
    const rejected: ChefBusinessVerificationRecord = {
      ...baseVerification,
      status: 'REJECTED',
      rejectionReason: 'Address could not be verified.',
    };
    expect(getChefBusinessVerificationPresentation(rejected)).toEqual(
      expect.objectContaining({
        label: 'Rejected',
        tone: 'error',
        summary: 'Address could not be verified.',
      }),
    );
  });

  it('formats only safe document metadata and business address values', () => {
    expect(formatChefBusinessFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatChefBusinessDate('2026-08-09T10:00:00Z')).toBe('09 Aug 2026');
    expect(formatChefBusinessAddress(kitchen)).toBe(
      '12 Market Road, First floor, Indiranagar, Bengaluru, Karnataka, 560038',
    );
    expect(chefKitchenStatusLabel('ACTIVE')).toBe('Active');
  });
});
