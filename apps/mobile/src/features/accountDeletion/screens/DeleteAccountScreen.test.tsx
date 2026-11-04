import React from 'react';
import {Text, View} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {sessionManager} from '../../auth/api/sessionManager';
import {deferred, screenQueries} from '../../chefProfile/testing/screenTestKit';
import {accountDeletionApi} from '../api/accountDeletionApi';
import {deletionCopy} from '../domain/deletionCopy';
import type {AppMode, DeletionView} from '../domain/deletionTypes';
import {accountDeletionQueryKey} from '../query/accountDeletionQueryKey';
import {ChefDeleteAccountScreen} from './ChefDeleteAccountScreen';
import {CustomerDeleteAccountScreen} from './CustomerDeleteAccountScreen';
import {DeleteAccountScreen} from './DeleteAccountScreen';

jest.setTimeout(20_000);

let mockRoles: string[];
const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockKeep = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({auth: {identity: {id: 'user-1', roles: mockRoles}}}),
}));
jest.mock('../api/accountDeletionApi', () => ({
  accountDeletionApi: {getLatest: jest.fn(), request: jest.fn()},
}));
jest.mock('../../auth/api/sessionManager', () => ({sessionManager: {refresh: jest.fn()}}));
jest.mock('../state/AccountDeletionProvider', () => ({
  useAccountDeletion: () => ({pending: null, keep: mockKeep, keeping: false, notice: null}),
}));

const getLatest = accountDeletionApi.getLatest as jest.Mock;
const request = accountDeletionApi.request as jest.Mock;
const refresh = sessionManager.refresh as jest.Mock;

const sent: DeletionView = {
  requestId: 'request-1',
  scope: 'CHEF',
  status: 'PENDING_REVIEW',
  requestedAt: '2026-11-05T12:00:00Z',
  dueAt: null,
  reviewNote: null,
};
const open = (overrides: Partial<DeletionView>): DeletionView => ({...sent, ...overrides});

function Scaffold({title, children, footer}: {title: string; children: React.ReactNode; footer?: React.ReactNode}) {
  return (
    <View>
      <Text>{title}</Text>
      {children}
      {footer}
    </View>
  );
}

let queryClient: QueryClient;
let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount(mode: AppMode, screen: React.ReactElement = <DeleteAccountScreen mode={mode} Scaffold={Scaffold} />) {
  await act(async () => {
    tree = renderer.create(<QueryClientProvider client={queryClient}>{screen}</QueryClientProvider>);
  });
  // react-query hands its result to React on the next timer tick.
  await ui.settle();
}

const isDisabled = (label: string) => ui.byLabel(label)!.props.disabled === true;

