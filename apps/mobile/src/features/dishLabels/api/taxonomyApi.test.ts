import {AppApiError} from '../../../core/http/apiError';
import {apiClient} from '../../../core/http/apiClient';
import {publicApiClient} from '../../../core/http/transport';
import {DishLabelsConflictError, taxonomyApi} from './taxonomyApi';

jest.mock('../../../core/http/apiClient', () => ({
  apiClient: {get: jest.fn(), put: jest.fn(), delete: jest.fn()},
}));
jest.mock('../../../core/http/transport', () => ({
  publicApiClient: {get: jest.fn(), post: jest.fn()},
}));

const ID = '11111111-1111-4111-8111-111111111111';
const CHEF_ROUTE = `/api/v1/advanced/taxonomy/chef/menu-items/${ID}`;

const http = (status: number) =>
  new AppApiError(`HTTP_${status}`, 'failed', status);

describe('taxonomyApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('vocabulary parses cuisines with parents and diets', async () => {
    (publicApiClient.get as jest.Mock).mockResolvedValue({
      data: {
        cuisines: [
          {code: 'south-indian', kind: 'CUISINE', parentCode: null, name: 'South Indian', description: 'Southern India'},
          {code: 'andhra', kind: 'CUISINE', parentCode: 'south-indian', name: 'Andhra', description: 'Andhra Pradesh'},
        ],
        diets: [{code: 'jain', kind: 'DIET', parentCode: null, name: 'Jain', description: 'No root vegetables'}],
        disclaimer: 'Labels are declared by chefs.',
      },
    });

    const vocabulary = await taxonomyApi.vocabulary();

    expect(vocabulary.cuisines.map(c => c.code)).toEqual(['south-indian', 'andhra']);
    expect(vocabulary.cuisines[1].parentCode).toBe('south-indian');
    expect(vocabulary.diets).toEqual([{code: 'jain', kind: 'DIET', parentCode: null, name: 'Jain'}]);
    expect(publicApiClient.get).toHaveBeenCalledWith(
      '/api/v1/advanced/taxonomy/vocabulary',
      {signal: undefined},
    );
  });

  it('vocabulary rejects a bad body', async () => {
    (publicApiClient.get as jest.Mock).mockResolvedValue({data: {}});

    await expect(taxonomyApi.vocabulary()).rejects.toThrow(
      'TAXONOMY_VOCABULARY_INVALID_RESPONSE',
    );
  });

  it('lookup sends ids and returns codes', async () => {
    (publicApiClient.post as jest.Mock).mockResolvedValue({
      data: [
        {
          menuItemId: ID,
          cuisines: [{code: 'andhra', name: 'Andhra'}],
          diets: [],
          declaredBy: 'CHEF',
          updatedAt: '2026-11-01T10:00:00Z',
        },
      ],
    });

    await expect(taxonomyApi.lookup([ID])).resolves.toEqual([
      {menuItemId: ID, cuisines: ['andhra'], diets: []},
    ]);
    expect(publicApiClient.post).toHaveBeenCalledWith(
      '/api/v1/advanced/taxonomy/menu-items/lookup',
      {menuItemIds: [ID]},
      expect.anything(),
    );
  });

  it('lookup refuses more than 100 ids', async () => {
    await expect(taxonomyApi.lookup(Array(101).fill(ID))).rejects.toThrow(
      'TAXONOMY_LOOKUP_TOO_MANY',
    );
    expect(publicApiClient.post).not.toHaveBeenCalled();
  });

  it('chefLabels returns empty labels on 404', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(http(404));

    await expect(taxonomyApi.chefLabels(ID)).resolves.toEqual({
      menuItemId: ID,
      cuisines: [],
      diets: [],
      version: null,
    });
    expect(apiClient.get).toHaveBeenCalledWith(CHEF_ROUTE);
  });

  it('saveChefLabels sends If-Match with the version', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({
      data: {
        menuItemId: ID,
        cuisines: ['andhra'],
        diets: ['jain'],
        declaredBy: 'CHEF',
        updatedAt: '2026-11-01T10:00:00Z',
        version: 8,
      },
    });

    await expect(
      taxonomyApi.saveChefLabels(ID, {cuisines: ['andhra'], diets: ['jain']}, 7),
    ).resolves.toEqual({menuItemId: ID, cuisines: ['andhra'], diets: ['jain'], version: 8});
    expect(apiClient.put).toHaveBeenCalledWith(
      CHEF_ROUTE,
      {cuisines: ['andhra'], diets: ['jain']},
      {headers: {'If-Match': '"7"'}},
    );
  });

  it('saveChefLabels with nothing selected deletes', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({data: ''});

    await expect(
      taxonomyApi.saveChefLabels(ID, {cuisines: [], diets: []}, 7),
    ).resolves.toEqual({menuItemId: ID, cuisines: [], diets: [], version: null});
    expect(apiClient.delete).toHaveBeenCalledWith(CHEF_ROUTE);
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('saveChefLabels turns 412 into DishLabelsConflictError', async () => {
    (apiClient.put as jest.Mock).mockRejectedValue(http(412));

    await expect(
      taxonomyApi.saveChefLabels(ID, {cuisines: ['andhra'], diets: []}, 7),
    ).rejects.toBeInstanceOf(DishLabelsConflictError);
  });
});
