import {parseProcessRestorationSnapshot, toRestorationNavigatePayload} from './processRestoration';

describe('process restoration of the Chef Earnings tab', () => {
  it('restores Earnings and drops a snapshot saved under the old Analytics name', () => {
    const earnings = parseProcessRestorationSnapshot({
      version: 1,
      role: 'CHEF',
      target: {kind: 'CHEF_TAB', tab: 'Earnings'},
    });
    expect(earnings && toRestorationNavigatePayload(earnings)).toEqual({
      name: 'ChefTabs',
      params: {screen: 'Earnings'},
    });
    expect(
      parseProcessRestorationSnapshot({version: 1, role: 'CHEF', target: {kind: 'CHEF_TAB', tab: 'Analytics'}}),
    ).toBeNull();
  });
});
