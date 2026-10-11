import React from 'react';
import {Text, TextInput} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefMealPlan, ChefMealSchedule} from '../api/chefSubscriptionApi';
import {ChefMealPlanEditorScreen} from './ChefMealPlanEditorScreen';

const mockGoBack = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);
const mockCreatePlan = jest.fn();
const mockUpdatePlan = jest.fn();
const mockPutSchedule = jest.fn();
const mockUploadPlanImage = jest.fn();
const mockSubmit = jest.fn();
let mockPlans: ChefMealPlan[] = [];
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
  useChefMealPlansQuery: () => ({data: mockPlans, isLoading: false, isError: false}),
  useChefMealPlanScheduleQuery: () => ({
    isLoading: false,
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

let tree: renderer.ReactTestRenderer;

const navigation = {goBack: mockGoBack, dispatch: jest.fn()};
const queryClient = new QueryClient();
const screen = (planId?: string) => (
  <QueryClientProvider client={queryClient}>
    <ChefMealPlanEditorScreen
      navigation={navigation as never}
      route={{key: 'editor', name: 'ChefMealPlanEditor', params: {planId}}}
    />
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
    .map(node => [node.props.children].flat().filter(child => typeof child === 'string').join(''));

const pressable = (label: string): ReactTestInstance =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];

const input = (label: string): ReactTestInstance =>
  tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;

describe('ChefMealPlanEditorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlans = [];
    mockSchedule = {};
    mockMenu = {items: [], status: 'success', refresh: jest.fn(async () => undefined)};
  });
  afterEach(() => act(() => tree?.unmount()));

  it('is read-only while the plan waits for approval', () => {
    mockPlans = [plan({status: 'PENDING_APPROVAL'})];
    mockSchedule = {
      data: {
        recurrenceType: 'WEEKLY',
        generationLeadHours: 24,
        items: [{id: 'item-1', menuItemId: DISH_ID, menuItemName: 'Chicken Biryani', quantity: 1, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: 'LUNCH', serviceTime: '12:30:00', sequenceNumber: 1}],
      } as Partial<ChefMealSchedule>,
    };
    render(PLAN_ID);

    expect(allText()).toEqual(
      expect.arrayContaining([
        'Edit Meal Plan',
        "This plan is pending approval. You can't edit it right now.",
        'Chicken Biryani',
        '12:30 PM',
      ]),
    );
    expect(pressable('Save draft')).toBeUndefined();
    expect(input('Plan name').props.editable).toBe(false);
  });

  it('opens a draft that has no schedule yet', () => {
    mockPlans = [plan({status: 'REJECTED', reviewReason: 'Add a dinner option'})];
    mockSchedule = {error: new AppApiError('PLAN_SCHEDULE_NOT_FOUND', 'Not found', 404)};
    render(PLAN_ID);

    expect(allText()).toEqual(expect.arrayContaining(['Changes requested', 'Add a dinner option']));
    expect(input('Plan name').props.value).toBe('Home Lunch');
    expect(pressable('Save draft')).toBeDefined();

    // A refetch after a save goes back through loading; the chef's edits must survive it.
    act(() => input('Plan name').props.onChangeText('Edited'));
    mockSchedule = {isLoading: true};
    act(() => tree.update(screen(PLAN_ID)));
    expect(input('Plan name').props.value).toBe('Edited');
  });

  it('blocks submit while a meal has no dish', () => {
    render();
    act(() => {
      input('Plan name').props.onChangeText('Home Lunch');
      input('Description').props.onChangeText('Fresh lunches.');
      input('Price per week').props.onChangeText('1499');
    });
    act(() => pressable('Add meal slot for Mon').props.onPress());
    act(() => pressable('Lunch').props.onPress());
    act(() => pressable('Submit for approval').props.onPress());

    expect(allText()).toEqual(expect.arrayContaining(['Select a dish.', 'Check the highlighted fields above.']));
    expect(allText()).not.toContain('Note for admin');
    expect(mockCreatePlan).not.toHaveBeenCalled();
  });

  it('saves a new draft without meals and goes back', async () => {
    mockCreatePlan.mockResolvedValue(plan({}));
    render();
    act(() => {
      input('Plan name').props.onChangeText(' Home Lunch ');
      input('Description').props.onChangeText('Fresh lunches.');
      input('Price per week').props.onChangeText('1499');
    });
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
  });

  it('updates the plan it already created when the schedule failed to save', async () => {
    mockMenu.items = [{id: DISH_ID, itemName: 'Chicken Biryani', status: 'ACTIVE', available: true, images: []}];
    mockCreatePlan.mockResolvedValueOnce(plan({}));
    mockUpdatePlan.mockResolvedValueOnce(plan({}));
    mockPutSchedule
      .mockRejectedValueOnce(new AppApiError('SCHEDULE_FAILED', 'Schedule could not be saved.', 500))
      .mockResolvedValueOnce(undefined);
    render();
    act(() => {
      input('Plan name').props.onChangeText('Home Lunch');
      input('Description').props.onChangeText('Fresh lunches.');
      input('Price per week').props.onChangeText('1499');
    });
    act(() => pressable('Add meal slot for Mon').props.onPress());
    act(() => pressable('Lunch').props.onPress());
    act(() => pressable('Lunch dish, not selected').props.onPress());
    act(() => pressable('Chicken Biryani').props.onPress());

    await act(async () => pressable('Save draft').props.onPress());
    expect(allText()).toContain('Schedule could not be saved.');
    await act(async () => pressable('Save draft').props.onPress());

    expect(mockCreatePlan).toHaveBeenCalledTimes(1);
    expect(mockUpdatePlan).toHaveBeenCalledWith(PLAN_ID, expect.objectContaining({name: 'Home Lunch'}));
    expect(mockPutSchedule).toHaveBeenCalledTimes(2);
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
    await submitForApproval();

    expect(mockUploadPlanImage).not.toHaveBeenCalled();
    expect(mockSubmit).toHaveBeenCalledWith(PLAN_ID, '');
    expect(allText()).toContain("Plan photos aren't available yet.");
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
    await submitForApproval();

    expect(mockUploadPlanImage).toHaveBeenCalledWith(PLAN_ID, expect.anything());
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(allText()).toContain("Plan saved, but the photo wasn't uploaded. Use a JPEG or PNG photo.");
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('locks the form while saving and explains why removing every meal keeps the old schedule', async () => {
    mockPlans = [plan({})];
    mockSchedule = lunchSchedule();
    let finish: (saved: ChefMealPlan) => void = () => undefined;
    mockUpdatePlan.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    render(PLAN_ID);
    act(() => pressable('Remove lunch').props.onPress());

    let saving: Promise<void> | undefined;
    act(() => {
      saving = pressable('Save draft').props.onPress();
    });
    expect(input('Plan name').props.editable).toBe(false);
    expect(pressable('Add meal slot for Mon').props.disabled).toBe(true);
    await act(async () => {
      finish(plan({}));
      await saving;
    });

    expect(mockPutSchedule).not.toHaveBeenCalled();
    expect(allText()).toContain('Add at least one meal to save schedule changes.');
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(input('Plan name').props.editable).toBe(true);
  });

  it('offers a retry when the menu could not be loaded', () => {
    mockMenu.status = 'error';
    mockPlans = [plan({})];
    mockSchedule = lunchSchedule();
    render(PLAN_ID);
    act(() => pressable('Lunch dish, Chicken Biryani').props.onPress());

    expect(allText()).not.toContain('No dishes are Active and Available on your menu yet.');
    act(() => pressable('Try again').props.onPress());
    expect(mockMenu.refresh).toHaveBeenCalled();
  });
});

function lunchSchedule() {
  return {
    data: {
      recurrenceType: 'WEEKLY',
      generationLeadHours: 24,
      items: [{id: 'item-1', menuItemId: DISH_ID, menuItemName: 'Chicken Biryani', quantity: 1, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: 'LUNCH', serviceTime: '12:30:00', sequenceNumber: 1}],
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

async function submitForApproval() {
  act(() => pressable('Submit for approval').props.onPress());
  await act(async () => {
    pressable('Submit').props.onPress();
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
}
