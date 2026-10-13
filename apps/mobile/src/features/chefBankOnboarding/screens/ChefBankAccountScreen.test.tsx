import React from 'react';
import {BackHandler, Text, TextInput} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import {ChefScreen} from '../../chefShell/components/ui';
import {chefOnboardingApi} from '../../chefOnboarding/api/chefOnboardingApi';
import {chefBankOnboardingApi, type ChefBankStatus} from '../api/chefBankOnboardingApi';
import {ChefBankAccountScreen} from './ChefBankAccountScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSetBank = jest.fn();
const mockRefetch = jest.fn(async () => undefined);
const mockApplicantRefetch = jest.fn(async () => undefined);
let mockBank: Record<string, unknown>;
let mockApplicant: Record<string, unknown>;
let mockParams: {from?: 'earnings'} | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
  useRoute: () => ({params: mockParams}),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../state/useChefBankStatus', () => ({useChefBankStatus: () => mockBank}));
jest.mock('../state/useChefApplicantName', () => ({useChefApplicantName: () => mockApplicant}));
jest.mock('../api/chefBankOnboardingApi', () => ({
  ...jest.requireActual('../api/chefBankOnboardingApi'),
  chefBankOnboardingApi: {submit: jest.fn()},
}));
jest.mock('../../chefOnboarding/api/chefOnboardingApi', () => ({chefOnboardingApi: {bankBranch: jest.fn()}}));

const submit = chefBankOnboardingApi.submit as jest.Mock;
const bankBranch = chefOnboardingApi.bankBranch as jest.Mock;

const status = (overrides: Partial<ChefBankStatus> = {}): ChefBankStatus => ({
  id: '11111111-1111-4111-8111-111111111111',
  state: 'VERIFIED',
  lastFour: '4521',
  ifsc: 'SBIN0011234',
  bankValidated: true,
  applicationApproved: true,
  automaticActivation: true,
  message: 'Bank validation confirmed',
  updatedAt: '2026-10-01T10:00:00Z',
  accountHolderName: 'Relangi M.',
  bankName: 'State Bank of India',
  branchName: 'KPHB Colony',
  ...overrides,
});
const notSubmitted = () =>
  status({id: null, state: 'NOT_SUBMITTED', lastFour: null, ifsc: null, updatedAt: null, accountHolderName: null, bankName: null, branchName: null});

let tree: renderer.ReactTestRenderer;
const textOf = (node: ReactTestInstance): string =>
  React.Children.toArray(node.props.children)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const hasText = (text: string) => allText().includes(text);
