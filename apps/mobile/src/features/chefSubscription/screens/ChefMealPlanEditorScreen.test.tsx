import React from 'react';
import {Text, TextInput} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {usePreventRemove} from '@react-navigation/native';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import type {ChefMealPlan, ChefMealSchedule} from '../api/chefSubscriptionApi';
import {ChefMealPlanEditorScreen} from './ChefMealPlanEditorScreen';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);
const mockRefetch = jest.fn();
const mockCreatePlan = jest.fn();
const mockUpdatePlan = jest.fn();
const mockPutSchedule = jest.fn();
const mockUploadPlanImage = jest.fn();
const mockSubmit = jest.fn();
let mockPlans: ChefMealPlan[] = [];
let mockPlansState: {isLoading?: boolean; isError?: boolean} = {};
let mockSchedule: {data?: Partial<ChefMealSchedule>; error?: unknown; isLoading?: boolean} = {};
let mockMenu: {items: unknown[]; status: string; refresh: jest.Mock} = {items: [], status: 'success', refresh: jest.fn()};

jest.mock('@react-navigation/native', () => ({usePreventRemove: jest.fn()}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => true}));
jest.mock('../../../core/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({apiBaseUrl: 'https://api.craves.in'}),
}));
jest.mock('../../chefMenu/state/useChefMenuModel', () => ({
  useChefMenuModel: () => mockMenu,
}));
jest.mock('../query/chefMealPlanQueries', () => ({
  invalidateChefMealPlans: () => mockInvalidate(),
  useChefMealPlansQuery: () => ({data: mockPlans, isLoading: false, isError: false, refetch: mockRefetch, ...mockPlansState}),
  useChefMealPlanScheduleQuery: () => ({
    isLoading: false,
    refetch: mockRefetch,
    ...mockSchedule,
    isError: mockSchedule.error !== undefined,
  }),
}));
jest.mock('../api/chefSubscriptionApi', () => ({
  chefSubscriptionApi: {
    createPlan: (...args: unknown[]) => mockCreatePlan(...args),
    updatePlan: (...args: unknown[]) => mockUpdatePlan(...args),
    putSchedule: (...args: unknown[]) => mockPutSchedule(...args),
    uploadPlanImage: (...args: unknown[]) => mockUploadPlanImage(...args),
    submit: (...args: unknown[]) => mockSubmit(...args),
  },
}));

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const DISH_ID = '44444444-4444-4444-8444-444444444444';
const DISH_2 = '55555555-5555-4555-8555-555555555555';

const plan = (fields: Partial<ChefMealPlan>): ChefMealPlan =>
  ({
    id: PLAN_ID,
    planCode: 'CODE',
    name: 'Home Lunch',
    description: 'Fresh lunches.',
    billingPeriod: 'WEEKLY',
    amount: '1499',
    currency: 'INR',
    status: 'DRAFT',
    reviewReason: null,
    ...fields,
  }) as ChefMealPlan;

const dish = (id: string, itemName: string, price: number) => ({
  id,
  itemName,
  status: 'ACTIVE',
  available: true,
  foodType: id === DISH_ID ? 'NON_VEG' : 'VEG',
  price,
  images: [],
});

let tree: renderer.ReactTestRenderer;

const navigation = {goBack: mockGoBack, navigate: mockNavigate, dispatch: mockDispatch};
const queryClient = new QueryClient();
const screen = (planId?: string) => (
  <QueryClientProvider client={queryClient}>
    <ChefToastProvider>
      <ChefMealPlanEditorScreen
        navigation={navigation as never}
        route={{key: 'editor', name: 'ChefMealPlanEditor', params: {planId}}}
      />
    </ChefToastProvider>
  </QueryClientProvider>
);

function render(planId?: string) {
  act(() => {
    tree = renderer.create(screen(planId));
  });
}

const allText = () =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().filter(child => typeof child === 'string' || typeof child === 'number').join(''));

const pressable = (label: string): ReactTestInstance =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (label: string) => act(() => pressable(label).props.onPress());

const input = (label: string): ReactTestInstance =>
  tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;

const type = (label: string, value: string) => act(() => input(label).props.onChangeText(value));
const fillDetails = () => {
  type('Plan name', 'Home Lunch');
  type('Description', 'Fresh lunches.');
  type('Price per week', '1499');
};

