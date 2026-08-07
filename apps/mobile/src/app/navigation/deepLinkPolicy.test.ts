import {parseAllowedDeepLinkDestination} from './deepLinkPolicy';

describe('deepLinkPolicy', () => {
  const anonymous = {authenticated: false, role: null} as const;

  it('accepts an allowlisted anonymous route with validated serializable params', () => {
    expect(
      parseAllowedDeepLinkDestination(
        {routeName: 'PhoneSignIn', params: {role: 'CUSTOMER'}},
        anonymous,
      ),
    ).toEqual({routeName: 'PhoneSignIn', params: {role: 'CUSTOMER'}});

    expect(
      parseAllowedDeepLinkDestination(
        {routeName: 'EmailSignIn', params: {role: 'CHEF', email: 'chef@example.com'}},
        anonymous,
      ),
    ).toEqual({
      routeName: 'EmailSignIn',
      params: {role: 'CHEF', email: 'chef@example.com'},
    });
  });

  it('rejects unknown, sensitive, and malformed destinations', () => {
    expect(
      parseAllowedDeepLinkDestination({routeName: 'OtpVerification'}, anonymous),
    ).toBeNull();
    expect(
      parseAllowedDeepLinkDestination({routeName: 'CustomerAccountStatus'}, anonymous),
    ).toBeNull();
    expect(
      parseAllowedDeepLinkDestination(
        {routeName: 'PhoneSignIn', params: {role: 'ADMIN'}},
        anonymous,
      ),
    ).toBeNull();
    expect(
      parseAllowedDeepLinkDestination(
        {routeName: 'EmailSignIn', params: {role: 'CUSTOMER', user: {id: '1'}}},
        anonymous,
      ),
    ).toBeNull();
  });

  it('does not redirect an authenticated session into anonymous auth routes', () => {
    expect(
      parseAllowedDeepLinkDestination(
        {routeName: 'ForgotPassword', params: {role: 'CUSTOMER'}},
        {authenticated: true, role: 'CUSTOMER'},
      ),
    ).toBeNull();
  });
});
