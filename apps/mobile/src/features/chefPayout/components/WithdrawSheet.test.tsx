import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefBankStatus} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import {chefPayoutApi} from '../api/chefPayoutApi';
import {useChefWithdrawal} from '../state/useChefWithdrawal';
import {WithdrawSheet} from './WithdrawSheet';

jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})}));
jest.mock('../api/chefPayoutApi', () => ({
  ...jest.requireActual('../api/chefPayoutApi'),
  chefPayoutApi: {requestWithdrawal: jest.fn()},
}));

const request = chefPayoutApi.requestWithdrawal as jest.Mock;
const verifiedBank = {
  state: 'VERIFIED',
  lastFour: '4521',
  bankName: 'State Bank of India',
  accountHolderName: 'Relangi M.',
} as ChefBankStatus;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const onSettled = jest.fn(async () => undefined);
const onAddBank = jest.fn();
let latest: ReturnType<typeof useChefWithdrawal>;

function Harness({bank}: {bank: ChefBankStatus | null}) {
  latest = useChefWithdrawal({onSettled});
  return (
    <>
      <WithdrawSheet
        amount="3450.00"
        bank={bank}
        busy={latest.busy}
        locked={latest.uncertain}
        onAddBank={onAddBank}
        onClose={() => undefined}
        onConfirm={() => latest.start('3450.00')}
        visible
      />
      <Text>{`notice:${latest.notice?.kind ?? 'none'}`}</Text>
    </>
  );
}

let tree: renderer.ReactTestRenderer;
const textOf = (node: ReactTestInstance): string =>
  React.Children.toArray(node.props.children)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const button = (label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];

function mount(bank: ChefBankStatus | null = verifiedBank) {
  act(() => {
    tree = renderer.create(<Harness bank={bank} />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  request.mockResolvedValue({id: 'payout'});
});
afterEach(() => act(() => tree.unmount()));

describe('WithdrawSheet', () => {
  it('shows the amount, where it goes and the one-a-day note', () => {
    mount();
    expect(allText()).toEqual(
      expect.arrayContaining([
        'Withdraw to your bank',
        '₹3,450.00',
        'Your full available balance',
        'State Bank of India',
        'Account ••4521 · Relangi M.',
        'Verified',
        "You can withdraw once a day. We'll notify you when the money reaches your bank.",
        'Withdraw ₹3,450.00',
      ]),
    );
  });

  it('sends one request even when the button is pressed twice in a row', async () => {
    let finish: (value: unknown) => void = () => undefined;
    request.mockReturnValue(new Promise(resolve => (finish = resolve)));
    mount();
    const press = button('Withdraw ₹3,450.00').props.onPress;
    await act(async () => {
      press();
      press();
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.stringMatching(UUID), '3450.00');
    expect(button('Withdraw ₹3,450.00').props.accessibilityState).toMatchObject({busy: true, disabled: true});
    await act(async () => finish({id: 'payout'}));
    expect(allText()).toContain('notice:sent');
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('turns into Add bank account, and sends nothing, when there is no verified bank', async () => {
    mount({state: 'NOT_SUBMITTED'} as ChefBankStatus);
    expect(button('Withdraw ₹3,450.00')).toBeUndefined();
    await act(async () => button('Add bank account').props.onPress());
    expect(onAddBank).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('after an unconfirmed answer, never asks again with a new key: it can only replay the same one', async () => {
    request.mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'offline'));
    mount();
    await act(async () => button('Withdraw ₹3,450.00').props.onPress());
    expect(allText()).toContain('notice:uncertain');
    expect(onSettled).not.toHaveBeenCalled();
    expect(button('Withdraw ₹3,450.00').props.accessibilityState).toMatchObject({disabled: true});
    await act(async () => button('Withdraw ₹3,450.00').props.onPress());
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => latest.resolve());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0]);
    expect(allText()).toContain('notice:sent');
  });

  it('after a clear refusal, the next press is a new request', async () => {
    request.mockRejectedValueOnce(new AppApiError('HTTP_409', 'Changed', 409));
    mount();
    await act(async () => button('Withdraw ₹3,450.00').props.onPress());
    expect(allText()).toContain('notice:failed');
    expect(latest.notice).toEqual({kind: 'failed', message: 'Your balance changed. Check the amount and try again.'});
    expect(onSettled).toHaveBeenCalledTimes(1);

    await act(async () => button('Withdraw ₹3,450.00').props.onPress());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).not.toBe(request.mock.calls[0][0]);
  });
});
