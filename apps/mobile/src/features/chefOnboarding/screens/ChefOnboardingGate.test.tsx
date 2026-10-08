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
});
afterEach(() => {
  if (tree) {
    act(() => tree.unmount());
  }
});
test('remount resumes FSSAI and does not expose a final submission action', async () => {
  await mount();
  expect(button('I have FSSAI')).toBeTruthy();
  expect(button('Submit for admin review')).toBeUndefined();
  act(() => tree.unmount());
  await mount();
  expect(button('I have FSSAI')).toBeTruthy();
});
test('saving incomplete FSSAI remains at the same step', async () => {
  await mount();
  jest.mocked(chefOnboardingApi.save).mockResolvedValue(state);
  await act(async () => {
    await button('Save progress for later').props.onPress();
  });
  expect(chefOnboardingApi.save).toHaveBeenCalledWith(1, state.details);
  expect(button('I have FSSAI')).toBeTruthy();
  expect(chefOnboardingApi.submit).not.toHaveBeenCalled();
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
  expect(button('I have FSSAI')).toBeTruthy();
});
test('disabled rollout preserves the original mobile flow', async () => {
  await mount({ ...state, enabled: false });
  expect(
    tree.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Existing workspace'),
  ).toBe(true);
});

test.each([
  ['', 'Enter the 14-digit FSSAI number to continue.'],
  ['12345678901234', 'Upload the FSSAI document or save progress for later.'],
])('incomplete FSSAI %s explains what is missing', async (fssaiNumber, message) => {
  await mount({...state, details: {...state.details!, fssaiNumber}});
  await act(async () => {
    await button('Save and continue').props.onPress();
  });
  expect(tree.root.findAllByType(Text).some(node => node.props.children === message)).toBe(true);
  expect(chefOnboardingApi.save).not.toHaveBeenCalled();
  expect(chefOnboardingApi.submit).not.toHaveBeenCalled();
});
