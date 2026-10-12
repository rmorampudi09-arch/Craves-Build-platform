import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ChefMenuItem} from '../api/chefMenuApi';
import {useChefMenuModel, type ChefMenuModel} from './useChefMenuModel';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const ID_B = '123e4567-e89b-42d3-a456-426614174009';
const mockApi = {listItems: jest.fn(), updateAvailability: jest.fn(), replaceItem: jest.fn()};

jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));
jest.mock('../api/chefMenuApi', () => ({
  ...jest.requireActual('../api/chefMenuApi'),
  chefMenuApi: {
    listItems: (...args: unknown[]) => mockApi.listItems(...args),
    updateAvailability: (...args: unknown[]) => mockApi.updateAvailability(...args),
    replaceItem: (...args: unknown[]) => mockApi.replaceItem(...args),
  },
}));

const dish = (overrides: Partial<ChefMenuItem> = {}): ChefMenuItem => ({
  id: ID,
  kitchenId: '123e4567-e89b-42d3-a456-426614174001',
  itemName: 'Prawns biryani',
  description: null,
  category: 'Biryani',
  foodType: 'NON_VEG',
  price: 180,
  currency: 'INR',
  servesCount: null,
  preparationTimeMinutes: 25,
  spiceLevel: null,
  unitPackageWeightGrams: 450,
  thermoboxRequired: false,
  available: true,
  status: 'ACTIVE',
  images: [],
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

// Lets the pending promises of a started change run, so the optimistic list is on screen.
const settle = () => act(async () => new Promise<void>(resolve => setTimeout(resolve, 0)));

describe('useChefMenuModel', () => {
  let model: ChefMenuModel;
  let tree: renderer.ReactTestRenderer;
  const Probe = () => {
    model = useChefMenuModel();
    return null;
  };
  const mount = async () => {
    const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
    await act(async () => {
      tree = renderer.create(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });
  };
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows a switch change at once and keeps what the server returns', async () => {
    mockApi.listItems.mockResolvedValue([dish()]);
    const save = deferred<ChefMenuItem>();
    mockApi.updateAvailability.mockReturnValue(save.promise);
    await mount();

    let saved!: Promise<boolean>;
    await act(async () => {
      saved = model.updateAvailability(ID, false);
    });
    await settle();
    expect(model.items[0].available).toBe(false);
    expect(model.availabilityStateByItem[ID]).toBe(true);

    // The list the server sends after the save already holds the change.
    mockApi.listItems.mockResolvedValue([dish({available: false})]);
    await act(async () => {
      save.resolve(dish({available: false}));
      await saved;
    });
    expect(await saved).toBe(true);
    expect(model.items[0].available).toBe(false);
    expect(model.availabilityStateByItem[ID]).toBeUndefined();
    expect(mockApi.updateAvailability).toHaveBeenCalledWith(ID, {available: false});
  });

  it('puts the switch back when the server says no', async () => {
    mockApi.listItems.mockResolvedValue([dish()]);
    const save = deferred<ChefMenuItem>();
    mockApi.updateAvailability.mockReturnValue(save.promise);
    await mount();

    let saved!: Promise<boolean>;
    await act(async () => {
      saved = model.updateAvailability(ID, false);
    });
    await settle();
    expect(model.items[0].available).toBe(false);
    await act(async () => {
      save.reject(new Error('offline'));
      await saved;
    });
    expect(await saved).toBe(false);
    expect(model.items[0].available).toBe(true);
  });

  it('ignores a second change to the same dish while one is still being saved', async () => {
    mockApi.listItems.mockResolvedValue([dish()]);
    const save = deferred<ChefMenuItem>();
    mockApi.updateAvailability.mockReturnValue(save.promise);
    await mount();

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = model.updateAvailability(ID, false);
      second = model.updateAvailability(ID, true);
    });
    expect(await second).toBe(false);
    await act(async () => {
      save.resolve(dish({available: false}));
      await first;
    });
    expect(mockApi.updateAvailability).toHaveBeenCalledTimes(1);
  });

  it('publishes a draft with one replace call: ACTIVE and on', async () => {
    const draft = dish({status: 'DRAFT', available: false});
    mockApi.listItems.mockResolvedValue([draft]);
    mockApi.replaceItem.mockResolvedValue(dish());
    await mount();
    mockApi.listItems.mockResolvedValue([dish()]);

    let ok = false;
    await act(async () => {
      ok = await model.publishDraft(draft);
    });
    expect(ok).toBe(true);
    expect(mockApi.replaceItem).toHaveBeenCalledTimes(1);
    expect(mockApi.replaceItem).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({itemName: 'Prawns biryani', status: 'ACTIVE', available: true, currency: 'INR'}),
    );
    expect(model.items[0]).toMatchObject({status: 'ACTIVE', available: true});
  });

  describe('when one dish fails while another was saved', () => {
    const A = dish({id: ID, itemName: 'Prawns biryani'});
    const B = dish({id: ID_B, itemName: 'Paneer biryani'});
    const byId = (id: string) => model.items.find(item => item.id === id)!;

    // The list is mounted from the server once; after that only the changes below touch it.
    const mountTwo = async () => {
      mockApi.listItems.mockResolvedValueOnce([A, B]);
      await mount();
      mockApi.listItems.mockReturnValue(new Promise(() => undefined));
    };

    it('puts back only the dish that failed, and asks the server for the list again', async () => {
      await mountTwo();
      const saveA = deferred<ChefMenuItem>();
      mockApi.updateAvailability.mockImplementation((id: string) =>
        id === ID ? saveA.promise : Promise.resolve({...B, available: false}),
      );

      let changeA!: Promise<boolean>;
      let changeB!: Promise<boolean>;
      await act(async () => {
        changeA = model.updateAvailability(ID, false);
      });
      await settle();
      await act(async () => {
        changeB = model.updateAvailability(ID_B, false);
      });
      await settle();
      expect(await changeB).toBe(true);
      expect(byId(ID).available).toBe(false);
      expect(byId(ID_B).available).toBe(false);

      const listCallsBefore = mockApi.listItems.mock.calls.length;
      await act(async () => {
        saveA.reject(new Error('offline'));
        await changeA;
      });
      expect(await changeA).toBe(false);
      // A is back; B stays as the server saved it.
      expect(byId(ID).available).toBe(true);
      expect(byId(ID_B).available).toBe(false);
      expect(mockApi.listItems.mock.calls.length).toBeGreaterThan(listCallsBefore);
    });

    it('does the same when a Publish fails', async () => {
      const draft = dish({id: ID, itemName: 'Tomato curry', status: 'DRAFT', available: false});
      mockApi.listItems.mockResolvedValueOnce([draft, B]);
      await mount();
      mockApi.listItems.mockReturnValue(new Promise(() => undefined));
      const publish = deferred<ChefMenuItem>();
      mockApi.replaceItem.mockReturnValue(publish.promise);
      mockApi.updateAvailability.mockResolvedValue({...B, available: false});

      let failing!: Promise<boolean>;
      await act(async () => {
        failing = model.publishDraft(draft);
      });
      await settle();
      expect(byId(ID)).toMatchObject({status: 'ACTIVE', available: true});
      await act(async () => {
        await model.updateAvailability(ID_B, false);
      });
      await act(async () => {
        publish.reject(new Error('offline'));
        await failing;
      });
      expect(byId(ID)).toMatchObject({status: 'DRAFT', available: false});
      expect(byId(ID_B).available).toBe(false);
    });
  });
});
