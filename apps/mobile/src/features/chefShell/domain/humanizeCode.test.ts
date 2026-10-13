import {humanizeCode} from './humanizeCode';

describe('humanizeCode', () => {
  it('turns a server code into words for the chef', () => {
    expect(humanizeCode('GOOD_PORTION')).toBe('Good portion');
    expect(humanizeCode('TASTY')).toBe('Tasty');
    expect(humanizeCode('OTHER_NEW_TYPE')).toBe('Other new type');
  });
});
