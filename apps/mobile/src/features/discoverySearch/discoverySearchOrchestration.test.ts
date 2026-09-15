import {
  canRequestNextSearchPage,
  isDiscoverySearchActive,
  normalizeDiscoverySearchQuery,
} from './discoverySearchOrchestration';
import {
  discoverySearchActions,
  discoverySearchReducer,
} from './state/discoverySearchSlice';

describe('P37 discovery search orchestration', () => {
  it('normalizes whitespace without changing the user-facing search meaning', () => {
    expect(normalizeDiscoverySearchQuery('  biryani   bowl  ')).toBe('biryani bowl');
    expect(isDiscoverySearchActive('   ')).toBe(false);
    expect(isDiscoverySearchActive(' dosa ')).toBe(true);
  });

  it('keeps query and scroll restoration scoped to the current customer/location', () => {
    let state = discoverySearchReducer(undefined, {type: 'init'});
    state = discoverySearchReducer(
      state,
      discoverySearchActions.queryChanged({
        surface: 'CHEFS',
        scopeKey: 'customer-1:address-1',
        queryDraft: 'south indian',
      }),
    );
    state = discoverySearchReducer(
      state,
      discoverySearchActions.scrollOffsetSaved({
        surface: 'CHEFS',
        scopeKey: 'customer-1:address-1',
        scrollOffset: 420,
      }),
    );

    expect(state.sessions.CHEFS).toMatchObject({
      queryDraft: 'south indian',
      scrollOffset: 420,
    });

    state = discoverySearchReducer(
      state,
      discoverySearchActions.scopeChanged({
        surface: 'CHEFS',
        scopeKey: 'customer-1:address-2',
      }),
    );
    expect(state.sessions.CHEFS).toMatchObject({
      scopeKey: 'customer-1:address-2',
      queryDraft: '',
      scrollOffset: 0,
    });
  });

  it('resets result position when the search query changes', () => {
    let state = discoverySearchReducer(undefined, {type: 'init'});
    state = discoverySearchReducer(
      state,
      discoverySearchActions.scrollOffsetSaved({
        surface: 'HOME',
        scopeKey: 'customer-1:address-1',
        scrollOffset: 250,
      }),
    );
    state = discoverySearchReducer(
      state,
      discoverySearchActions.queryChanged({
        surface: 'HOME',
        scopeKey: 'customer-1:address-1',
        queryDraft: 'idli',
      }),
    );
    expect(state.sessions.HOME.scrollOffset).toBe(0);
  });

  it('prevents duplicate next-page work while a page or debounce is active', () => {
    expect(
      canRequestNextSearchPage({
        hasNextPage: true,
        isFetchingNextPage: false,
        isDebouncing: false,
      }),
    ).toBe(true);
    expect(
      canRequestNextSearchPage({
        hasNextPage: true,
        isFetchingNextPage: true,
        isDebouncing: false,
      }),
    ).toBe(false);
    expect(
      canRequestNextSearchPage({
        hasNextPage: true,
        isFetchingNextPage: false,
        isDebouncing: true,
      }),
    ).toBe(false);
  });
});
