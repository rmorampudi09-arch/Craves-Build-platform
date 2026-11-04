import React from 'react';
import {Text, View} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {screenQueries} from '../../chefProfile/testing/screenTestKit';
import {deletionCopy} from '../domain/deletionCopy';
import {entryStateFor} from '../domain/deletionModel';
import type {DeletionScope, DeletionStatus, DeletionView} from '../domain/deletionTypes';
import {DeletionStateView} from './DeletionStateView';

jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));

const mockKeep = jest.fn();
let mockKeeping: boolean;
jest.mock('../state/AccountDeletionProvider', () => ({
  useAccountDeletion: () => ({pending: null, keep: mockKeep, keeping: mockKeeping, notice: null}),
}));

const {state: copy} = deletionCopy;
// Noon UTC: the same calendar day in every time zone from UTC-11 to UTC+11.
const REQUESTED = '2026-11-05T12:00:00Z';
const DUE = '2026-12-05T12:00:00Z';

const view = (status: DeletionStatus, scope: DeletionScope, overrides: Partial<DeletionView> = {}): DeletionView => ({
  requestId: 'request-1',
  scope,
  status,
  requestedAt: REQUESTED,
  dueAt: null,
  reviewNote: null,
  ...overrides,
});

function Scaffold({title, children, footer}: {title: string; children: React.ReactNode; footer?: React.ReactNode}) {
  return (
    <View>
      <Text>{title}</Text>
      {children}
      {footer}
    </View>
  );
}

const onAskAgain = jest.fn();
const onContactSupport = jest.fn();
const onKept = jest.fn();

let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

function mount(latest: DeletionView, roles: readonly string[] = ['CUSTOMER', 'CHEF']) {
  const state = entryStateFor(latest);
  if (state.kind === 'start') {
    throw new Error('A start state has no state view');
  }
  act(() => {
    tree = renderer.create(
      <DeletionStateView
        Scaffold={Scaffold}
        onAskAgain={onAskAgain}
        onContactSupport={onContactSupport}
        onKept={onKept}
        roles={roles}
        state={state}
        title="Delete account"
      />,
    );
  });
}

const hasButtons = () => tree.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');

