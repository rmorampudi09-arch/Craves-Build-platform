import {chunkFavoriteHomeRelationships} from './favoriteHomeFeedApi';

const uuid = (value: number) => `00000000-0000-0000-0000-${value.toString().padStart(12, '0')}`;

describe('favoriteHomeFeedApi batching', () => {
  it('keeps each resolver batch at or below one hundred relationships', () => {
    const chefIdentityIds = Array.from({length: 70}, (_, index) => uuid(index + 1));
    const kitchenIds = Array.from({length: 70}, (_, index) => uuid(index + 101));
    const chunks = chunkFavoriteHomeRelationships({chefIdentityIds, kitchenIds});
    expect(chunks).toHaveLength(2);
    expect(chunks[0].chefIdentityIds.length + chunks[0].kitchenIds.length).toBe(100);
    expect(chunks[1].chefIdentityIds.length + chunks[1].kitchenIds.length).toBe(40);
  });

  it('deduplicates ids before batching', () => {
    const id = uuid(1);
    expect(chunkFavoriteHomeRelationships({chefIdentityIds: [id, id], kitchenIds: []})).toEqual([
      {chefIdentityIds: [id], kitchenIds: []},
    ]);
  });
});
