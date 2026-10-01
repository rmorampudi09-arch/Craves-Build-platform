import {
  EmailAuthProvider,
  getAuth,
  getIdToken,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  updatePassword,
} from '@react-native-firebase/auth';

export const firebaseAuth = {
  async signInWithBackendToken(customToken: string): Promise<string> {
    const credential = await signInWithCustomToken(getAuth(), customToken);
    return getIdToken(credential.user, true);
  },
  async signInWithEmail(email: string, password: string): Promise<string> {
    const credential = await signInWithEmailAndPassword(
      getAuth(),
      email.trim(),
      password,
    );
    return getIdToken(credential.user, true);
  },
  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(getAuth(), email.trim());
  },
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = getAuth().currentUser;
    if (!user?.email) {
      throw new Error('PASSWORD_CHANGE_REQUIRES_EMAIL_SESSION');
    }
    const credential = EmailAuthProvider.credential(
      user.email,
      currentPassword,
    );
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    await getIdToken(user, true);
  },
  async signOut(): Promise<void> {
    await signOut(getAuth());
  },
};
