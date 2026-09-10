import {
  EmailAuthProvider,
  getAuth,
  getIdToken,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut,
  updatePassword,
} from '@react-native-firebase/auth';

let phoneConfirmation: Awaited<ReturnType<typeof signInWithPhoneNumber>> | null = null;

export const firebaseAuth = {
  async beginPhoneSignIn(e164PhoneNumber: string): Promise<void> {
    phoneConfirmation = await signInWithPhoneNumber(getAuth(), e164PhoneNumber);
  },
  async confirmOtp(code: string): Promise<string> {
    if (!phoneConfirmation) {
      throw new Error('OTP_CHALLENGE_MISSING');
    }
    const credential = await phoneConfirmation.confirm(code);
    if (!credential?.user) {
      throw new Error('OTP_CONFIRMATION_FAILED');
    }
    phoneConfirmation = null;
    return getIdToken(credential.user, true);
  },
  async signInWithEmail(email: string, password: string): Promise<string> {
    const credential = await signInWithEmailAndPassword(getAuth(), email.trim(), password);
    return getIdToken(credential.user, true);
  },
  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(getAuth(), email.trim());
  },
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = getAuth().currentUser;
    if (!user?.email) {
      throw new Error('PASSWORD_CHANGE_REQUIRES_EMAIL_SESSION');
    }
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    await getIdToken(user, true);
  },
  async signOut(): Promise<void> {
    phoneConfirmation = null;
    await signOut(getAuth());
  },
  hasPendingOtp(): boolean {
    return phoneConfirmation !== null;
  },
};
