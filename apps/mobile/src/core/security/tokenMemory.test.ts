import {tokenMemory} from './tokenMemory';

describe('tokenMemory', () => {
  afterEach(() => {
    tokenMemory.clear();
    jest.restoreAllMocks();
  });

  it('keeps the access token only in process memory', () => {
    tokenMemory.set('access-token', 300);

    expect(tokenMemory.get()).toBe('access-token');
    expect(tokenMemory.isFresh()).toBe(true);

    tokenMemory.clear();
    expect(tokenMemory.get()).toBeNull();
    expect(tokenMemory.isFresh()).toBe(false);
  });

  it('marks the token stale before server expiry using the safety window', () => {
    const now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    tokenMemory.set('access-token', 60);
    expect(tokenMemory.isFresh()).toBe(true);

    nowSpy.mockReturnValue(now + 31_000);
    expect(tokenMemory.isFresh()).toBe(false);
  });

  it('treats short-lived tokens as immediately stale while retaining no persisted copy', () => {
    tokenMemory.set('short-token', 20);

    expect(tokenMemory.get()).toBe('short-token');
    expect(tokenMemory.isFresh()).toBe(false);
  });
});