/** The sheet's red button. */
const sendFromSheet = (label: string) => ui.pressLast(label);

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Noon UTC on 5 Nov 2026: 30 days on is 5 Dec in every time zone from UTC-11 to UTC+11.
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-05T12:00:00Z'));
    queryClient = new QueryClient();
    mockRoles = ['CUSTOMER'];
    getLatest.mockResolvedValue(null);
    request.mockResolvedValue(sent);
    refresh.mockResolvedValue(null);
    mockKeep.mockResolvedValue('kept');
  });
  afterEach(() => {
    act(() => tree.unmount());
    queryClient.clear();
    jest.restoreAllMocks();
  });

  describe('customer-only account', () => {
    it('skips the chooser and shows the date, what goes and what is kept', async () => {
      await mount('CUSTOMER');
      expect(ui.has('Deleted on 5 Dec 2026')).toBe(true);
      expect(ui.has(deletionCopy.customerSummary.dateBody)).toBe(true);
      expect(ui.has("Referral credits you haven't used")).toBe(true);
      expect(ui.has('Your profile, name, phone number and email')).toBe(true);
      expect(ui.has(deletionCopy.customerSummary.keptTitle)).toBe(true);
      expect(ui.has('Until 5 Dec')).toBe(true);
      deletionCopy.customerSummary.until.forEach(line => expect(ui.has(line)).toBe(true));
      expect(ui.has('After 5 Dec you can sign up again with the same phone number, as a new account.')).toBe(true);
      expect(ui.has(deletionCopy.customerSummary.chefSideStays)).toBe(false);
      expect(ui.has(deletionCopy.chooser.title)).toBe(false);
    });

    it('confirms in a sheet and sends the whole account', async () => {
      await mount('CUSTOMER');
      await ui.press('Delete my account');
      expect(ui.has('Delete your account on 5 Dec?')).toBe(true);
      expect(ui.has(deletionCopy.confirm.customerAllBody)).toBe(true);
      expect(ui.has('New orders pause today. Changed your mind? Tap Keep my account any time before 5 Dec.')).toBe(true);
      expect(request).not.toHaveBeenCalled();

      await sendFromSheet('Delete my account');

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('ALL');
    });

    it('closes the sheet on Cancel without sending', async () => {
      await mount('CUSTOMER');
      await ui.press('Delete my account');
      await ui.press('Cancel');
      expect(ui.has('Delete your account on 5 Dec?')).toBe(false);
      expect(request).not.toHaveBeenCalled();
    });

    it('sends the customer side for a customer who is also a rider, with no stay note', async () => {
      mockRoles = ['CUSTOMER', 'RIDER'];
      await mount('CUSTOMER');
      expect(ui.has(deletionCopy.chooser.title)).toBe(false);
      expect(ui.has('Your customer profile')).toBe(true);
      expect(ui.has(deletionCopy.customerSummary.signUpAgain('5 Dec'))).toBe(false);
      expect(ui.has(deletionCopy.customerSummary.chefSideStays)).toBe(false);
      await ui.press('Delete my account');
      expect(ui.has('Delete your customer side on 5 Dec?')).toBe(true);
      // No chef side here, so the sheet must not say one stays.
      expect(ui.has(deletionCopy.confirm.customerSideBodyNoChef)).toBe(true);
      expect(ui.has(deletionCopy.confirm.customerSideBody)).toBe(false);
      await sendFromSheet('Delete my account');
      expect(request).toHaveBeenCalledWith('CUSTOMER');
    });
  });

  describe('chef mode', () => {
    beforeEach(() => {
      mockRoles = ['CUSTOMER', 'CHEF'];
    });

    it('offers the two choices with nothing picked, and Continue waits for one', async () => {
      await mount('CHEF');
      expect(ui.has(deletionCopy.chooser.title)).toBe(true);
      expect(ui.has('Only my chef side')).toBe(true);
      expect(ui.has('My whole account')).toBe(true);
      expect(ui.has(deletionCopy.chooser.info)).toBe(true);
      expect(ui.byLabel('Only my chef side')!.props.accessibilityState.checked).toBe(false);
      expect(ui.byLabel('My whole account')!.props.accessibilityState.checked).toBe(false);
      expect(isDisabled('Continue')).toBe(true);

      await ui.press('Only my chef side');

      expect(ui.byLabel('Only my chef side')!.props.accessibilityState.checked).toBe(true);
      expect(isDisabled('Continue')).toBe(false);
    });

    it('sends only the chef side after the summary and the sheet', async () => {
      await mount('CHEF');
      await ui.press('Only my chef side');
      await ui.press('Continue');

      expect(ui.has('Delete my chef side')).toBe(true);
      expect(ui.has(deletionCopy.chefSummary.steps[0].title)).toBe(true);
      expect(ui.has(deletionCopy.chefSummary.lastStepSide)).toBe(true);
      deletionCopy.chefSummary.goes.forEach(line => expect(ui.has(line)).toBe(true));
      expect(ui.has(deletionCopy.chefSummary.keptTitle)).toBe(true);
      expect(ui.has(deletionCopy.chefSummary.customerSideStays)).toBe(true);
      expect(ui.has(deletionCopy.chefSummary.lastStepAll)).toBe(false);

      await ui.press('Send delete request');
      expect(ui.has('Close your kitchen and send the request?')).toBe(true);
      expect(ui.has(deletionCopy.confirm.chefSideBody)).toBe(true);
      expect(request).not.toHaveBeenCalled();

      await sendFromSheet('Close kitchen and send');

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('CHEF');
      expect(request).not.toHaveBeenCalledWith('ALL');
    });

    it('sends the whole account only when that was picked, with both lists and both kept lines', async () => {
      await mount('CHEF');
      await ui.press('My whole account');
      await ui.press('Continue');

      expect(ui.has('Delete my account')).toBe(true);
      expect(ui.has(deletionCopy.chefSummary.lastStepAll)).toBe(true);
      deletionCopy.chefSummary.goes.forEach(line => expect(ui.has(line)).toBe(true));
      deletionCopy.customerSummary.goesAll.forEach(line => expect(ui.has(line)).toBe(true));
      expect(ui.has(deletionCopy.chefSummary.keptLabel)).toBe(true);
      expect(ui.has(deletionCopy.customerSummary.keptLabel)).toBe(true);
      expect(ui.has(deletionCopy.chefSummary.customerSideStays)).toBe(false);
      expect(ui.has(deletionCopy.customerSummary.chefSideStays)).toBe(false);

      await ui.press('Send delete request');
      expect(ui.has(deletionCopy.confirm.chefAllBody)).toBe(true);
      await sendFromSheet('Close kitchen and send');

      expect(request).toHaveBeenCalledWith('ALL');
    });

    it('sends the request once when the red button is tapped twice', async () => {
      request.mockReturnValue(new Promise(() => undefined));
      await mount('CHEF');
      await ui.press('Only my chef side');
      await ui.press('Continue');
      await ui.press('Send delete request');

      await act(async () => {
        const button = ui.byLabel('Close kitchen and send')!;
        button.props.onPress();
        button.props.onPress();
      });

      expect(request).toHaveBeenCalledTimes(1);
    });

    it('does not say the customer side stays when the chef has no customer role', async () => {
      mockRoles = ['CHEF'];
      await mount('CHEF');
      await ui.press('Only my chef side');
      await ui.press('Continue');
      expect(ui.has(deletionCopy.chefSummary.lastStepSide)).toBe(true);
      expect(ui.has(deletionCopy.chefSummary.customerSideStays)).toBe(false);
    });

    it('shows one choice and the rider note for a rider who is also a chef', async () => {
      mockRoles = ['CUSTOMER', 'CHEF', 'RIDER'];
      await mount('CHEF');
      expect(ui.has('Only my chef side')).toBe(true);
      expect(ui.has('My whole account')).toBe(false);
      expect(ui.has('To delete your rider account, contact Craves.')).toBe(true);
    });
  });

  describe('customer mode of an account with a chef side', () => {
    beforeEach(() => {
      mockRoles = ['CUSTOMER', 'CHEF'];
    });

    it('offers the customer side or the whole account, and the customer side says the chef side stays', async () => {
      await mount('CUSTOMER');
      expect(ui.has('Only my customer side')).toBe(true);
      expect(ui.has('My whole account')).toBe(true);
      await ui.press('Only my customer side');
      await ui.press('Continue');

      deletionCopy.customerSummary.goesSide.forEach(line => expect(ui.has(line)).toBe(true));
      expect(ui.has('Your profile, name, phone number and email')).toBe(false);
      expect(ui.has("Referral credits you haven't used")).toBe(false);
      expect(ui.has(deletionCopy.customerSummary.signUpAgain('5 Dec'))).toBe(false);
      expect(ui.has(deletionCopy.customerSummary.chefSideStays)).toBe(true);
      expect(ui.has('Deleted on 5 Dec 2026')).toBe(true);

      await ui.press('Delete my account');
      expect(ui.has(deletionCopy.confirm.customerSideBody)).toBe(true);
      await sendFromSheet('Delete my account');
      expect(request).toHaveBeenCalledWith('CUSTOMER');
    });
  });

  describe('after sending', () => {
    async function sendAsChef() {
      mockRoles = ['CUSTOMER', 'CHEF'];
      await mount('CHEF');
      await ui.press('Only my chef side');
      await ui.press('Continue');
      await ui.press('Send delete request');
      await sendFromSheet('Close kitchen and send');
    }

    it('shows the request state from the answer, without a second status call, then refreshes the session', async () => {
      await sendAsChef();
      expect(ui.has('Request sent')).toBe(true);
      expect(ui.has('Close your kitchen and send the request?')).toBe(false);
      expect(getLatest).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(accountDeletionQueryKey('user-1'))).toEqual(sent);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('still shows Request sent when the session refresh fails on the network', async () => {
      refresh.mockRejectedValue(new Error('Network Error'));
      await sendAsChef();
      expect(ui.has('Request sent')).toBe(true);
    });

    it('says deleting is not available yet on a 503', async () => {
      request.mockRejectedValue(new AppApiError('ACCOUNT_DELETION_NOT_ENABLED', 'Off', 503));
      await sendAsChef();
      expect(ui.has("Deleting an account isn't available yet. Try again later.")).toBe(true);
      expect(ui.has('Close your kitchen and send the request?')).toBe(true);
      expect(refresh).not.toHaveBeenCalled();
      expect(isDisabled('Close kitchen and send')).toBe(false);
    });

    it('says the account cannot ask for that scope on a 409 scope-not-allowed', async () => {
      request.mockRejectedValue(new AppApiError('ACCOUNT_DELETION_SCOPE_NOT_ALLOWED', 'No', 409));
      await sendAsChef();
      expect(ui.has("This account can't ask for that. Contact Craves support.")).toBe(true);
    });

    it('says it was not sent on any other failure, and a second try can send', async () => {
      request.mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'Offline'));
      await sendAsChef();
      expect(ui.has("Your request wasn't sent. Try again.")).toBe(true);

      await sendFromSheet('Close kitchen and send');

      expect(request).toHaveBeenCalledTimes(2);
      expect(ui.has('Request sent')).toBe(true);
    });

    it('keeps the request state when a status call that began earlier answers after the POST', async () => {
      await mount('CUSTOMER');
      const late = deferred<null>();
      getLatest.mockReturnValueOnce(late.promise);
      await act(async () => {
        queryClient.refetchQueries({queryKey: accountDeletionQueryKey('user-1')}).catch(() => undefined);
      });

      await ui.press('Delete my account');
      await sendFromSheet('Delete my account');
      expect(ui.has('Request sent')).toBe(true);

      await act(async () => late.resolve(null));
      await ui.settle();

      expect(ui.has('Request sent')).toBe(true);
      expect(ui.has('Deleted on 5 Dec 2026')).toBe(false);
    });

    it('shows the open request when one was already made', async () => {
      request.mockRejectedValue(new AppApiError('ACCOUNT_DELETION_ALREADY_REQUESTED', 'Open', 409));
      getLatest.mockResolvedValueOnce(null).mockResolvedValue(open({scope: 'ALL', status: 'SCHEDULED', dueAt: '2026-12-05T08:00:00Z'}));
      await sendAsChef();
      await ui.settle();
      expect(getLatest).toHaveBeenCalledTimes(2);
      expect(ui.has('Your account will be deleted on 5 Dec 2026')).toBe(true);
      expect(ui.anyText(/wasn't sent/)).toBe(false);
    });

    it('does not say it was not sent when the answer cannot be read: it asks the server and refreshes', async () => {
      request.mockRejectedValue(new AppApiError('ACCOUNT_DELETION_INVALID_RESPONSE', 'Unreadable'));
      getLatest.mockResolvedValueOnce(null).mockResolvedValue(sent);
      await sendAsChef();
      await ui.settle();
      expect(ui.anyText(/wasn't sent|couldn't read/)).toBe(false);
      expect(getLatest).toHaveBeenCalledTimes(2);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(ui.has('Request sent')).toBe(true);
    });
  });

  describe('a request already on record', () => {
    it.each([
      ['customer', 'CUSTOMER', ['CUSTOMER']],
      ['chef', 'CHEF', ['CUSTOMER', 'CHEF']],
    ] as const)('%s: a failed status call shows a retry, not the start flow', async (_name, mode, roles) => {
      mockRoles = [...roles];
      getLatest.mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'Offline'));
      await mount(mode);
      expect(ui.has(deletionCopy.loadError.title)).toBe(true);
      expect(ui.byLabel('Delete my account')).toBeUndefined();
      expect(ui.has('Deleted on 5 Dec 2026')).toBe(false);
      expect(ui.has(deletionCopy.chooser.title)).toBe(false);
      expect(ui.byLabel('Continue')).toBeUndefined();

      getLatest.mockResolvedValue(open({status: 'SCHEDULED', scope: 'ALL', dueAt: '2026-12-05T08:00:00Z'}));
      await ui.press(deletionCopy.loadError.retry);
      await ui.settle();

      expect(getLatest).toHaveBeenCalledTimes(2);
      expect(ui.has(deletionCopy.loadError.title)).toBe(false);
      expect(ui.has('Your account will be deleted on 5 Dec 2026')).toBe(true);
    });

    it('shows nothing of the start flow while the status loads', async () => {
      getLatest.mockReturnValue(new Promise(() => undefined));
      await mount('CUSTOMER');
      expect(ui.byLabel('Delete my account')).toBeUndefined();
      expect(ui.has('Deleted on 5 Dec 2026')).toBe(false);
    });

    it.each([
      ['PENDING_REVIEW', {status: 'PENDING_REVIEW'}, 'Request sent'],
      ['SCHEDULED', {status: 'SCHEDULED', scope: 'CHEF', dueAt: '2026-12-05T08:00:00Z'}, 'Your chef side will be deleted on 5 Dec 2026'],
      ['WAITING_ON_OPEN_ITEMS', {status: 'WAITING_ON_OPEN_ITEMS'}, 'Deleting once open items are settled'],
      ['ERASING', {status: 'ERASING', scope: 'CUSTOMER'}, 'Your customer side is being deleted'],
      ['REJECTED', {status: 'REJECTED', scope: 'ALL', reviewNote: 'Open payout'}, "Craves couldn't delete your account yet"],
    ] as const)('shows the %s state instead of the start flow', async (_name, overrides, title) => {
      getLatest.mockResolvedValue(open(overrides as Partial<DeletionView>));
      await mount('CUSTOMER');
      expect(ui.has(title)).toBe(true);
      expect(ui.has('Deleted on 5 Dec 2026')).toBe(false);
      expect(ui.byLabel('Delete my account')).toBeUndefined();
    });

    describe('the buttons on a state', () => {
      const declined = {requestId: 'declined-1', status: 'REJECTED', scope: 'ALL', reviewNote: 'Open payout'} as const;

      it('Ask again shows the start flow although the latest request is still declined', async () => {
        getLatest.mockResolvedValue(open(declined));
        await mount('CUSTOMER');
        expect(ui.has("Craves couldn't delete your account yet")).toBe(true);
        expect(ui.has('Open payout')).toBe(true);

        await ui.press('Ask again');

        expect(ui.has('Deleted on 5 Dec 2026')).toBe(true);
        expect(ui.has("Craves couldn't delete your account yet")).toBe(false);
        expect(getLatest).toHaveBeenCalledTimes(1);
      });

      it('sending again from there shows the new request, not the old decline', async () => {
        getLatest.mockResolvedValue(open(declined));
        await mount('CUSTOMER');
        await ui.press('Ask again');
        await ui.press('Delete my account');
        await sendFromSheet('Delete my account');
        expect(request).toHaveBeenCalledWith('ALL');
        expect(ui.has('Request sent')).toBe(true);
        expect(ui.has("Craves couldn't delete your account yet")).toBe(false);
      });

      it('a second decline starts from the decline again, not from the start flow', async () => {
        getLatest.mockResolvedValue(open(declined));
        await mount('CUSTOMER');
        await ui.press('Ask again');
        await act(async () => {
          queryClient.setQueryData(accountDeletionQueryKey('user-1'), open({...declined, requestId: 'declined-2', reviewNote: 'Still open'}));
        });
        await ui.settle();
        expect(ui.has('Still open')).toBe(true);
        expect(ui.has('Deleted on 5 Dec 2026')).toBe(false);
      });

      it.each([
        ['customer', 'CUSTOMER', ['CUSTOMER'], 'CustomerSettingsSupport'],
        ['chef', 'CHEF', ['CUSTOMER', 'CHEF'], 'ChefSupport'],
      ] as const)('%s: Contact support opens its support page', async (_name, mode, roles, route) => {
        mockRoles = [...roles];
        getLatest.mockResolvedValue(open(declined));
        await mount(mode);
        await ui.press('Contact support');
        expect(mockNavigate).toHaveBeenCalledWith(route);
      });

      it('Keep my account on a scheduled request shows the start flow once the screen has looked again', async () => {
        getLatest.mockResolvedValueOnce(open({status: 'SCHEDULED', scope: 'ALL', dueAt: '2026-12-05T08:00:00Z'})).mockResolvedValue(open({status: 'CANCELLED', scope: 'ALL'}));
        await mount('CUSTOMER');
        expect(ui.has('Your account will be deleted on 5 Dec 2026')).toBe(true);

        await ui.press('Keep my account');
        await ui.settle();

        expect(mockKeep).toHaveBeenCalledTimes(1);
        expect(getLatest).toHaveBeenCalledTimes(2);
        expect(ui.has('Deleted on 5 Dec 2026')).toBe(true);
        expect(ui.has('Your account will be deleted on 5 Dec 2026')).toBe(false);
      });

      it('Keep my account that failed stays on the state and does not look again', async () => {
        mockKeep.mockResolvedValue('failed');
        getLatest.mockResolvedValue(open({status: 'SCHEDULED', scope: 'ALL', dueAt: '2026-12-05T08:00:00Z'}));
        await mount('CUSTOMER');
        await ui.press('Keep my account');
        await ui.settle();
        expect(getLatest).toHaveBeenCalledTimes(1);
        expect(ui.has('Your account will be deleted on 5 Dec 2026')).toBe(true);
      });
    });

    it.each(['CANCELLED', 'COMPLETED'] as const)('starts again after a %s request', async status => {
      getLatest.mockResolvedValue(open({status}));
      await mount('CUSTOMER');
      expect(ui.has('Deleted on 5 Dec 2026')).toBe(true);
    });
  });

  describe('the two scaffolds', () => {
    it('customer: summary in the settings scaffold with the button in its footer', async () => {
      await mount('CUSTOMER', <CustomerDeleteAccountScreen />);
      expect(ui.has('Delete account')).toBe(true);
      expect(ui.has('Deleted on 5 Dec 2026')).toBe(true);
      expect(ui.byLabel('Delete my account')).toBeDefined();
      act(() => ui.byLabel('Back')!.props.onPress());
      expect(mockGoBack).toHaveBeenCalled();
    });

    it('chef: chooser in ChefScreen, and its Continue button sits in the footer', async () => {
      mockRoles = ['CUSTOMER', 'CHEF'];
      await mount('CHEF', <ChefDeleteAccountScreen />);
      expect(ui.has(deletionCopy.chooser.title)).toBe(true);
      expect(ui.byLabel('Continue')).toBeDefined();
      act(() => ui.byLabel('Go back')!.props.onPress());
      expect(mockGoBack).toHaveBeenCalled();
    });
  });
});
