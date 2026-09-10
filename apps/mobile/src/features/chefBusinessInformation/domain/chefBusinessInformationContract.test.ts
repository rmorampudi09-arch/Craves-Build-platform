import {
  CHEF_BUSINESS_INFORMATION_CAPABILITIES,
  CHEF_BUSINESS_INFORMATION_CONTRACT_MODEL,
  CHEF_BUSINESS_INFORMATION_SOURCES,
  getUnavailableChefBusinessInformationCapabilities,
  hasCompleteChefBusinessInformationContract,
} from './chefBusinessInformationContract';

describe('Chef Business Information contract model', () => {
  it('maps only the exact currently supported Reference-49 sources as supported capabilities', () => {
    expect(CHEF_BUSINESS_INFORMATION_CAPABILITIES.businessProfile.availability).toBe(
      'supported',
    );
    expect(
      CHEF_BUSINESS_INFORMATION_CAPABILITIES.verificationStatus.availability,
    ).toBe('supported');
    expect(CHEF_BUSINESS_INFORMATION_CAPABILITIES.documentMetadata.availability).toBe(
      'supported',
    );
    expect(CHEF_BUSINESS_INFORMATION_CONTRACT_MODEL.status).toBe('partial');
  });

  it('fails closed for Guide capabilities that have no complete approved backend contract', () => {
    expect(getUnavailableChefBusinessInformationCapabilities()).toEqual([
      'documentUploadUpdate',
      'documentValidityLifecycle',
      'serviceAreas',
      'cuisines',
      'payoutSetupStatus',
    ]);
    expect(hasCompleteChefBusinessInformationContract()).toBe(false);
    expect(
      getUnavailableChefBusinessInformationCapabilities().every(
        key =>
          CHEF_BUSINESS_INFORMATION_CAPABILITIES[key].availability === 'unavailable',
      ),
    ).toBe(true);
  });

  it('records the exact existing backend/APIM source paths without inventing Guide endpoints', () => {
    expect(CHEF_BUSINESS_INFORMATION_SOURCES.catalogKitchenProfileRead).toEqual(
      expect.objectContaining({method: 'GET', path: '/api/v1/kitchens/me'}),
    );
    expect(CHEF_BUSINESS_INFORMATION_SOURCES.catalogKitchenProfileReplace).toEqual(
      expect.objectContaining({method: 'PUT', path: '/api/v1/kitchens/me'}),
    );
    expect(CHEF_BUSINESS_INFORMATION_SOURCES.chefApplicationRead).toEqual(
      expect.objectContaining({method: 'GET', path: '/api/v1/chef/application'}),
    );
    expect(CHEF_BUSINESS_INFORMATION_SOURCES.chefProofFileUpload).toEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/chef/application/proof-files',
        request: 'multipart/form-data: documentType + file',
      }),
    );

    const serialized = JSON.stringify(CHEF_BUSINESS_INFORMATION_CONTRACT_MODEL);
    expect(serialized).not.toContain('/service-areas');
    expect(serialized).not.toContain('/cuisines');
    expect(serialized).not.toContain('/payout-settings');
    expect(serialized).not.toContain('FSSAI');
  });

  it('does not misclassify the onboarding proof upload as approved-Chef document maintenance', () => {
    const capability = CHEF_BUSINESS_INFORMATION_CAPABILITIES.documentUploadUpdate;
    expect(capability.availability).toBe('unavailable');
    if (capability.availability === 'unavailable') {
      expect(capability.knownBoundary).toContain(
        '/api/v1/chef/application/proof-files',
      );
      expect(capability.reason).toContain('APPROVED');
    }
  });
});