/** The preventRemove hook as the screen last registered it: whether it blocks, and what it does when it does. */
const leaveGuard = () => jest.mocked(usePreventRemove).mock.calls.at(-1)! as unknown as [boolean, (event: unknown) => void];
const tryLeave = () => act(() => leaveGuard()[1]({data: {action: {type: 'GO_BACK'}}}));

const stepLine = () => allText().find(line => line.startsWith('Step '));

function lunchSchedule(extra: Array<Record<string, unknown>> = []) {
  return {
    data: {
      recurrenceType: 'WEEKLY',
      generationLeadHours: 24,
      items: [
        {id: 'item-1', menuItemId: DISH_ID, menuItemName: 'Chicken Biryani', quantity: 1, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: 'LUNCH', serviceTime: '12:30:00', sequenceNumber: 1},
        ...extra,
      ],
    } as Partial<ChefMealSchedule>,
  };
}

async function attachPhoto() {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{uri: 'file:///plan.jpg', width: 800, height: 600, mimeType: 'image/jpeg', fileSize: 1000, fileName: 'plan.jpg'}],
  } as never);
  await act(async () => pressable('Add plan photo').props.onPress());
}

/** Details already valid and the meal already planned: walk to the Review step. */
function reachReview() {
  press('Next: Meals');
  press('Next: Review');
}
const submit = (wait = false) =>
  act(async () => {
    pressable('Submit for approval').props.onPress();
    if (wait) await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });

/** A new plan with a Tuesday lunch of Chicken Biryani, standing on step 2. */
function newPlanWithTuesdayLunch() {
  mockMenu.items = [dish(DISH_ID, 'Chicken Biryani', 80), dish(DISH_2, 'Lemon rice', 60)];
  render();
  fillDetails();
  press('Next: Meals');
  press('Tue');
  press('Add meal slot for Tue');
  press('Lunch');
  press('Lunch dish, not selected');
  press('Chicken Biryani');
}

