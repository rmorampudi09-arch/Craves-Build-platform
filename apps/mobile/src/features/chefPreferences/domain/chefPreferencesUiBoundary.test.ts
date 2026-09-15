import {
  CHEF_PREFERENCES_MODAL_CLOSED,
  closeChefPreferencesUnavailableModal,
  createChefPreferencesUiBoundary,
  getChefPreferencesUiItem,
  openChefPreferencesUnavailableModal,
} from './chefPreferencesUiBoundary';

describe('chef preferences P108 UI boundary', () => {
  it('keeps the full Guide-52 preference structure visible without fabricating persisted values', () => {
    const state = createChefPreferencesUiBoundary();

    expect(state.guideReference).toBe(52);
    expect(state.status).toBe('blocked');
    expect(state.persistence).toBe('undefined');
    expect(state.saveModel).toBe('unavailable');
    expect(state.sections.map(section => section.title)).toEqual([
      'Notifications',
      'Language & region',
      'Recipes',
      'Privacy',
      'Reminder interval',
      'Data & storage',
      'Appearance',
    ]);

    const items = state.sections.flatMap(section => section.items);
    expect(items).toHaveLength(9);
    expect(items.every(item => item.value === null)).toBe(true);
    expect(items.every(item => item.writeAllowed === false)).toBe(true);
    expect(items.every(item => item.interaction === 'explain-only')).toBe(true);
  });

  it('opens and dismisses the unavailable explanation modal without creating a local preference draft', () => {
    expect(CHEF_PREFERENCES_MODAL_CLOSED).toEqual({
      visible: false,
      capability: null,
    });
    expect(openChefPreferencesUnavailableModal('language')).toEqual({
      visible: true,
      capability: 'language',
    });
    expect(closeChefPreferencesUnavailableModal()).toEqual(
      CHEF_PREFERENCES_MODAL_CLOSED,
    );
  });

  it('keeps appearance/system theme visible but non-runnable until the shell runtime contract exists', () => {
    const state = createChefPreferencesUiBoundary();
    const appearance = getChefPreferencesUiItem(state, 'appearanceMode');

    expect(appearance).toMatchObject({
      label: 'Use System Setting',
      helperText: 'Use system theme',
      controlKind: 'toggle',
      availability: 'unavailable',
      value: null,
      writeAllowed: false,
    });
  });

  it('does not invent preparation-time, reminder, language or currency option catalogues', () => {
    const serialized = JSON.stringify(createChefPreferencesUiBoundary());

    expect(serialized).not.toContain('15 minutes');
    expect(serialized).not.toContain('30 minutes');
    expect(serialized).not.toContain('English (United States)');
    expect(serialized).not.toContain('INR');
  });
});
