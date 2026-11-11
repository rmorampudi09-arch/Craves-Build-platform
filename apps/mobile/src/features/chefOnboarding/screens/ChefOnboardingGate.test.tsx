import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { PrimaryButton } from '../../auth/components/PrimaryButton';
import {
  chefOnboardingApi,
  emptyDetails,
  type OnboardingState,
} from '../api/chefOnboardingApi';
import { ChefOnboardingGate } from './ChefOnboardingGate';
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
}));
jest.mock('../../auth/state/logoutCoordinator', () => ({
  completeLogout: jest.fn(async () => undefined),
}));
jest.mock('../../auth/components/AuthShell', () => ({
  AuthShell: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('../../auth/components/AuthCard', () => ({
  AuthCard: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../api/chefOnboardingApi', () => {
  const actual = jest.requireActual('../api/chefOnboardingApi');
  return {
    ...actual,
    chefOnboardingApi: {
      mine: jest.fn(),
      save: jest.fn(),
      submit: jest.fn(),
      content: jest.fn(),
      email: jest.fn(),
    },
  };
});
const state: OnboardingState = {
  enabled: true,
  legacy: false,
  version: 1,
  resumeStep: 'fssai' as const,
  submitted: false,
  phoneNumber: '+919000000000',
  details: {
    ...emptyDetails,
    email: 'chef@example.test',
    firstName: 'Test',
    lastName: 'Chef',
    dateOfBirth: '1990-01-01',
  },
  application: { id: null, status: 'NOT_SUBMITTED' as const },
  documents: [],
  requiredDocuments: [],
  supportPhone: '8367366787',
  supportEmail: 'support@craves.in',
};
let tree: renderer.ReactTestRenderer;
async function mount(value: OnboardingState = state) {
  jest.mocked(chefOnboardingApi.mine).mockResolvedValue(value);
  await act(async () => {
    tree = renderer.create(
      <ChefOnboardingGate fallback={<Text>Existing workspace</Text>} />,
    );
  });
}
function button(label: string) {
  return tree.root
    .findAllByType(PrimaryButton)
    .find(node => node.props.label === label)!;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(chefOnboardingApi.content).mockResolvedValue([]);
  jest.mocked(chefOnboardingApi.email).mockResolvedValue({ email: null, emailVerified: false, emailRevision: 1, serverTime: '2026-11-10T00:00:00Z', pending: null });
});
afterEach(() => {
  if (tree) {
    act(() => tree.unmount());
  }
});
const texts = () =>
  tree.root.findAllByType(Text).map(node => String(node.props.children));
const approved: OnboardingState = {
  ...state,
  resumeStep: 'waiting',
  submitted: true,
  application: { id: null, status: 'APPROVED' },
};
test('signup says FSSAI is needed later and never asks for it', async () => {
  await mount({ ...state, resumeStep: 'personal' });
  expect(texts().some(text => text.includes('add your FSSAI number later'))).toBe(true);
  expect(button('I have FSSAI')).toBeUndefined();
  act(() => tree.unmount());
  await mount({ ...state, resumeStep: 'review' });
  expect(texts().some(text => text.includes('add your FSSAI number later'))).toBe(true);
  expect(button('Submit for admin review')).toBeTruthy();
});
test('approved Chef works in the app, adds the FSSAI number there, and is told Craves is verifying it', async () => {
  await mount(approved);
  expect(texts()).toContain('Existing workspace');
  expect(texts().some(text => text.includes('Add your FSSAI number.'))).toBe(true);
  act(() => button('Add FSSAI number').props.onPress());
  // Number only: no document upload, and a short number is refused before any save.
  expect(button('Upload FSSAI document')).toBeUndefined();
  await act(async () => {
    await button('Save FSSAI number').props.onPress();
  });
  expect(texts()).toContain('Enter the 14-digit FSSAI number to continue.');
  expect(chefOnboardingApi.save).not.toHaveBeenCalled();
  act(() => tree.unmount());
  const saved = { ...approved, version: 2, details: { ...approved.details!, fssaiNumber: '12345678901234' } };
  await mount(saved);
  expect(texts().some(text => text.includes('Craves is verifying your FSSAI number.'))).toBe(true);
  jest.mocked(chefOnboardingApi.save).mockResolvedValue({ ...saved, version: 3 });
  act(() => button('Correct FSSAI number').props.onPress());
  await act(async () => {
    await button('Save FSSAI number').props.onPress();
  });
  expect(chefOnboardingApi.save).toHaveBeenCalledWith(2, saved.details);
  expect(texts()).toContain('Existing workspace');
  expect(chefOnboardingApi.submit).not.toHaveBeenCalled();
});
test('verified Chef goes straight to the workspace without the FSSAI note', async () => {
  await mount({ ...approved, legacy: true, resumeStep: 'legacy', progress: { fssaiVerified: true } });
  expect(texts()).toContain('Existing workspace');
  expect(button('Add FSSAI number')).toBeUndefined();
});
test('bank statement is one proof slot and Aadhaar requires its back', async () => {
  const bank = {
    ...state,
    resumeStep: 'documents' as const,
    details: { ...state.details!, proofKind: 'BANK_STATEMENT' as const },
  };
  await mount(bank);
  expect(button('Upload Bank statement')).toBeTruthy();
  expect(button('Upload Bank statement back')).toBeUndefined();
  act(() => tree.unmount());
  await mount({ ...bank, details: { ...bank.details!, proofKind: 'AADHAAR' } });
  expect(button('Upload Aadhaar card front')).toBeTruthy();
  expect(button('Upload Aadhaar card back')).toBeTruthy();
});
test('approved Chef keeps workspace access while completing added evidence', async () => {
  await mount({ ...state, application: { id: null, status: 'APPROVED' } });
  act(() => button('View existing Chef workspace').props.onPress());
  expect(
    tree.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Existing workspace'),
  ).toBe(true);
  act(() => button('Continue updated onboarding').props.onPress());
  expect(button('View existing Chef workspace')).toBeTruthy();
});
test('disabled rollout preserves the original mobile flow', async () => {
  await mount({ ...state, enabled: false });
  expect(
    tree.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Existing workspace'),
  ).toBe(true);
});