describe('ChefMealPlanEditorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlans = [];
    mockPlansState = {};
    mockSchedule = {};
    mockMenu = {items: [], status: 'success', refresh: jest.fn(async () => undefined)};
  });
  afterEach(() => act(() => tree?.unmount()));

  describe('a plan Craves is checking, a live plan or an inactive plan', () => {
    it('opens read-only with a single way forward: ask for a change', () => {
      mockPlans = [plan({status: 'PENDING_APPROVAL'})];
      mockMenu.items = [dish(DISH_ID, 'Chicken Biryani', 80)];
      mockSchedule = lunchSchedule();
      render(PLAN_ID);

      expect(allText()).toEqual(
        expect.arrayContaining([
          'Home Lunch',
          'Waiting approval',
          "Craves is checking this plan. You can't edit it until then.",
          'Chicken Biryani',
          '12:30 PM',
        ]),
      );
      expect(allText().some(line => line.startsWith('Step '))).toBe(false);
      expect(pressable('Save draft')).toBeUndefined();
      expect(pressable('Next: Meals')).toBeUndefined();
      expect(pressable('Submit for approval')).toBeUndefined();
      expect(pressable('Remove lunch')).toBeUndefined();
      expect(pressable('Add plan photo')).toBeUndefined();
      expect(input('Plan name').props.editable).toBe(false);
      expect(input('Description').props.editable).toBe(false);
      expect(pressable('Fewer lunch portions')).toBeUndefined();
    });

    it.each([
      ['ACTIVE', 'This plan is live. To change something, send us a request.'],
      ['INACTIVE', "This plan isn't live. To change something, send us a request."],
    ] as const)('says what to do for a %s plan, and "Request a change" opens a support ticket about it', (status, line) => {
      mockPlans = [plan({status, name: 'Weekly lunch box'})];
      mockSchedule = lunchSchedule();
      render(PLAN_ID);

      expect(allText()).toContain(line);
      press('Request a change');
      expect(mockNavigate).toHaveBeenCalledWith('ChefSupportTicket', {topic: 'Change meal plan: Weekly lunch box'});
    });

    it('does not guard leaving, since nothing can change', () => {
      mockPlans = [plan({status: 'ACTIVE'})];
      mockSchedule = lunchSchedule();
      render(PLAN_ID);

      expect(leaveGuard()[0]).toBe(false);
    });
  });

  it('opens a draft that has no schedule yet, with what Craves asked to change', () => {
    mockPlans = [plan({status: 'REJECTED', reviewReason: 'Add a dinner option'})];
    mockSchedule = {error: new AppApiError('PLAN_SCHEDULE_NOT_FOUND', 'Not found', 404)};
    render(PLAN_ID);

    expect(allText()).toEqual(expect.arrayContaining(['Changes requested', 'Add a dinner option', 'Edit meal plan', 'Step 1 of 3 · Details']));
    expect(input('Plan name').props.value).toBe('Home Lunch');
    expect(pressable('Next: Meals')).toBeDefined();

    // A refetch after a save goes back through loading; the chef's edits must survive it.
    type('Plan name', 'Edited');
    mockSchedule = {isLoading: true};
    act(() => tree.update(screen(PLAN_ID)));
    expect(input('Plan name').props.value).toBe('Edited');
  });

  describe('the loading states', () => {
    it('waits for the plan, then explains a failure and retries', () => {
      mockPlansState = {isLoading: true};
      render(PLAN_ID);
      expect(allText()).not.toContain('Next: Meals');

      act(() => tree.unmount());
      mockPlansState = {isError: true};
      render(PLAN_ID);
      expect(allText()).toContain("Couldn't load this meal plan");
      press('Try again');
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('says when the plan is gone', () => {
      mockSchedule = lunchSchedule();
      render(PLAN_ID);

      expect(allText()).toContain('This meal plan is not available any more');
      press('Back to meal plans');
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  describe('step 1: details', () => {
    it('starts a new plan with the board\'s fields, and no grey', () => {
      render();

      expect(allText()).toEqual(
        expect.arrayContaining(['New meal plan', 'Step 1 of 3 · Details', 'Add plan photo', 'Customers see it on the plan card', 'How often', 'Cook how early', 'How long before each meal you start preparing.', 'Next: Meals']),
      );
      expect(input('Plan name').props.placeholder).toBe('e.g. Weekly home lunch');
      expect(input('Description').props.placeholder).toBe("What customers get, how it's packed");
      expect(pressable('Cook how early, 24 hours before (default)')).toBeDefined();
      expect(allText().join(' ')).not.toContain('Plan your meals, delight your customers');
    });

    it('will not go to Meals without a name, a price and a description', () => {
      render();
      press('Next: Meals');

      expect(allText()).toEqual(
        expect.arrayContaining(['Enter a plan name.', 'Enter a price above ₹0.', 'Add a short description.', 'Step 1 of 3 · Details']),
      );

      fillDetails();
      press('Next: Meals');
      expect(stepLine()).toBe('Step 2 of 3 · Meals');
    });

    it('follows the frequency in the price unit, and asks before it clears planned meals', () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      render(PLAN_ID);
      expect(input('Price per week')).toBeDefined();

      press('Monthly');
      expect(allText()).toContain('Change how often?');
      press('Change');
      expect(input('Price per month')).toBeDefined();

      press('Next: Meals');
      expect(pressable('Day 1')).toBeDefined();
      expect(pressable('Lunch dish, Chicken Biryani')).toBeUndefined();
    });

    it('changes frequency straight away while no meals are planned', () => {
      render();
      press('Monthly');

      expect(allText()).not.toContain('Change how often?');
      expect(input('Price per month')).toBeDefined();
    });

    it('sends the cook-early choice with the schedule', async () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      mockUpdatePlan.mockResolvedValueOnce(plan({}));
      mockPutSchedule.mockResolvedValueOnce(undefined);
      mockSubmit.mockResolvedValueOnce(plan({status: 'PENDING_APPROVAL'}));
      render(PLAN_ID);

      press('Cook how early, 24 hours before (default)');
      press('48 hours before');
      expect(pressable('Cook how early, 48 hours before')).toBeDefined();
      reachReview();
      await submit(true);

      expect(mockPutSchedule).toHaveBeenCalledWith(PLAN_ID, expect.objectContaining({generationLeadHours: 48}));
    });
  });

  describe('step 2: meals', () => {
    it('will not go to Review without a meal', () => {
      render();
      fillDetails();
      press('Next: Meals');
      press('Next: Review');

      expect(allText()).toContain('Add at least one meal before submitting.');
      expect(stepLine()).toBe('Step 2 of 3 · Meals');
    });

    it('will not go to Review while a meal has no dish', () => {
      mockMenu.items = [dish(DISH_ID, 'Chicken Biryani', 80)];
      render();
      fillDetails();
      press('Next: Meals');
      press('Add meal slot for Mon');
      press('Lunch');
      press('Next: Review');

      expect(allText()).toEqual(expect.arrayContaining(['Select a dish.', 'Select a dish for every meal: Mon.', 'Step 2 of 3 · Meals']));
      expect(mockCreatePlan).not.toHaveBeenCalled();
    });

    it('lists what is still free on the day, in plain words', () => {
      mockMenu.items = [dish(DISH_ID, 'Chicken Biryani', 80)];
      render();
      fillDetails();
      press('Next: Meals');
      expect(allText()).toContain('Add a meal');
      expect(allText()).not.toContain('Copy Monday to all weekdays');

      press('Add meal slot for Mon');
      press('Lunch');
      expect(allText()).toEqual(expect.arrayContaining(['Add breakfast, snack or dinner', 'Copy Monday to all weekdays']));
    });

    it('shows the dish with its veg mark and menu price, and a quantity stepper', () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      mockMenu.items = [dish(DISH_ID, 'Chicken Biryani', 80)];
      render(PLAN_ID);
      press('Next: Meals');

      expect(allText()).toEqual(expect.arrayContaining(['Lunch', '12:30 PM', 'Chicken Biryani', '₹80 on menu', '1']));
      press('More lunch portions');
      expect(allText()).toContain('2');
      expect(pressable('Fewer lunch portions').props.disabled).toBe(false);
    });

    it('copies Tuesday to all weekdays', () => {
      newPlanWithTuesdayLunch();
      expect(pressable('Mon, has meals')).toBeUndefined();

      press('Copy Tuesday to all weekdays');

      for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
        expect(pressable(`${label}, has meals`)).toBeDefined();
      }
      expect(pressable('Sat, has meals')).toBeUndefined();
      press('Fri, has meals');
      expect(pressable('Lunch dish, Chicken Biryani')).toBeDefined();
    });

    it('asks before a copy replaces meals the other weekdays already have', () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule(); // Monday lunch
      mockMenu.items = [dish(DISH_ID, 'Chicken Biryani', 80), dish(DISH_2, 'Lemon rice', 60)];
      render(PLAN_ID);
      press('Next: Meals');
      press('Tue');
      press('Add meal slot for Tue');
      press('Lunch');
      press('Lunch dish, not selected');
      press('Lemon rice');

      press('Copy Tuesday to all weekdays');
      expect(allText()).toEqual(expect.arrayContaining(['Copy Tuesday to all weekdays?', 'This replaces any meals already planned for the other weekdays.']));
      expect(pressable('Wed, has meals')).toBeUndefined();

      press('Copy');
      expect(pressable('Wed, has meals')).toBeDefined();
      press('Mon, has meals');
      expect(pressable('Lunch dish, Lemon rice')).toBeDefined();
    });

    it('asks "Remove lunch on Monday?" before deleting a meal', () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      mockMenu.items = [dish(DISH_ID, 'Chicken Biryani', 80)];
      render(PLAN_ID);
      press('Next: Meals');

      press('Remove lunch');
      expect(allText()).toContain('Remove lunch on Monday?');
      press('Cancel');
      expect(pressable('Lunch dish, Chicken Biryani')).toBeDefined();

      press('Remove lunch');
      press('Remove');
      expect(pressable('Lunch dish, Chicken Biryani')).toBeUndefined();
    });

    it('offers a retry when the menu could not be loaded', () => {
      mockMenu.status = 'error';
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      render(PLAN_ID);
      press('Next: Meals');
      press('Lunch dish, Chicken Biryani');

      expect(allText()).not.toContain('None of your dishes are on and available yet.');
      press('Try again');
      expect(mockMenu.refresh).toHaveBeenCalled();
    });

    it('goes back to Details with what was typed', () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      render(PLAN_ID);
      type('Plan name', 'Renamed');
      press('Next: Meals');
      press('Back');

      expect(stepLine()).toBe('Step 1 of 3 · Details');
      expect(input('Plan name').props.value).toBe('Renamed');
    });
  });

  describe('step 3: review', () => {
    it('summarises the plan and groups days that have the same meals', () => {
      newPlanWithTuesdayLunch();
      press('Copy Tuesday to all weekdays');
      press('Next: Review');

      expect(allText()).toEqual(
        expect.arrayContaining([
          'Step 3 of 3 · Review',
          'Home Lunch',
          'Weekly · Lunch · Mon – Fri',
          '₹1,499 / week',
          'Meals',
          'Mon – Fri · Lunch 12:30 PM',
          'Chicken Biryani',
          'Note for Craves (optional)',
          "You can't edit the plan while Craves checks it. Usually takes a day.",
          'Submit for approval',
        ]),
      );
      expect(input('Note for Craves (optional)').props.placeholder).toBe('Anything the Craves team should know');
    });

    it('jumps back to the step the chef wants to change', () => {
      newPlanWithTuesdayLunch();
      press('Next: Review');

      press('Edit meals');
      expect(stepLine()).toBe('Step 2 of 3 · Meals');
      press('Next: Review');
      press('Edit details');
      expect(stepLine()).toBe('Step 1 of 3 · Details');
    });

    it('sends the note for Craves with the submit, then closes with a confirmation', async () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      mockUpdatePlan.mockResolvedValueOnce(plan({}));
      mockPutSchedule.mockResolvedValueOnce(undefined);
      mockSubmit.mockResolvedValueOnce(plan({status: 'PENDING_APPROVAL'}));
      render(PLAN_ID);
      reachReview();
      type('Note for Craves (optional)', ' Please check the price ');
      await submit(true);

      expect(mockUpdatePlan).toHaveBeenCalledWith(PLAN_ID, expect.objectContaining({name: 'Home Lunch', amount: 1499}));
      expect(mockPutSchedule).toHaveBeenCalledTimes(1);
      expect(mockSubmit).toHaveBeenCalledWith(PLAN_ID, ' Please check the price ');
      expect(mockInvalidate).toHaveBeenCalled();
      expect(mockGoBack).toHaveBeenCalled();
      expect(allText()).toContain('Sent to Craves for approval');
    });

    it('sends one request when Submit is tapped twice', async () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      let finish: (saved: ChefMealPlan) => void = () => undefined;
      mockUpdatePlan.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
      mockPutSchedule.mockResolvedValue(undefined);
      mockSubmit.mockResolvedValue(plan({status: 'PENDING_APPROVAL'}));
      render(PLAN_ID);
      reachReview();

      await act(async () => {
        pressable('Submit for approval').props.onPress();
        pressable('Submit for approval').props.onPress();
        finish(plan({}));
      });

      expect(mockUpdatePlan).toHaveBeenCalledTimes(1);
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });

    it('updates the plan it already created when the schedule failed to save', async () => {
      mockMenu.items = [dish(DISH_ID, 'Chicken Biryani', 80)];
      mockCreatePlan.mockResolvedValueOnce(plan({}));
      mockUpdatePlan.mockResolvedValueOnce(plan({}));
      mockPutSchedule
        .mockRejectedValueOnce(new AppApiError('SCHEDULE_FAILED', 'Schedule could not be saved.', 500))
        .mockResolvedValueOnce(undefined);
      mockSubmit.mockResolvedValueOnce(plan({status: 'PENDING_APPROVAL'}));
      render();
      fillDetails();
      press('Next: Meals');
      press('Add meal slot for Mon');
      press('Lunch');
      press('Lunch dish, not selected');
      press('Chicken Biryani');
      press('Next: Review');

      await submit();
      expect(allText()).toContain('Schedule could not be saved.');
      expect(mockGoBack).not.toHaveBeenCalled();
      await submit(true);

      expect(mockCreatePlan).toHaveBeenCalledTimes(1);
      expect(mockUpdatePlan).toHaveBeenCalledWith(PLAN_ID, expect.objectContaining({name: 'Home Lunch'}));
      expect(mockPutSchedule).toHaveBeenCalledTimes(2);
      expect(mockSubmit).toHaveBeenCalledTimes(1);
      expect(mockGoBack).toHaveBeenCalled();
    });

    it('drops the photo and still submits when the saved plan has no photo support', async () => {
      mockPlans = [plan({imageUrl: null})];
      mockSchedule = lunchSchedule();
      mockUpdatePlan.mockResolvedValueOnce(plan({})); // no imageUrl key: an older backend
      mockPutSchedule.mockResolvedValueOnce(undefined);
      mockSubmit.mockResolvedValueOnce(plan({status: 'PENDING_APPROVAL'}));
      render(PLAN_ID);
      await attachPhoto();
      reachReview();
      await submit(true);

      expect(mockUploadPlanImage).not.toHaveBeenCalled();
      expect(mockSubmit).toHaveBeenCalledWith(PLAN_ID, '');
      expect(mockGoBack).toHaveBeenCalled();
    });

    it('keeps the saved plan and does not submit when the photo is rejected', async () => {
      mockPlans = [plan({imageUrl: null})];
      mockSchedule = lunchSchedule();
      mockUpdatePlan.mockResolvedValueOnce(plan({imageUrl: null}));
      mockPutSchedule.mockResolvedValueOnce(undefined);
      mockUploadPlanImage.mockRejectedValueOnce(new AppApiError('PLAN_IMAGE_INVALID', 'Use a JPEG or PNG photo.', 400));
      render(PLAN_ID);
      await attachPhoto();
      reachReview();
      await submit(true);

      expect(mockUploadPlanImage).toHaveBeenCalledWith(PLAN_ID, expect.anything());
      expect(mockSubmit).not.toHaveBeenCalled();
      expect(allText()).toContain("Plan saved, but the photo wasn't uploaded. Use a JPEG or PNG photo.");
      expect(mockGoBack).not.toHaveBeenCalled();
    });
  });

  describe('leaving', () => {
    it('only guards the exit once something has changed', () => {
      render();
      expect(leaveGuard()[0]).toBe(false);

      type('Plan name', 'H');
      expect(leaveGuard()[0]).toBe(true);
    });

    it('asks "Save as draft?" and saves a new draft without meals', async () => {
      mockCreatePlan.mockResolvedValueOnce(plan({}));
      render();
      fillDetails();
      tryLeave();

      expect(allText()).toContain('Save as draft?');
      await act(async () => pressable('Save draft').props.onPress());

      expect(mockCreatePlan).toHaveBeenCalledWith({
        name: 'Home Lunch',
        description: 'Fresh lunches.',
        billingPeriod: 'WEEKLY',
        amount: 1499,
        currency: 'INR',
      });
      expect(mockPutSchedule).not.toHaveBeenCalled();
      expect(mockInvalidate).toHaveBeenCalled();
      expect(mockGoBack).toHaveBeenCalled();
      expect(allText()).toContain('Draft saved');
    });

    it('takes the chef to the step with the problem when the draft cannot be saved yet', async () => {
      render();
      type('Plan name', 'Half done');
      tryLeave();
      await act(async () => pressable('Save draft').props.onPress());

      expect(mockCreatePlan).not.toHaveBeenCalled();
      expect(allText()).toEqual(expect.arrayContaining(['Add a short description.', 'Enter a price above ₹0.']));
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('lets the chef discard, or keep editing', () => {
      render();
      type('Plan name', 'Half done');
      tryLeave();

      press('Keep editing');
      expect(allText()).not.toContain('Save as draft?');

      tryLeave();
      press('Discard');
      expect(mockDispatch).toHaveBeenCalledWith({type: 'GO_BACK'});
      expect(mockCreatePlan).not.toHaveBeenCalled();
    });

    it('locks the form while saving and explains why removing every meal keeps the old schedule', async () => {
      mockPlans = [plan({})];
      mockSchedule = lunchSchedule();
      let finish: (saved: ChefMealPlan) => void = () => undefined;
      mockUpdatePlan.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
      render(PLAN_ID);
      press('Next: Meals');
      press('Remove lunch');
      press('Remove');

      tryLeave();
      let saving: Promise<void> | undefined;
      act(() => {
        saving = pressable('Save draft').props.onPress();
      });
      expect(pressable('Add meal slot for Mon').props.disabled).toBe(true);
      await act(async () => {
        finish(plan({}));
        await saving;
      });

      expect(mockPutSchedule).not.toHaveBeenCalled();
      expect(allText()).toContain('Add at least one meal to save schedule changes.');
      expect(mockGoBack).not.toHaveBeenCalled();
      expect(pressable('Add meal slot for Mon').props.disabled).toBe(false);
    });
  });
});