describe('DeletionStateView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKeeping = false;
    mockKeep.mockResolvedValue('kept');
  });
  afterEach(() => act(() => tree.unmount()));

  describe('in review', () => {
    it('says the request is sent, with its four steps and the date it was asked', () => {
      mount(view('PENDING_REVIEW', 'CHEF'));
      expect(ui.has(copy.inReviewTag)).toBe(true);
      expect(ui.has(copy.inReviewTitle)).toBe(true);
      expect(ui.has(copy.inReviewBody)).toBe(true);
      expect(ui.has(copy.inReviewSteps[0])).toBe(true);
      expect(ui.has('5 Nov')).toBe(true);
      expect(ui.has(copy.inReviewSteps[1])).toBe(true);
      expect(ui.has(copy.inReviewStepBodies[1])).toBe(true);
      expect(ui.has(copy.inReviewSteps[2])).toBe(true);
      expect(ui.has(copy.inReviewStepBodies[2])).toBe(true);
      expect(ui.has(copy.inReviewLastSide)).toBe(true);
      expect(ui.has(copy.inReviewLastAll)).toBe(false);
    });

    it('ends with the account for the whole account', () => {
      mount(view('PENDING_REVIEW', 'ALL'));
      expect(ui.has(copy.inReviewTitle)).toBe(true);
      expect(ui.has(copy.inReviewLastAll)).toBe(true);
      expect(ui.has(copy.inReviewLastSide)).toBe(false);
    });

    it('offers Keep my account and says the kitchen reopens, when a chef side is deleted', () => {
      mount(view('PENDING_REVIEW', 'CHEF'));
      expect(ui.byLabel(deletionCopy.banner.keep)).toBeDefined();
      expect(ui.has(copy.keepNoteKitchen)).toBe(true);
    });

    it('says the kitchen reopens for the whole account of a chef, not of a customer-only account', () => {
      mount(view('PENDING_REVIEW', 'ALL'), ['CUSTOMER', 'CHEF']);
      expect(ui.has(copy.keepNoteKitchen)).toBe(true);
      act(() => tree.unmount());
      mount(view('PENDING_REVIEW', 'ALL'), ['CUSTOMER']);
      expect(ui.byLabel(deletionCopy.banner.keep)).toBeDefined();
      expect(ui.has(copy.keepNoteKitchen)).toBe(false);
    });
  });

  describe('scheduled', () => {
    it.each([
      ['CHEF', 'Your chef side will be deleted on 5 Dec 2026', 'Chef side deleted'],
      ['ALL', 'Your account will be deleted on 5 Dec 2026', 'Account deleted'],
      ['CUSTOMER', 'Your customer side will be deleted on 5 Dec 2026', 'Customer side deleted'],
    ] as const)('%s: the date in the title, the three steps with their dates', (scope, title, last) => {
      mount(view('SCHEDULED', scope, {dueAt: DUE}));
      expect(ui.has(copy.scheduledTag)).toBe(true);
      expect(ui.has(title)).toBe(true);
      expect(ui.has(copy.scheduledBody[scope])).toBe(true);
      expect(ui.has(copy.stepAsked)).toBe(true);
      expect(ui.has('5 Nov')).toBe(true);
      expect(ui.has(copy.stepReminder)).toBe(true);
      // A week before the day.
      expect(ui.has(copy.stepReminderBody('28 Nov'))).toBe(true);
      expect(ui.has(last)).toBe(true);
      expect(ui.has('5 Dec')).toBe(true);
    });

    it('offers Keep my account, with no kitchen note', () => {
      mount(view('SCHEDULED', 'CHEF', {dueAt: DUE}));
      expect(ui.byLabel(deletionCopy.banner.keep)).toBeDefined();
      expect(ui.has(copy.keepNoteKitchen)).toBe(false);
    });

    it('keeps the account through the provider, then lets the screen look again', async () => {
      mount(view('SCHEDULED', 'ALL', {dueAt: DUE}));
      await ui.press(deletionCopy.banner.keep);
      expect(mockKeep).toHaveBeenCalledTimes(1);
      expect(onKept).toHaveBeenCalledTimes(1);
    });

    it('does not look again when keeping failed', async () => {
      mockKeep.mockResolvedValue('failed');
      mount(view('SCHEDULED', 'ALL', {dueAt: DUE}));
      await ui.press(deletionCopy.banner.keep);
      expect(mockKeep).toHaveBeenCalledTimes(1);
      expect(onKept).not.toHaveBeenCalled();
    });

    it('looks again when deletion had already started, so the screen shows it', async () => {
      mockKeep.mockResolvedValue('inProgress');
      mount(view('SCHEDULED', 'ALL', {dueAt: DUE}));
      await ui.press(deletionCopy.banner.keep);
      expect(onKept).toHaveBeenCalledTimes(1);
    });

    it('shows the button busy while keeping', () => {
      mockKeeping = true;
      mount(view('SCHEDULED', 'ALL', {dueAt: DUE}));
      expect(ui.byLabel(deletionCopy.banner.keep)!.props.disabled).toBe(true);
    });

    it('does not crash on a date the server got wrong', () => {
      mount(view('SCHEDULED', 'ALL', {dueAt: 'not a date'}));
      expect(ui.has(copy.stepReminder)).toBe(true);
      expect(ui.byLabel(deletionCopy.banner.keep)).toBeDefined();
    });
  });

  describe('waiting', () => {
    it('says what it waits for, with Keep my account and no steps', () => {
      mount(view('WAITING_ON_OPEN_ITEMS', 'CHEF'));
      expect(ui.has(copy.waitingTag)).toBe(true);
      expect(ui.has(copy.waitingTitle)).toBe(true);
      expect(ui.has(copy.waitingBody)).toBe(true);
      expect(ui.byLabel(deletionCopy.banner.keep)).toBeDefined();
      expect(ui.has(copy.stepAsked)).toBe(false);
      expect(ui.has(copy.stepReminder)).toBe(false);
      expect(ui.has(copy.inReviewSteps[0])).toBe(false);
    });
  });

  describe('erasing', () => {
    it.each([
      ['CHEF', 'Your chef side is being deleted'],
      ['CUSTOMER', 'Your customer side is being deleted'],
      ['ALL', 'Your account is being deleted'],
    ] as const)('%s: says it cannot be stopped and offers no button', (scope, title) => {
      mount(view('ERASING', scope));
      expect(ui.has(title)).toBe(true);
      expect(ui.has(copy.erasingBody)).toBe(true);
      expect(ui.byLabel(deletionCopy.banner.keep)).toBeUndefined();
      expect(hasButtons()).toHaveLength(0);
    });
  });

  describe('declined', () => {
    it.each([
      ['CHEF', "Craves couldn't delete your chef side yet"],
      ['ALL', "Craves couldn't delete your account yet"],
    ] as const)('%s: the title, the reason from Craves and what happened', (scope, title) => {
      mount(view('REJECTED', scope, {reviewNote: 'Your last payout is still open.'}));
      expect(ui.has(copy.declinedTag)).toBe(true);
      expect(ui.has(title)).toBe(true);
      expect(ui.has(copy.reasonLabel)).toBe(true);
      expect(ui.has('Your last payout is still open.')).toBe(true);
      copy.declinedLines.forEach(line => expect(ui.has(line)).toBe(true));
      expect(ui.byLabel(deletionCopy.banner.keep)).toBeUndefined();
    });

    it('leaves out the reason box when Craves gave no reason', () => {
      mount(view('REJECTED', 'CHEF'));
      expect(ui.has(copy.reasonLabel)).toBe(false);
      expect(ui.has(copy.declinedLines[0])).toBe(true);
    });

    it('Ask again hands the screen to the start flow', async () => {
      mount(view('REJECTED', 'CHEF', {reviewNote: 'Open payout'}));
      await ui.press(copy.askAgain);
      expect(onAskAgain).toHaveBeenCalledTimes(1);
      expect(onContactSupport).not.toHaveBeenCalled();
    });

    it('Contact support opens support', async () => {
      mount(view('REJECTED', 'CHEF', {reviewNote: 'Open payout'}));
      await ui.press(copy.contactSupport);
      expect(onContactSupport).toHaveBeenCalledTimes(1);
      expect(onAskAgain).not.toHaveBeenCalled();
    });
  });

  it('puts the screen title in the scaffold, and the buttons in its footer', () => {
    mount(view('SCHEDULED', 'ALL', {dueAt: DUE}));
    expect(ui.has('Delete account')).toBe(true);
  });

  it('falls back to the whole-account words for a scope the app does not know', () => {
    const unknown = 'SOMETHING_NEW' as DeletionScope;
    mount(view('PENDING_REVIEW', unknown));
    expect(ui.has(copy.inReviewLastAll)).toBe(true);
    act(() => tree.unmount());

    mount(view('SCHEDULED', unknown, {dueAt: DUE}));
    expect(ui.has(copy.scheduledTitle.ALL('5 Dec 2026'))).toBe(true);
    expect(ui.has(copy.scheduledBody.ALL)).toBe(true);
    expect(ui.has(copy.stepDeleted.ALL)).toBe(true);
    act(() => tree.unmount());

    mount(view('ERASING', unknown));
    expect(ui.has(copy.erasingTitle.ALL)).toBe(true);
    act(() => tree.unmount());

    mount(view('REJECTED', unknown));
    expect(ui.has(copy.declinedTitle.ALL)).toBe(true);
  });
});
