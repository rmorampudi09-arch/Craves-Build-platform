import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';

let phoneConfirmation: FirebaseAuthTypes.ConfirmationResult | null = null;

export const firebaseAuth = {
  async beginPhoneSignIn(e164PhoneNumber: string): Promise<void> {
    phoneConfirmation = await auth().signInWithPhoneNumber(e164PhoneNumber);
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
    return credential.user.getIdToken(true);
  },
  async signInWithEmail(email: string, password: string): Promise<string> {
    const credential = await auth().signInWithEmailAndPassword(email.trim(), password);
    return credential.user.getIdToken(true);
  },
  async sendPasswordReset(email: string): Promise<void> {
    await auth().sendPasswordResetEmail(email.trim());
  },
  async signOut(): Promise<void> {
    phoneConfirmation = null;
    await auth().signOut();
  },
  hasPendingOtp(): boolean {
    return phoneConfirmation !== null;
  },
};