const button = (label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = async (label: string) => {
  const target = button(label);
  if (!target) throw new Error(`No button labelled "${label}"`);
  await act(async () => {
    await target.props.onPress();
  });
};
const consentBox = () =>
  tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function')[0];
const input = (label: string) => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;
const type = async (label: string, value: string) => act(async () => input(label).props.onChangeText(value));
const settle = () =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

function mount() {
  act(() => {
    tree = renderer.create(<ChefBankAccountScreen />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = undefined;
  mockBank = {bank: status(), status: 'success', isFetching: false, refetch: mockRefetch, setBank: mockSetBank};
  mockApplicant = {name: 'Relangi Mavayya', eligible: true, status: 'success', refetch: mockApplicantRefetch};
  bankBranch.mockResolvedValue({bankName: 'State Bank of India', branchName: 'KPHB Colony, Hyderabad'});
  submit.mockResolvedValue(status({state: 'VALIDATING'}));
});
afterEach(() => act(() => tree.unmount()));

describe('ChefBankAccountScreen', () => {
  it('shows a verified account as a card, with no form', () => {
    mount();
    expect(allText()).toEqual(
      expect.arrayContaining([
        'Bank account',
        'Verified',
        'State Bank of India',
        'KPHB Colony branch · SBIN0011234',
        'Account number',
        '•••• •••• 4521',
        'Account holder',
        'Relangi M.',
        'All your payouts go to this account.',
        'Change bank account',
      ]),
    );
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(hasText('Verify and save')).toBe(false);
  });

  it('opens the form from Change bank account, and Back returns to the card first', async () => {
    mount();
    await press('Change bank account');
    expect(hasText('Change bank account')).toBe(true);
    expect(tree.root.findAllByType(TextInput).length).toBeGreaterThan(0);
    await press('Go back');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(mockGoBack).not.toHaveBeenCalled();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('goes back to Earnings when it was opened from there', async () => {
    mockParams = {from: 'earnings'};
    mount();
    await press('Go back');
    expect(mockNavigate).toHaveBeenCalledWith('Earnings');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('shows the form straight away when no account was added', () => {
    mockBank = {...mockBank, bank: notSubmitted()};
    mount();
    expect(hasText('Account holder')).toBe(true);
    expect(input('Account number')).toBeDefined();
    expect(hasText('Must match the name on your application.')).toBe(true);
    expect(button('Verify and save').props.accessibilityState).toMatchObject({disabled: true});
  });

  it('keeps Verify and save off until every field is right, then saves once', async () => {
    mockBank = {...mockBank, bank: notSubmitted()};
    let finish: (value: unknown) => void = () => undefined;
    submit.mockReturnValue(new Promise(resolve => (finish = resolve)));
    mount();

    await type('Account number', '123456789012');
    await type('Re-enter account number', '12345678901');
    expect(button('Verify and save').props.accessibilityState).toMatchObject({disabled: true});
    await type('Re-enter account number', '123456789012');
    expect(hasText('✓ Numbers match')).toBe(true);
    await type('IFSC', 'sbin0011234');
    await settle();
    expect(bankBranch).toHaveBeenCalledWith('SBIN0011234');
    expect(allText()).toEqual(expect.arrayContaining(['State Bank of India', 'KPHB Colony, Hyderabad']));
    expect(button('Verify and save').props.accessibilityState).toMatchObject({disabled: true}); // still needs the tick
    await act(async () => consentBox().props.onPress());
    expect(button('Verify and save').props.accessibilityState).toMatchObject({disabled: false});

    const save = button('Verify and save').props.onPress;
    await act(async () => {
      save();
      save();
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toMatchObject({
      accountHolderName: 'Relangi Mavayya',
      accountNumber: '123456789012',
      accountNumberConfirmation: '123456789012',
      ifsc: 'SBIN0011234',
      expectedCurrentId: null,
      consent: true,
    });
    expect(hasText('Checking your account…')).toBe(true);
    await act(async () => finish(status({state: 'VALIDATING'})));
    expect(mockSetBank).toHaveBeenCalledWith(expect.objectContaining({state: 'VALIDATING'}));
  });

  it('tells a mismatch in plain words', async () => {
    mockBank = {...mockBank, bank: notSubmitted()};
    mount();
    await type('Account number', '123456789012');
    await type('Re-enter account number', '123456789013');
    expect(hasText("The account numbers don't match.")).toBe(true);
  });

  it('shows or hides the account number with the eye', async () => {
    mockBank = {...mockBank, bank: notSubmitted()};
    mount();
    expect(input('Account number').props.secureTextEntry).toBe(true);
    await press('Show account number');
    expect(input('Account number').props.secureTextEntry).toBe(false);
  });

  it('says plainly when the IFSC is not found', async () => {
    mockBank = {...mockBank, bank: notSubmitted()};
    bankBranch.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    mount();
    await type('IFSC', 'SBIN0011234');
    await settle();
    expect(hasText('IFSC not found. Check your bank document.')).toBe(true);
  });

  it('shows Checking your account, with no form, while the bank looks at a new account', () => {
    mockBank = {...mockBank, bank: status({state: 'WAITING_APPROVAL'})};
    mount();
    expect(hasText('Checking your account')).toBe(true);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('explains a refused account in plain words and offers the form again', () => {
    mockBank = {...mockBank, bank: status({state: 'NAME_MISMATCH'})};
    mount();
    expect(hasText("The name on this account doesn't match your application. Use an account in your own name.")).toBe(true);
    expect(allText().some(text => /NAME_MISMATCH|WAITING|APPROVAL|_/.test(text))).toBe(false);
    expect(input('Account number')).toBeDefined();
  });

  it('explains when bank accounts cannot be added right now, instead of a dead form', () => {
    mockBank = {...mockBank, bank: status({state: 'NOT_SUBMITTED', id: null, automaticActivation: false})};
    mount();
    expect(hasText("Bank accounts can't be added right now. Please try again later.")).toBe(true);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('waits for the bank instead of flashing an empty form, and offers a retry on failure', async () => {
    mockBank = {...mockBank, bank: null, status: 'pending'};
    mount();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    act(() => tree.unmount());
    mockBank = {...mockBank, bank: null, status: 'error'};
    mount();
    expect(hasText("We couldn't load your bank account.")).toBe(true);
    await press('Try again');
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps Verify and save in the sticky dock under the form, and shows no dock on the verified card', () => {
    mockBank = {...mockBank, bank: notSubmitted()};
    mount();
    const dock = tree.root.findByType(ChefScreen).props.footer;
    expect(dock).toBeTruthy();
    act(() => tree.unmount());
    mockBank = {...mockBank, bank: status()};
    mount();
    expect(tree.root.findByType(ChefScreen).props.footer).toBeFalsy();
  });

  it("does not say the application is unfinished when the application could not be read: it offers a retry", async () => {
    mockBank = {...mockBank, bank: notSubmitted()};
    mockApplicant = {name: '', eligible: false, status: 'error', refetch: mockApplicantRefetch};
    mount();
    expect(hasText("We couldn't load your details.")).toBe(true);
    expect(allText().some(text => text.includes('Finish your chef application'))).toBe(false);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    await press('Try again');
    expect(mockApplicantRefetch).toHaveBeenCalledTimes(1);
  });

  it('still says to finish the application when it was read and is not ready', () => {
    mockBank = {...mockBank, bank: notSubmitted()};
    mockApplicant = {name: '', eligible: false, status: 'success', refetch: mockApplicantRefetch};
    mount();
    expect(hasText('Finish your chef application first. Then you can add a bank account.')).toBe(true);
  });

  describe("the phone's Back button", () => {
    let listeners: (() => boolean | null | undefined)[];
    let spy: jest.SpyInstance;
    const phoneBack = () =>
      act(() => {
        listeners[listeners.length - 1]();
      });
    beforeEach(() => {
      listeners = [];
      spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_: string, listener: () => boolean) => {
        listeners.push(listener);
        return {remove: () => listeners.splice(listeners.indexOf(listener), 1)};
      }) as never);
    });
    afterEach(() => spy.mockRestore());

    it('first closes the Change bank account form, then goes back', async () => {
      mount();
      await press('Change bank account');
      expect(tree.root.findAllByType(TextInput).length).toBeGreaterThan(0);
      phoneBack();
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
      expect(mockGoBack).not.toHaveBeenCalled();
      phoneBack();
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('asks before throwing away what was typed, and keeps it on Keep editing', async () => {
      mount();
      await press('Change bank account');
      await type('Account number', '123456789012');
      phoneBack();
      expect(hasText('Discard changes?')).toBe(true);
      expect(tree.root.findAllByType(TextInput).length).toBeGreaterThan(0);
      await press('Keep editing');
      expect(hasText('Discard changes?')).toBe(false);
      expect(input('Account number').props.value).toBe('123456789012');

      phoneBack();
      await press('Discard');
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
      expect(mockGoBack).not.toHaveBeenCalled();
      await press('Change bank account');
      expect(input('Account number').props.value).toBe(''); // what was typed is gone
    });

    it('asks the same way from the arrow, and when the form was the first thing shown', async () => {
      mockBank = {...mockBank, bank: notSubmitted()};
      mount();
      await type('IFSC', 'SBIN');
      await press('Go back');
      expect(hasText('Discard changes?')).toBe(true);
      expect(mockGoBack).not.toHaveBeenCalled();
      await press('Discard');
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('goes back to Earnings when it was opened from there', () => {
      mockParams = {from: 'earnings'};
      mount();
      phoneBack();
      expect(mockNavigate).toHaveBeenCalledWith('Earnings');
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });
});
