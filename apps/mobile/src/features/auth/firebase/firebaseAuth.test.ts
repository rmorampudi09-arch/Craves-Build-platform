import { getIdToken, signInWithCustomToken } from '@react-native-firebase/auth';
import { firebaseAuth } from './firebaseAuth';

describe('existing backend identity compatibility', () => {
  beforeEach(() => jest.clearAllMocks());
  it('signs in only with the server-issued custom token and forces a fresh exchange token', async () => {
    const user = { uid: 'existing-account' };
    (signInWithCustomToken as jest.Mock).mockResolvedValue({ user });
    (getIdToken as jest.Mock).mockResolvedValue('identity-id-token');
    await expect(
      firebaseAuth.signInWithBackendToken('backend-custom-token'),
    ).resolves.toBe('identity-id-token');
    expect(signInWithCustomToken).toHaveBeenCalledWith(
      {},
      'backend-custom-token',
    );
    expect(getIdToken).toHaveBeenCalledWith(user, true);
    expect(firebaseAuth).not.toHaveProperty('beginPhoneSignIn');
    expect(firebaseAuth).not.toHaveProperty('confirmOtp');
  });
});
