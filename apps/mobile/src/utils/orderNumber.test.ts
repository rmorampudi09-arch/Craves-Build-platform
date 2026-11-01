import {shortOrderNumber} from './orderNumber';

describe('shortOrderNumber', () => {
  it('is the first 8 characters of the id without dashes, like web', () => {
    expect(shortOrderNumber('0bde0000-0000-4000-8000-000000000101')).toBe('0BDE0000');
    expect(shortOrderNumber('ab-cd')).toBe('ABCD');
  });
});
