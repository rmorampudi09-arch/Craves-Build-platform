type AuthTransitionState = {
  pendingPhone: string | null;
  passwordRecoveryEmail: string | null;
  emailPrefill: string | null;
};

const state: AuthTransitionState = {
  pendingPhone: null,
  passwordRecoveryEmail: null,
  emailPrefill: null,
};

/**
 * Ephemeral auth-flow PII that must not be placed in navigation state or persisted.
 * This module intentionally has no storage dependency; process death clears it.
 */
export const authTransitionMemory = {
  setPendingPhone(phone: string) {
    state.pendingPhone = phone;
  },
  getPendingPhone(): string | null {
    return state.pendingPhone;
  },
  clearPendingPhone() {
    state.pendingPhone = null;
  },
  setPasswordRecoveryEmail(email: string) {
    state.passwordRecoveryEmail = email;
  },
  getPasswordRecoveryEmail(): string | null {
    return state.passwordRecoveryEmail;
  },
  takePasswordRecoveryEmail(): string | null {
    const email = state.passwordRecoveryEmail;
    state.passwordRecoveryEmail = null;
    return email;
  },
  clearPasswordRecoveryEmail() {
    state.passwordRecoveryEmail = null;
  },
  setEmailPrefill(email: string) {
    state.emailPrefill = email;
  },
  takeEmailPrefill(): string | null {
    const email = state.emailPrefill;
    state.emailPrefill = null;
    return email;
  },
  clearEmailPrefill() {
    state.emailPrefill = null;
  },
  clear() {
    state.pendingPhone = null;
    state.passwordRecoveryEmail = null;
    state.emailPrefill = null;
  },
};
